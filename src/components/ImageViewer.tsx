/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable refs; React Compiler cannot model them. */
/**
 * ImageViewer - Full-Screen Image Viewer with Zoom, Pan, and Pagination
 * Uses native iOS PagerView for smooth horizontal image browsing.
 * Each page uses ScrollView for pinch-to-zoom.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Pressable,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  Alert,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withSpring,
  withTiming,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import PagerView from 'react-native-pager-view';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { SymbolView } from '@/components/ui/SymbolView';
import { GlassView } from '@/components/ui/GlassView';
import { hapticForScene } from '@/theme/hapticsMap';
import { saveImageToGallery, shareFile } from '@/services/media';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPreference } from '@/hooks/useAppPreference';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useNativeThumbnail } from '@/hooks/useNativeThumbnail';
import { thumbnailUrl, THUMB_LIST } from '@/utils/thumbnail';
import { useAuthStore } from '@/stores/authStore';
import { useLowPowerMode } from '../../modules/tieba-system/src';
import { Spacing } from '@/theme';
import { MOMENTUM, DURATION } from '@/theme/springs';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/** expo-image 全局磁盘缓存上限（字节）≈ 80MB，控制 <100MB 目标 */
const DISK_CACHE_LIMIT_BYTES = 80 * 1024 * 1024;
/** 全屏查看器内存图上限，超过后关闭时清空 expo-image 内存缓存 */
const MAX_FULL_RES_PAGES = 2;

/**
 * 窗口化：默认最多挂载 3 页（当前 ±1），仅"当前页"解码原图（active），
 * 邻近页只放 360px 服务端缩略图，滑到跟前再换原图——避免整条横滑
 * 把全部原图塞进内存。低功耗模式下 windowSize 降到 2（仅当前 ±1 的
 * 一侧），进一步节省电量与内存；不能降到 1，否则无法左右翻页。
 */
function buildPageWindow(images: string[], current: number, windowSize = 3) {
  const count = images.length;
  const radius = Math.max(0, Math.floor((windowSize - 1) / 2));
  const start = Math.max(0, Math.min(current - radius, count - windowSize));
  const end = Math.min(count, start + windowSize);
  const pages = images.slice(start, end).map((uri, i) => ({
    uri,
    index: start + i,
    active: start + i === current,
  }));
  return {
    pages,
    start,
    anchor: Math.min(Math.max(current - start, 0), Math.max(pages.length - 1, 0)),
  };
}

// ---------- Props ----------

