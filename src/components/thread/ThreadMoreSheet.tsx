/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable refs; React Compiler cannot model them. */
/**
 * Thread More Menu — native bottom sheet hosted by the thread detail page.
 *
 * Toggle actions call the parent page's handlers directly. One-off actions
 * (share, copy, report, delete) are handled here, reusing the previous menu
 * screen's API calls and navigation semantics.
 */

import { useCallback, useRef, type ReactNode } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheetComponent, { BottomSheetScrollView } from '@expo/ui/community/bottom-sheet';
import type { BottomSheet } from '@expo/ui/community/bottom-sheet';
import { SymbolView } from '@/components/ui/SymbolView';
import { useThemeColors } from '@/theme/ThemeContext';
import { useThreadActions } from '@/services/threadActions';
import { hapticForScene } from '@/theme/hapticsMap';
import { PRESS_ENTER, PRESS_SCALE } from '@/theme/springs';
import { Radius } from '@/theme/spacing';

/**
 * Sheet 菜单行：iOS 原生按压反馈。
 * onPressIn 用 PRESS_ENTER 弹簧快速起压（0.98），松手回弹，轻量化逐行动画。
 */
function MoreSheetRow({
  onPress,
  children,
}: {
  onPress: () => void;
  children: ReactNode;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(PRESS_SCALE.default, PRESS_ENTER);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, PRESS_ENTER);
      }}
    >
      <Animated.View style={[styles.item, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
interface ThreadMoreSheetProps {
  visible: boolean;
  onClose: () => void;
  threadId: string;
  forumId?: string;
  forumName?: string;
  authorId?: string;
  canDelete: boolean;
  isLoggedIn: boolean;
  seeLz: boolean;
  isCollected: boolean;
  immersive: boolean;
  reverse: boolean;
  onToggleSeeLz: () => void;
  onToggleCollect: () => void;
  onToggleImmersive: () => void;
  onToggleSort: () => void;
  onJumpToPage: () => void;
}

export default function ThreadMoreSheet({
  visible,
  onClose,
  threadId,
  forumId,
  forumName,
  canDelete,
  isLoggedIn,
  seeLz,
  isCollected,
  immersive,
  reverse,
  onToggleSeeLz,
  onToggleCollect,
  onToggleImmersive,
  onToggleSort,
  onJumpToPage,
}: ThreadMoreSheetProps) {
  const sheetRef = useRef<BottomSheet>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useThemeColors();
  const pendingActionRef = useRef<(() => void) | null>(null);
  const actions = useThreadActions({ threadId, forumId, forumName });
  const { share, copy, report, remove } = actions;

  // 注意：sheet-present（Soft）震动由调用点 thread/[id].tsx 的"更多"按钮
  // 既有 hapticForScene('sheet-present') 触发（与 explore.tsx 单点触发先例一致），
  // 组件内不再重复触发，避免点击一次连续两次 Soft 震动。

  const runAfterClose = useCallback((action: () => void) => {
    if (!sheetRef.current) {
      onClose();
      action();
      return;
    }
    pendingActionRef.current = action;
    sheetRef.current.close();
  }, [onClose]);

  const handleSheetClosed = useCallback(() => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    onClose();
    action?.();
  }, [onClose]);

  const handleToggleSeeLz = useCallback(() => {
    hapticForScene('press');
    onClose();
    onToggleSeeLz();
  }, [onClose, onToggleSeeLz]);

  const handleToggleCollect = useCallback(() => {
    hapticForScene('press');
    if (!isLoggedIn) {
      Alert.alert('提示', '请先登录');
      return;
    }
    onClose();
    onToggleCollect();
  }, [isLoggedIn, onClose, onToggleCollect]);

  const handleToggleImmersive = useCallback(() => {
    hapticForScene('press');
    onClose();
    onToggleImmersive();
  }, [onClose, onToggleImmersive]);

  const handleToggleSort = useCallback(() => {
    hapticForScene('press');
    onClose();
    onToggleSort();
  }, [onClose, onToggleSort]);

  const handleJumpToPage = useCallback(() => {
    hapticForScene('press');
    runAfterClose(onJumpToPage);
  }, [runAfterClose, onJumpToPage]);

  const handleShare = useCallback(() => {
    hapticForScene('press');
    runAfterClose(() => share());
  }, [runAfterClose, share]);

  const handleCopyLink = useCallback(() => {
    hapticForScene('press');
    runAfterClose(async () => {
      if (await copy()) {
        Alert.alert('已复制', '链接已复制到剪贴板');
      }
    });
  }, [runAfterClose, copy]);

  const handleReport = useCallback(() => {
    hapticForScene('press');
    Alert.alert('举报', '确定要举报这条帖子吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定',
        style: 'destructive',
        onPress: async () => {
          runAfterClose(() => report(threadId));
        },
      },
    ]);
  }, [threadId, report, runAfterClose]);

  const handleDelete = useCallback(() => {
    hapticForScene('press');
    Alert.alert('删除', '确定要删除这条帖子吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          if (await remove(threadId)) {
            runAfterClose(() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.dismiss();
              }
            });
          }
        },
      },
    ]);
  }, [threadId, remove, runAfterClose, router]);

  const groupBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(120,120,128,0.08)';

  return (
    <BottomSheetComponent
      ref={sheetRef}
      index={visible ? 0 : -1}
      snapPoints={['45%', '75%']}
      enablePanDownToClose
      onClose={handleSheetClosed}
    >
      <BottomSheetScrollView
        style={styles.scrollContainer}
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces
      >
        {/* Toggle group */}
        <View style={[styles.group, { backgroundColor: groupBg }]}>
          <MoreSheetRow onPress={handleToggleSeeLz}>
            <View style={[styles.iconCircle, { backgroundColor: seeLz ? 'rgba(0,122,255,0.12)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(120,120,128,0.06)') }]}>
              <SymbolView name={seeLz ? 'person.fill' : 'person'} size={18} tintColor={seeLz ? colors.primary : colors.text} />
            </View>
            <Text style={[styles.itemText, { color: seeLz ? colors.primary : colors.text }]}>只看楼主</Text>
          </MoreSheetRow>
          <View style={[styles.separator, { backgroundColor: colors.divider }]} />
          <MoreSheetRow onPress={handleToggleCollect}>
            <View style={[styles.iconCircle, { backgroundColor: isCollected ? 'rgba(255,204,0,0.12)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(120,120,128,0.06)') }]}>
              <SymbolView name={isCollected ? 'star.fill' : 'star'} size={18} tintColor={isCollected ? '#FFCC00' : colors.text} />
            </View>
            <Text style={[styles.itemText, { color: isCollected ? '#FFCC00' : colors.text }]}>{isCollected ? '已收藏' : '收藏'}</Text>
          </MoreSheetRow>
          <View style={[styles.separator, { backgroundColor: colors.divider }]} />
          <MoreSheetRow onPress={handleToggleImmersive}>
            <View style={[styles.iconCircle, { backgroundColor: immersive ? 'rgba(52,199,89,0.12)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(120,120,128,0.06)') }]}>
              <SymbolView name="doc.plaintext" size={18} tintColor={immersive ? '#34C759' : colors.text} />
            </View>
            <Text style={[styles.itemText, { color: immersive ? '#34C759' : colors.text }]}>沉浸阅读</Text>
          </MoreSheetRow>
          <View style={[styles.separator, { backgroundColor: colors.divider }]} />
          <MoreSheetRow onPress={handleToggleSort}>
            <View style={[styles.iconCircle, { backgroundColor: reverse ? 'rgba(175,82,222,0.12)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(120,120,128,0.06)') }]}>
              <SymbolView name="arrow.up.arrow.down" size={18} tintColor={reverse ? '#AF52DE' : colors.text} />
            </View>
            <Text style={[styles.itemText, { color: reverse ? '#AF52DE' : colors.text }]}>{reverse ? '正序浏览' : '倒序浏览'}</Text>
          </MoreSheetRow>
          <View style={[styles.separator, { backgroundColor: colors.divider }]} />
          <MoreSheetRow onPress={handleJumpToPage}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(0,122,255,0.12)' }]}>
              <SymbolView name="arrow.right.to.line" size={18} tintColor={colors.primary} />
            </View>
            <Text style={[styles.itemText, { color: colors.text }]}>跳转页码</Text>
          </MoreSheetRow>
        </View>

        {/* Action group */}
        <View style={[styles.group, { backgroundColor: groupBg }]}>
          <MoreSheetRow onPress={handleShare}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(0,122,255,0.12)' }]}>
              <SymbolView name="square.and.arrow.up" size={18} tintColor={colors.primary} />
            </View>
            <Text style={[styles.itemText, { color: colors.text }]}>分享</Text>
          </MoreSheetRow>
          <View style={[styles.separator, { backgroundColor: colors.divider }]} />
          <MoreSheetRow onPress={handleCopyLink}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(0,122,255,0.12)' }]}>
              <SymbolView name="link" size={18} tintColor={colors.primary} />
            </View>
            <Text style={[styles.itemText, { color: colors.text }]}>复制链接</Text>
          </MoreSheetRow>
          <View style={[styles.separator, { backgroundColor: colors.divider }]} />
          <MoreSheetRow onPress={handleReport}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(255,149,0,0.12)' }]}>
              <SymbolView name="exclamationmark.triangle" size={18} tintColor="#FF9500" />
            </View>
            <Text style={[styles.itemText, { color: colors.text }]}>举报</Text>
          </MoreSheetRow>
          {canDelete && (
            <>
              <View style={[styles.separator, { backgroundColor: colors.divider }]} />
              <MoreSheetRow onPress={handleDelete}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(255,59,48,0.12)' }]}>
                  <SymbolView name="trash" size={18} tintColor={colors.error} />
                </View>
                <Text style={[styles.itemText, { color: colors.error }]}>删除</Text>
              </MoreSheetRow>
            </>
          )}
        </View>

        {/* Cancel group */}
        <Pressable
          style={[styles.cancelGroup, { backgroundColor: groupBg }]}
          onPress={() => {
            hapticForScene('press');
            onClose();
          }}
        >
          <Text style={[styles.cancelText, { color: colors.textSecondary }]}>取消</Text>
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheetComponent>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  group: {
    borderRadius: Radius.input,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: 17,
    fontWeight: '400',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 62,
  },
  cancelGroup: {
    borderRadius: Radius.input,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '600',
  },
});