export interface ImageViewerProps {
  images: string[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
  forumName?: string;
}

// ---------- ZoomableImage ----------

const ZoomableImage = memo(function ZoomableImage({
  uri,
  onSingleTap,
  onZoomChange,
  onLongPress,
  active,
}: {
  uri: string;
  onSingleTap: () => void;
  onZoomChange?: (zoomed: boolean) => void;
  /** 长按图片：回传长按点坐标（相对全屏图片容器 ≈ 屏幕坐标） */
  onLongPress?: (x: number, y: number) => void;
  active: boolean;
}) {
  const [isZoomed, setIsZoomed] = useState(false);
  const scale = useSharedValue(1);
  const baseScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startTranslateX = useSharedValue(0);
  const startTranslateY = useSharedValue(0);

  const resetTransform = useCallback(() => {
    scale.value = 1;
    baseScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
  }, [scale, baseScale, translateX, translateY]);

  useEffect(() => {
    resetTransform();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset zoom state when the displayed image changes.
    setIsZoomed(false);
  }, [uri, active, resetTransform]);

  // Notify the parent only when the zoomed threshold changes, not per frame.
  useAnimatedReaction(
    () => scale.value > 1.05,
    (zoomed, previous) => {
      if (zoomed !== previous) {
        runOnJS(onZoomChange ?? (() => {}))(zoomed);
      }
    },
  );

  const toggleZoom = useCallback(() => {
    const target = scale.value > 1.05 ? 1 : 3;
    scale.value = withSpring(target, MOMENTUM);
    baseScale.value = target;
    translateX.value = withSpring(0, MOMENTUM);
    translateY.value = withSpring(0, MOMENTUM);
    hapticForScene('toggle');
  }, [scale, baseScale, translateX, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(5, Math.max(1, baseScale.value * e.scale));
    })
    .onEnd(() => {
      baseScale.value = scale.value;
      if (scale.value <= 1.05) {
        scale.value = withSpring(1, MOMENTUM);
        baseScale.value = 1;
        translateX.value = withSpring(0, MOMENTUM);
        translateY.value = withSpring(0, MOMENTUM);
      }
    });

  const pan = Gesture.Pan()
    .enabled(isZoomed)
    .onStart(() => {
      startTranslateX.value = translateX.value;
      startTranslateY.value = translateY.value;
    })
    .onUpdate((e) => {
      const maxX = Math.max(0, (SCREEN_WIDTH * scale.value - SCREEN_WIDTH) / 2);
      const maxY = Math.max(0, (SCREEN_HEIGHT * scale.value - SCREEN_HEIGHT) / 2);
      translateX.value = Math.min(
        maxX,
        Math.max(-maxX, startTranslateX.value + e.translationX),
      );
      translateY.value = Math.min(
        maxY,
        Math.max(-maxY, startTranslateY.value + e.translationY),
      );
    })
    .onEnd(() => {
      startTranslateX.value = translateX.value;
      startTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((_e, success) => {
      if (success) {
        runOnJS(toggleZoom)();
      }
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd((_e, success) => {
      if (success) {
        runOnJS(onSingleTap)();
      }
    });

  // 长按：回传触点坐标（e.x/e.y 相对全屏手势容器，即屏幕坐标），
  // 供上层在长按位置弹出保存按钮。
  const longPress = Gesture.LongPress()
    .onEnd((e, success) => {
      if (success && onLongPress) {
        runOnJS(onLongPress)(e.x, e.y);
      }
    });

  const composedGesture = Gesture.Simultaneous(
    pinch,
    pan,
    Gesture.Exclusive(doubleTap, singleTap),
    longPress,
  );

  // 内存策略：仅当前页（active）解码原图（高优先级、带磁盘缓存上限），
  // 非激活页只放一张 360px 服务端缩略图，滑到跟前再换原图——避免整条
  // 图片横向滑动把全部原图塞进内存。
  const thumbUri = thumbnailUrl(uri, THUMB_LIST);

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[styles.zoomContainer, animatedStyle]}>
        {active ? (
          <Image
            source={{ uri }}
            style={styles.fullImage}
            contentFit="contain"
            preferHighDynamicRange
            transition={200}
            cachePolicy="memory-disk"
            priority="high"
            recyclingKey={uri}
            diskCacheLimit={DISK_CACHE_LIMIT_BYTES}
          />
        ) : (
          <Image
            source={{ uri: thumbUri }}
            style={styles.fullImage}
            contentFit="contain"
            transition={120}
            cachePolicy="memory-disk"
            recyclingKey={thumbUri}
            diskCacheLimit={DISK_CACHE_LIMIT_BYTES}
          />
        )}
      </Animated.View>
    </GestureDetector>
  );
});

// ---------- Native Thumbnail Cell ----------

const ThumbnailCell = memo(function ThumbnailCell({
  uri,
  index,
  currentIndex,
  active,
  onPress,
}: {
  uri: string;
  index: number;
  currentIndex: number;
  active: boolean;
  onPress: (index: number) => void;
}) {
  const thumbnailUri = useNativeThumbnail(uri, 56, 56);
  return (
    <Pressable
      onPress={() => onPress(index)}
      style={[
        styles.thumbnailWrapper,
        { borderColor: index === currentIndex ? '#FFFFFF' : 'transparent' },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`第${index + 1}张图片`}
    >
      {active && thumbnailUri ? (
        <Image
          source={{ uri: thumbnailUri }}
          style={styles.thumbnail}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.thumbnail, styles.thumbnailPlaceholder]} />
      )}
    </Pressable>
  );
});

// ---------- Main ImageViewer Component ----------

export default function ImageViewer({
  images,
  initialIndex = 0,
  visible,
  onClose,
  forumName,
}: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showUI, setShowUI] = useState(true);
  const [downloadProgress, setDownloadProgress] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  // 长按保存菜单：记录长按点坐标，按钮随位置弹出
  const [saveMenu, setSaveMenu] = useState<{ x: number; y: number } | null>(null);
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  const thumbnailRef = useRef<ScrollView>(null);

  // Watermark preference
  const imageWatermarkEnabled = useAppPreference('imageWatermarkEnabled', false);
  const imageWatermark = useAppPreference('imageWatermark', 'none');
  const account = useAuthStore((s) => s.account);
  const { reduceMotion } = useReducedMotion();
  const lowPowerMode = useLowPowerMode();

  const pageWindow = useMemo(
    // 低功耗只降到 2：windowSize=1 时 PagerView 只有当前页、无法左右滑动翻图。
    () => buildPageWindow(images, currentIndex, lowPowerMode ? 2 : 3),
    [images, currentIndex, lowPowerMode],
  );
  const { pages, start: pageWindowStart, anchor: pageWindowAnchor } = pageWindow;
  // 缩略条展示全部图片（仅大图 PagerView 走窗口化），实现长图集可直接跳到远端图。

  const getWatermarkText = useCallback(
    (forumName?: string) => {
      switch (imageWatermark) {
        case 'username':
          return account?.name ?? '';
        case 'forum_name':
          return forumName ?? '';
        default:
          return '';
      }
    },
    [imageWatermark, account],
  );
  const watermarkText = imageWatermarkEnabled ? getWatermarkText(forumName) : '';

  // Overlay opacity animation
  const overlayOpacity = useSharedValue(1);
  // Drag-to-dismiss translation (iOS Photos style)
  const dragTranslateY = useSharedValue(0);
  // Entrance animation for the image (scale 0.95→1, opacity 0→1)
  const enterScale = useSharedValue(1);
  const enterOpacity = useSharedValue(1);
  // Exit animation (scale→0.8 + opacity→0, 180ms) before unmounting
  const exitScale = useSharedValue(1);
  const exitOpacity = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(overlayOpacity);
    if (reduceMotion) {
      overlayOpacity.value = withTiming(showUI ? 1 : 0, { duration: DURATION.enter });
    } else {
      overlayOpacity.value = withSpring(showUI ? 1 : 0, MOMENTUM);
    }
  }, [showUI, reduceMotion, overlayOpacity]);

  // Reset index when modal opens; clear expo-image memory cache when a long
  // gallery (full-res pages > threshold) is dismissed.
  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset viewer state when the modal opens.
      setCurrentIndex(initialIndex);
      setShowUI(true);
      setIsZoomed(false);
      overlayOpacity.value = 1;
      dragTranslateY.value = 0;
      exitScale.value = 1;
      exitOpacity.value = 1;
      // Entrance animation (iOS Photos style). Respect reduced motion.
      if (reduceMotion) {
        enterScale.value = 1;
        enterOpacity.value = 1;
      } else {
        enterScale.value = 0.95;
        enterOpacity.value = 0;
        enterScale.value = withTiming(1, { duration: DURATION.enter });
        enterOpacity.value = withTiming(1, { duration: DURATION.enter });
      }
    } else if (images.length > MAX_FULL_RES_PAGES) {
      // Modal 已关闭且图片较多：清空内存缓存释放解码的原图
      Image.clearMemoryCache().catch(() => {});
    }
  }, [visible, initialIndex, overlayOpacity, dragTranslateY, enterScale, enterOpacity, exitScale, exitOpacity, reduceMotion, images.length]);

  // Scroll thumbnail strip to current item
  useEffect(() => {
    const thumbWidth = 56 + 6;
    thumbnailRef.current?.scrollTo({
      x: Math.max(0, currentIndex * thumbWidth - SCREEN_WIDTH / 2 + thumbWidth / 2),
      animated: true,
    });
  }, [currentIndex]);

  // Keep the windowed PagerView centered on the current page so only the
  // current ±1 pages stay mounted.
  useEffect(() => {
    if (visible && pagerRef.current) {
      pagerRef.current.setPageWithoutAnimation(pageWindowAnchor);
    }
  }, [currentIndex, visible, pageWindowAnchor]);

  const topBarAnimStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  // Entrance style applied to the image pager (scale + fade in).
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enterOpacity.value,
    transform: [{ scale: enterScale.value }],
  }));

  // iOS 26 Photos-style close: content scale→0.8 + opacity→0 (180ms) then
  // unmount. Reduced motion users skip the animation.
  const closeViewer = useCallback(() => {
    if (reduceMotion) {
      onClose();
      return;
    }
    cancelAnimation(exitScale);
    cancelAnimation(exitOpacity);
    exitScale.value = withTiming(0.8, { duration: DURATION.exit });
    exitOpacity.value = withTiming(0, { duration: DURATION.exit }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  }, [reduceMotion, onClose, exitScale, exitOpacity]);

  const exitStyle = useAnimatedStyle(() => ({
    opacity: exitOpacity.value,
    transform: [{ scale: exitScale.value }],
  }));

  // iOS 26 Photos-style drag-to-dismiss. The pan only activates on vertical
  // movement (activeOffsetY) so PagerView keeps horizontal swipes; while the
  // image is zoomed the gesture is disabled and the zoomed ScrollView pans.
  const dismissStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragTranslateY.value }],
    opacity: 1 - Math.min(Math.abs(dragTranslateY.value) / (SCREEN_HEIGHT * 0.6), 0.6),
  }));

  const dismissGesture = Gesture.Pan()
    .enabled(!isZoomed)
    .activeOffsetY([-14, 14])
    .onUpdate((e) => {
      dragTranslateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 140 || e.velocityY > 900) {
        dragTranslateY.value = withTiming(
          SCREEN_HEIGHT,
          { duration: DURATION.exit },
          (finished) => {
            if (finished) runOnJS(onClose)();
          },
        );
      } else {
        dragTranslateY.value = withSpring(0, MOMENTUM);
      }
    });

  const toggleUI = useCallback(() => {
    // 单击图片：收起长按菜单 + 切换顶/底栏显隐
    setSaveMenu(null);
    setShowUI((prev) => !prev);
  }, []);

  const handleLongPress = useCallback((x: number, y: number) => {
    hapticForScene('press');
    setSaveMenu({ x, y });
  }, []);

  const handleClose = useCallback(() => {
    hapticForScene('press');
    closeViewer();
  }, [closeViewer]);

  const handlePageSelected = useCallback(
    (e: any) => {
      hapticForScene('toggle');
      setCurrentIndex(e.nativeEvent.position + pageWindowStart);
    },
    [pageWindowStart],
  );

  const handleThumbnailPress = useCallback(
    (idx: number) => {
      const localIndex = idx - pageWindowStart;
      if (localIndex >= 0 && localIndex < pages.length) {
        // 目标页在当前窗口内：直接翻页（窗口随滑动重建）
        pagerRef.current?.setPage(localIndex);
      } else {
        // 目标页在当前窗口外（缩略条可跳远图）：直接更新 currentIndex，
        // 窗口围绕新页重建，再交给 setPageWithoutAnimation 对齐到新 anchor。
        setCurrentIndex(idx);
      }
    },
    [pageWindowStart, pages.length],
  );

  // Download and share image
  const handleSaveToGallery = useCallback(async () => {
    const uri = images[currentIndex];
    if (!uri) return;
    setDownloadProgress(true);
    try {
      const wm = getWatermarkText(forumName);
      await saveImageToGallery(uri, imageWatermarkEnabled ? wm : '');
      hapticForScene('action-success');
      Alert.alert('已保存', wm ? `图片已保存到相册（水印: ${wm}）` : '图片已保存到相册');
    } catch (e: any) {
      if (e?.message === 'PERMISSION_DENIED') {
        Alert.alert('权限不足', '请在设置中允许访问相册以保存图片');
        return;
      }
      Alert.alert('保存失败', e?.message || '无法保存图片到相册');
    } finally {
      setDownloadProgress(false);
    }
  }, [images, currentIndex, getWatermarkText, imageWatermarkEnabled, forumName]);

  // Share image
  const handleShare = useCallback(async () => {
    hapticForScene('press');
    const uri = images[currentIndex];
    if (!uri) return;
    try {
      const filename = uri.split('/').pop()?.split('?')[0] ?? `image_${Date.now()}.jpg`;
      const watermark = getWatermarkText(forumName);
      await shareFile(uri, `share_${filename}`, {
        mimeType: 'image/jpeg',
        dialogTitle: watermark ? `分享图片 — ${watermark}` : '分享图片',
        watermarkText: imageWatermarkEnabled ? watermark : '',
      });
    } catch (e: any) {
      if (e?.message === 'SHARE_UNAVAILABLE') {
        Alert.alert('提示', '当前设备不支持分享功能');
      }
    }
  }, [images, currentIndex, getWatermarkText, imageWatermarkEnabled, forumName]);

  // 长按菜单保存：复用顶栏保存逻辑，保存后收起菜单
  const handleSaveMenuPress = useCallback(() => {
    setSaveMenu(null);
    handleSaveToGallery();
  }, [handleSaveToGallery]);

  if (images.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closeViewer}
      supportedOrientations={['portrait', 'landscape']}
    >
      <GestureDetector gesture={dismissGesture}>
      <Animated.View style={[styles.modalContainer, dismissStyle, exitStyle]}>
        <StatusBar style="light" />

        {/* Image Gallery — native iOS PagerView */}
        <Animated.View style={[styles.pagerWrap, enterStyle]}>
          <PagerView
            ref={pagerRef}
            style={styles.pager}
            initialPage={pageWindowAnchor}
            scrollEnabled={!isZoomed}
            onPageSelected={handlePageSelected}
            overdrag
          >
            {pages.map((page) => (
              <View key={String(page.index)} collapsable={false} style={styles.imagePage}>
                <ZoomableImage
                  uri={page.uri}
                  onSingleTap={toggleUI}
                  onZoomChange={setIsZoomed}
                  onLongPress={handleLongPress}
                  active={page.active}
                />
                {watermarkText ? (
                  <Text
                    pointerEvents="none"
                    style={styles.watermarkOverlay}
                    numberOfLines={1}
                  >
                    {watermarkText}
                  </Text>
                ) : null}
              </View>
            ))}
          </PagerView>
        </Animated.View>

        {/* 长按保存按钮：定位在长按点附近（clamp 到屏幕内） */}
        {saveMenu && (
          <Pressable
            onPress={handleSaveMenuPress}
            style={[
              styles.saveMenuButton,
              {
                left: Math.min(Math.max(saveMenu.x - 68, 16), SCREEN_WIDTH - 152),
                top: Math.min(Math.max(saveMenu.y - 30, 76), SCREEN_HEIGHT - 96),
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="保存图片到相册"
          >
            <GlassView theme="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(28,28,30,0.88)' }]} />
            <SymbolView name="square.and.arrow.down" size={17} weight="semibold" tintColor="#FFFFFF" />
            <Text style={styles.saveMenuText}>保存到相册</Text>
          </Pressable>
        )}

        {/* Top Bar */}
        <Animated.View
          style={[styles.topBar, { paddingTop: Math.max(insets.top, 30) }, topBarAnimStyle]}
          pointerEvents={showUI ? 'auto' : 'none'}
        >
          <GlassView
            theme="dark"
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
          />
          <Pressable
            onPress={handleClose}
            style={styles.topBarButton}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="关闭图片查看器"
          >
            <SymbolView name="xmark" size={22} weight="bold" tintColor="#FFFFFF" />
          </Pressable>

          <Text style={styles.counterText} accessibilityLiveRegion="polite">
            {currentIndex + 1}/{images.length}
          </Text>

          <View style={styles.topBarActions}>
            <Pressable
              onPress={handleSaveToGallery}
              style={styles.topBarButton}
              hitSlop={12}
              disabled={downloadProgress}
              accessibilityRole="button"
              accessibilityLabel="保存到相册"
            >
              <SymbolView
                name="square.and.arrow.down"
                size={22}
                weight="medium"
                tintColor={downloadProgress ? 'rgba(255,255,255,0.4)' : '#FFFFFF'}
              />
            </Pressable>
            <Pressable
              onPress={handleShare}
              style={styles.topBarButton}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="分享图片"
            >
              <SymbolView name="square.and.arrow.up" size={22} weight="medium" tintColor="#FFFFFF" />
            </Pressable>
          </View>
        </Animated.View>

        {/* Bottom Thumbnail Strip */}
        {images.length > 1 && (
          <Animated.View
            style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }, topBarAnimStyle]}
            pointerEvents={showUI ? 'auto' : 'none'}
          >
            <GlassView
              theme="dark"
              style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
            />
            <ScrollView
              ref={thumbnailRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbnailStrip}
            >
              {images.map((uri, index) => (
                <ThumbnailCell
                  key={index}
                  uri={uri}
                  index={index}
                  currentIndex={currentIndex}
                  active={Math.abs(index - currentIndex) <= 1}
                  onPress={handleThumbnailPress}
                />
              ))}
            </ScrollView>
          </Animated.View>
        )}
      </Animated.View>
      </GestureDetector>
    </Modal>
  );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  pager: {
    flex: 1,
  },
  pagerWrap: {
    flex: 1,
  },
  imagePage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  fullImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  watermarkOverlay: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    maxWidth: '70%',
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  saveMenuButton: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 24,
    overflow: 'hidden',
    zIndex: 30,
  },
  saveMenuText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  topBarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: Spacing.sm,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  thumbnailStrip: {
    paddingHorizontal: Spacing.md,
    gap: 6,
  },
  thumbnailWrapper: {
    width: 56,
    height: 56,
    borderRadius: 6,
    borderWidth: 2,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
