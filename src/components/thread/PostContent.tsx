/**
 * PostContent Renderer
 * Renders tieba post content: text, emoji, images, video, audio, links, @mentions, topics.
 * Migrated from PbContentRender.kt
 *
 * Layout strategy (iOS 26 card style):
 *  1. All inline segments (text / emoji / emoticon / @ / topic / link / linebreak)
 *     flow together in one wrapping text block — rendered FIRST.
 *  2. Block-level media (video / audio / poll) render below the text.
 *  3. ALL images are extracted from the content array and rendered as a single
 *     grid block at the bottom — images always sit on their own lines,
 *     never inline after text.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SymbolView } from '@/components/ui/SymbolView';
import { hapticForScene } from '@/theme/hapticsMap';
import { openLink } from '@/utils/linkOpener';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useThemeColors } from '@/theme/ThemeContext';
import { useAppPreference } from '@/hooks/useAppPreference';
import { useBlockFilter } from '@/hooks/useBlockFilter';
import { useAuthStore } from '@/stores/authStore';
import { saveImageToGallery, shareFile } from '@/services/media';
import { EMOTICON_NAME_MAP, buildEmoticonSrc } from '@/constants/emoticons';
import { thumbnailUrl, THUMB_POST } from '@/utils/thumbnail';
import { Radius } from '@/theme/spacing';
import type { PostContent as PostContentType, PollOption } from '@/types';
import { TiebaRichText, type TiebaRichTextRun } from '../../../modules/tieba-native/src/TiebaRichText';
import { TiebaAudioWaveform } from '../../../modules/tieba-native/src/TiebaAudioWaveform';

/** Gap between images in the extracted image grid */
const IMAGE_GAP = 8;
/** Corner radius for every image cell */
const IMAGE_RADIUS = Radius.input;
/**
 * Max rendered height for a solo image。竖长截图（贴吧高频内容）在旧上限
 * 300pt + contentFit="cover" 下会被裁成中间一条无法预览；放宽到约 1.6 屏
 * 内容宽（≈480pt），超出部分点击进查看器看全图。
 */
const SINGLE_IMAGE_MAX_HEIGHT = 480;
/** Horizontal padding/margins around PostContent in thread detail cards. */
const CONTENT_HORIZONTAL_INSET = 64;

/** Static audio waveform bar heights — avoids Math.random() jitter on each render */
const AUDIO_WAVEFORM_BARS = [12, 18, 8, 22, 14, 20, 10, 24, 16, 6, 19, 13, 21, 9, 17];

// ---------- Props ----------

interface PostContentProps {
  content: PostContentType[];
  forumName?: string;
  onImagePress?: (images: string[], index: number) => void;
  onLinkPress?: (url: string) => void;
  onUserPress?: (uid: string) => void;
  onTopicPress?: (topicId: string, topicName: string) => void;
  onVote?: (optionIndex: number) => void;
  onVoteMulti?: (optionIndexes: number[]) => void;
}

// ---------- Emoticon Text Splitting ----------

type TextOrEmoticon = { type: 'text'; text: string } | { type: 'emoticon'; text: string; src: string };

function splitTextWithEmoticons(text: string): TextOrEmoticon[] {
  const segments: TextOrEmoticon[] = [];
  // Match #(name), [name], or (#name) patterns for tieba emoticons
  const regex = /#\(([^)]+)\)|\((#[^)]+)\)|\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }
    // Extract the emoticon name from whichever group matched
    let name = match[1] || ''; // #(name)
    if (!name && match[2]) name = match[2].slice(1); // (#name) -> strip leading #
    if (!name && match[3]) name = match[3]; // [name]
    const num = EMOTICON_NAME_MAP[name];
    if (num) {
      segments.push({
        type: 'emoticon',
        text: name,
        src: buildEmoticonSrc(num),
      });
    } else {
      // Unknown emoticon name, keep as original text
      segments.push({ type: 'text', text: match[0] });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', text }];
}

// ---------- Image Segment (extracted grid block) ----------

function ImageSegment({
  images,
  contentWidth,
  watermarkText,
  onPress,
  dimmed = false,
  style,
}: {
  images: { src: string; width: number; height: number; originSrc?: string }[];
  contentWidth: number;
  watermarkText?: string;
  onPress?: (images: string[], index: number) => void;
  dimmed?: boolean;
  style?: any;
}) {
  const { colors } = useThemeColors();
  const count = images.length;
  const imageLoadType = useAppPreference('imageLoadType', 'smart_load');
  // 多图横向分页当前页（页码点高亮）
  const [pagerPage, setPagerPage] = useState(0);

  // 单图 → 全宽按宽高比（高度钳制）；多图分页每页同此尺寸，左右滑动看缩略图
  const pageDim = (img: { width: number; height: number }) => {
    const aspectRatio = img.width > 0 && img.height > 0 ? img.width / img.height : 1;
    const height = Math.min(contentWidth / aspectRatio, SINGLE_IMAGE_MAX_HEIGHT);
    return { width: contentWidth, height };
  };

  // Limit to 9 images
  const displayImages = images.slice(0, 9);
  const remainingCount = images.length - 9;

  /** Save a single image to the device photo gallery */
  const handleSaveImage = useCallback(async (uri: string) => {
    try {
      await saveImageToGallery(uri, watermarkText ?? '');
      hapticForScene('action-success');
      Alert.alert('已保存', '图片已保存到相册');
    } catch (e: any) {
      if (e?.message === 'PERMISSION_DENIED') {
        Alert.alert('权限不足', '请在设置中允许访问相册以保存图片');
        return;
      }
      Alert.alert('保存失败', '无法保存图片到相册');
    }
  }, [watermarkText]);

  if (contentWidth <= 0) return null;

  // When image loading is disabled entirely, show placeholders
  if (imageLoadType === 'all_no') {
    return (
      <View style={[styles.imageGrid, style]}>
        {displayImages.map((img, idx) => {
          const dims = pageDim(img);
          return (
            <View
              key={idx}
              style={[
                styles.imagePlaceholder,
                {
                  width: dims.width,
                  height: dims.height,
                  backgroundColor: colors.placeholder,
                  borderColor: colors.divider,
                },
              ]}
            >
              <SymbolView name="photo" size={24} tintColor={colors.textDisabled} />
              {idx === 8 && remainingCount > 0 && (
                <View style={styles.imageOverlay}>
                  <Text style={styles.imageOverlayText}>
                    +{remainingCount}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  }

  // Normal image rendering — smart_origin, smart_load, all_origin
  // 多图 → 横向分页滑动查看缩略图（无需点开）；单图 → 全宽按宽高比
  if (count > 1) {
    return (
      <View style={[styles.imagePagerWrap, style]}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          nestedScrollEnabled
          onMomentumScrollEnd={(e) => {
            const page = Math.round(e.nativeEvent.contentOffset.x / Math.max(contentWidth, 1));
            setPagerPage(Math.min(Math.max(page, 0), displayImages.length - 1));
          }}
        >
          {displayImages.map((img, idx) => {
            const dims = pageDim(img);
            const useOriginal = imageLoadType === 'original';
            const imageUri = useOriginal
              ? (img.originSrc || img.src)
              : thumbnailUrl(img.src, THUMB_POST);
            return (
              <Pressable
                key={idx}
                onPress={() => {
                  hapticForScene('press');
                  onPress?.(images.map((i) => i.originSrc || i.src), idx);
                }}
                onLongPress={() => {
                  hapticForScene('press');
                  Alert.alert('图片', '', [
                    {
                      text: '查看大图',
                      onPress: () => {
                        hapticForScene('press');
                        onPress?.(images.map((i) => i.originSrc || i.src), idx);
                      },
                    },
                    {
                      text: '保存图片',
                      onPress: () => handleSaveImage(imageUri),
                    },
                    { text: '取消', style: 'cancel' },
                  ]);
                }}
                style={[
                  styles.imageWrapper,
                  {
                    width: dims.width,
                    height: dims.height,
                    backgroundColor: colors.placeholder,
                  },
                ]}
              >
                <Image
                  cachePolicy="memory-disk" source={{ uri: imageUri }}
                  style={[styles.image, dimmed && { opacity: 0.6 }]}
                  contentFit="cover"
                  transition={200}
                  recyclingKey={imageUri}
                />
                {idx === 8 && remainingCount > 0 && (
                  <View style={styles.imageOverlay}>
                    <Text style={styles.imageOverlayText}>
                      +{remainingCount}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
        {/* 页码点：当前页高亮加宽 */}
        <View style={styles.pagerDots} pointerEvents="none">
          {displayImages.map((_, i) => (
            <View
              key={i}
              style={[
                styles.pagerDot,
                i === pagerPage && styles.pagerDotActive,
                { backgroundColor: i === pagerPage ? colors.primary : colors.textTertiary },
              ]}
            />
          ))}
        </View>
      </View>
    );
  }

  // 单图
  const single = images[0];
  const dims = pageDim(single);
  const useOriginalSingle = imageLoadType === 'original';
  const singleUri = useOriginalSingle
    ? (single.originSrc || single.src)
    : thumbnailUrl(single.src, THUMB_POST);
  return (
    <Pressable
      style={[
        styles.imageWrapper,
        {
          width: dims.width,
          height: dims.height,
          backgroundColor: colors.placeholder,
        },
        style,
      ]}
      onPress={() => {
        hapticForScene('press');
        onPress?.(images.map((i) => i.originSrc || i.src), 0);
      }}
      onLongPress={() => {
        hapticForScene('press');
        Alert.alert('图片', '', [
          {
            text: '查看大图',
            onPress: () => {
              hapticForScene('press');
              onPress?.(images.map((i) => i.originSrc || i.src), 0);
            },
          },
          {
            text: '保存图片',
            onPress: () => handleSaveImage(singleUri),
          },
          { text: '取消', style: 'cancel' },
        ]);
      }}
    >
      <Image
        cachePolicy="memory-disk" source={{ uri: singleUri }}
        style={[styles.image, dimmed && { opacity: 0.6 }]}
        contentFit="cover"
        transition={200}
        recyclingKey={singleUri}
      />
    </Pressable>
  );
}
// ---------- Video Segment ----------

/**
 * Player is created only after the user taps play. Unmounting this child
 * releases the expo-video player with it.
 */
function ActiveVideo({
  src,
  effectiveWidth,
  effectiveHeight,
  expanded,
  onEnded,
  onToggleExpanded,
}: {
  src: string;
  effectiveWidth: number;
  effectiveHeight: number;
  expanded: boolean;
  onEnded: () => void;
  onToggleExpanded: () => void;
}) {
  const player = useVideoPlayer(null, (p) => {
    p.muted = true;
    p.loop = false;
  });

  // Start playback once the child mounts after a user tap.
  useEffect(() => {
    player.replace({
      uri: src,
      headers: { Referer: 'https://tieba.baidu.com/' },
    });
    player.play();
  }, [player, src]);

  // Listen for playback end → reset to poster
  useEffect(() => {
    const sub = player.addListener('playToEnd', onEnded);
    return () => sub.remove();
  }, [player, onEnded]);

  // Pause on unmount
  useEffect(() => {
    return () => { player.pause(); };
  }, [player]);

  return (
    <View
      style={[
        styles.videoWrapper,
        {
          width: effectiveWidth,
          height: effectiveHeight,
          backgroundColor: '#000',
        },
      ]}
    >
      <VideoView
        player={player}
        style={styles.videoPlayer}
        nativeControls
        contentFit="contain"
      />
      <Pressable
        onPress={onToggleExpanded}
        style={styles.expandButton}
        accessibilityLabel={expanded ? '缩小视频' : '放大视频'}
        accessibilityRole="button"
      >
        <SymbolView
          name={expanded ? 'arrow.down.right.and.arrow.up.left' : 'arrow.up.left.and.arrow.down.right'}
          size={14}
          tintColor="rgba(255,255,255,0.9)"
        />
      </Pressable>
    </View>
  );
}

function VideoSegment({
  src,
  poster,
  width,
  height,
  contentWidth,
}: {
  src: string;
  poster: string;
  width: number;
  height: number;
  contentWidth: number;
}) {
  const { colors } = useThemeColors();
  const [isPlaying, setIsPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const aspectRatio = width > 0 && height > 0 ? width / height : 1;
  // 视频帖卡满内容宽（旧 280pt 上限在 ~350pt 内容宽下浪费 1/5 屏宽）
  const displayWidth = contentWidth > 0 ? contentWidth : 280;
  const displayHeight = displayWidth / aspectRatio;
  const effectiveHeight = expanded ? displayHeight * 2 : displayHeight;
  const effectiveWidth = expanded ? displayWidth * 1.5 : displayWidth;

  const handlePlay = useCallback(() => {
    hapticForScene('press');
    setIsPlaying(true);
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setExpanded(false);
  }, []);

  const handleToggleExpanded = useCallback(() => {
    hapticForScene('toggle');
    setExpanded((prev) => !prev);
  }, []);

  // Poster state
  if (!isPlaying) {
    return (
      <View
        style={[
          styles.videoWrapper,
          {
            width: displayWidth,
            height: displayHeight,
            backgroundColor: colors.placeholder,
          },
        ]}
      >
        <Image
          cachePolicy="memory-disk"
          source={{ uri: poster }}
          style={styles.videoPoster}
          contentFit="cover"
          recyclingKey={poster}
        />
        <Pressable
          onPress={handlePlay}
          style={styles.playButton}
          accessibilityLabel="播放视频"
          accessibilityRole="button"
        >
          <SymbolView name="play.circle.fill" size={44} tintColor="rgba(255,255,255,0.9)" />
        </Pressable>
        <View style={styles.videoBadge}>
          <SymbolView name="video.fill" size={10} tintColor="#FFF" />
          <Text style={styles.videoBadgeText}>视频</Text>
        </View>
      </View>
    );
  }

  // Video playing — expo-video VideoView with native controls
  return (
    <ActiveVideo
      src={src}
      effectiveWidth={effectiveWidth}
      effectiveHeight={effectiveHeight}
      expanded={expanded}
      onEnded={handleEnded}
      onToggleExpanded={handleToggleExpanded}
    />
  );
}

// ---------- Audio Segment ----------

function promptDownloadAudio(src: string) {
  Alert.alert('音频', '下载音频文件？', [
    { text: '取消', style: 'cancel' },
    {
      text: '下载',
      onPress: async () => {
        try {
          await shareFile(src, undefined, {
            mimeType: 'audio/mpeg',
            dialogTitle: '保存音频',
          });
        } catch {
          Alert.alert('错误', '下载失败');
        }
      },
    },
  ]);
}

/** Format seconds into m:ss */
function formatTime(seconds: number) {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const secs = Math.floor(Math.max(0, seconds) % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function AudioSegmentUI({
  isCurrentlyPlaying,
  displayTime,
  displayDuration,
  onPress,
  onLongPress,
}: {
  isCurrentlyPlaying: boolean;
  displayTime: number;
  displayDuration: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { colors } = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.audioWrapper,
        { backgroundColor: colors.chip, borderColor: colors.divider },
      ]}
      accessibilityLabel={isCurrentlyPlaying ? '暂停音频' : '播放音频'}
      accessibilityRole="button"
    >
      <SymbolView
        name={isCurrentlyPlaying ? 'pause.circle.fill' : 'play.circle.fill'}
        size={28}
        tintColor={colors.primary}
      />

      {/* Waveform visualization */}
      <TiebaAudioWaveform
        heights={AUDIO_WAVEFORM_BARS}
        isPlaying={isCurrentlyPlaying}
        color={colors.primary}
        inactiveColor={colors.textSecondary}
        style={styles.audioWave}
      />

      {/* Time display: currentTime / total duration */}
      <Text style={[styles.audioDuration, { color: colors.textSecondary }]}>
        {formatTime(displayTime)} / {formatTime(displayDuration)}
      </Text>
    </Pressable>
  );
}

/**
 * Player is created only after the user taps play. Unmounting this child
 * releases the expo-audio player with it.
 */
function ActiveAudio({
  src,
  duration,
}: {
  src: string;
  duration: number;
}) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  // Start playback once the child mounts after a user tap.
  useEffect(() => {
    try {
      player.replace({
        uri: src,
        headers: { Referer: 'https://tieba.baidu.com/' },
      });
      player.play();
    } catch {
      // ignore audio errors
    }
  }, [player, src]);

  // Pause audio on unmount to prevent background playback & memory leak
  useEffect(() => {
    return () => { try { player.pause(); } catch {} };
  }, [player]);

  const isCurrentlyPlaying = status.playing;
  const displayTime = status.isLoaded ? status.currentTime : 0;
  const displayDuration = status.duration > 0 ? status.duration : duration;

  /** Toggle play/pause */
  const handleToggle = useCallback(() => {
    hapticForScene('toggle');
    try {
      if (isCurrentlyPlaying) {
        player.pause();
      } else {
        if (!status.isLoaded) {
          player.replace({
            uri: src,
            headers: { Referer: 'https://tieba.baidu.com/' },
          });
        }
        // If playback ended, seek to start before playing
        if (status.didJustFinish) player.seekTo(0);
        player.play();
      }
    } catch {
      // ignore audio errors
    }
  }, [player, isCurrentlyPlaying, status.didJustFinish, status.isLoaded, src]);

  return (
    <AudioSegmentUI
      isCurrentlyPlaying={isCurrentlyPlaying}
      displayTime={displayTime}
      displayDuration={displayDuration}
      onPress={handleToggle}
      onLongPress={() => promptDownloadAudio(src)}
    />
  );
}

function AudioSegment({
  src,
  duration,
}: {
  src: string;
  duration: number;
}) {
  const [isActive, setIsActive] = useState(false);

  const handleActivate = useCallback(() => {
    hapticForScene('press');
    setIsActive(true);
  }, []);

  if (!isActive) {
    return (
      <AudioSegmentUI
        isCurrentlyPlaying={false}
        displayTime={0}
        displayDuration={duration}
        onPress={handleActivate}
        onLongPress={() => promptDownloadAudio(src)}
      />
    );
  }

  return <ActiveAudio src={src} duration={duration} />;
}
// ---------- Poll Segment ----------

function PollSegment({
  options,
  totalVoteNum,
  hasVoted,
  votedOptionIndex,
  multi = false,
  deadline,
  closed = false,
  onVote,
  onVoteMulti,
}: {
  options: PollOption[];
  totalVoteNum: number;
  hasVoted: boolean;
  votedOptionIndex?: number;
  multi?: boolean;
  deadline?: number | string;
  closed?: boolean;
  onVote?: (optionIndex: number) => void;
  onVoteMulti?: (optionIndexes: number[]) => void;
}) {
  const { colors } = useThemeColors();
  const [localSelectedIndex, setLocalSelectedIndex] = useState<number | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const deadlineMs =
    typeof deadline === 'number' ? deadline * 1000 : Number(deadline || 0) * 1000;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (closed || deadlineMs <= 0) return;
    const remaining = deadlineMs - Date.now();
    const timer = setTimeout(() => setNow(Date.now()), Math.max(remaining, 0));
    return () => clearTimeout(timer);
  }, [closed, deadlineMs]);
  const isEnded = closed || (deadlineMs > 0 && now > deadlineMs);
  // Voting is disabled (TiebaLite ships without posting/voting write APIs);
  // polls render read-only.
  const canVote = !hasVoted && !isEnded && !submitted && !!onVote;
  const showResults = hasVoted || isEnded || submitted;

  const effectiveSelectedIndex = hasVoted
    ? (votedOptionIndex ?? null)
    : localSelectedIndex;

  const handleOptionPress = useCallback((index: number) => {
    if (!canVote) return;
    hapticForScene('toggle');
    if (multi) {
      setSelectedIndices((prev) =>
        prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
      );
      return;
    }
    const next = localSelectedIndex === index ? null : index;
    setLocalSelectedIndex(next);
    if (next !== null) onVote?.(next);
  }, [canVote, multi, onVote, localSelectedIndex]);

  const handleSubmit = useCallback(() => {
    if (!multi || selectedIndices.length === 0 || !canVote) return;
    hapticForScene('action-success');
    setSubmitted(true);
    onVoteMulti?.(selectedIndices);
  }, [multi, selectedIndices, canVote, onVoteMulti]);

  return (
    <View style={styles.pollWrapper}>
      {isEnded && (
        <View style={[styles.pollStatus, { backgroundColor: colors.chip, borderColor: colors.divider }]}>
          <SymbolView name="clock" size={13} tintColor={colors.textSecondary} />
          <Text style={[styles.pollStatusText, { color: colors.textSecondary }]}>
            投票已结束
          </Text>
        </View>
      )}
      {options.map((option) => {
        const percentage =
          totalVoteNum > 0
            ? Math.round((option.voteNum / totalVoteNum) * 100)
            : 0;
        const isSelected = multi
          ? selectedIndices.includes(option.index)
          : effectiveSelectedIndex === option.index;

        return (
          <Pressable
            key={option.index}
            onPress={() => handleOptionPress(option.index)}
            disabled={!canVote}
            style={({ pressed }) => [
              styles.pollOption,
              {
                backgroundColor: colors.chip,
                borderColor: isSelected ? colors.primary : colors.divider,
                opacity: !canVote ? 1 : pressed ? 0.7 : 1,
              },
            ]}
          >
            {/* Option text + checkmark */}
            <View style={styles.pollOptionHeader}>
              <View style={styles.pollOptionTextRow}>
                {canVote && (
                  <View
                    style={[
                      multi ? styles.pollCheckSquare : styles.pollCheckmark,
                      {
                        borderColor: isSelected ? colors.primary : colors.textDisabled,
                        backgroundColor: isSelected ? colors.primary : 'transparent',
                      },
                    ]}
                  >
                    {isSelected && (
                      <SymbolView name="checkmark" size={10} tintColor="#FFF" />
                    )}
                  </View>
                )}
                <Text
                  style={[
                    styles.pollOptionText,
                    {
                      color: isSelected ? colors.primary : colors.text,
                      fontWeight: isSelected ? '600' : '400',
                    },
                  ]}
                  numberOfLines={2}
                >
                  {option.text}
                </Text>
              </View>
              {showResults && (
                <Text
                  style={[
                    styles.pollOptionPercent,
                    {
                      color: isSelected ? colors.primary : colors.textSecondary,
                      fontWeight: isSelected ? '600' : '400',
                    },
                  ]}
                >
                  {percentage}%
                </Text>
              )}
            </View>

            {/* Progress bar (only shown after voting) */}
            {showResults && (
              <View
                style={[
                  styles.pollBarTrack,
                  { backgroundColor: colors.divider },
                ]}
              >
                <View
                  style={[
                    styles.pollBarFill,
                    {
                      width: `${Math.max(percentage, 2)}%`,
                      backgroundColor: isSelected
                        ? colors.primary
                        : colors.textSecondary,
                    },
                  ]}
                />
              </View>
            )}

            {/* Vote count */}
            {showResults && (
              <Text style={[styles.pollVoteCount, { color: colors.textDisabled }]}>
                {option.voteNum}票
              </Text>
            )}
          </Pressable>
        );
      })}

      {multi && canVote && (
        <Pressable
          onPress={handleSubmit}
          disabled={selectedIndices.length === 0}
          accessibilityRole="button"
          accessibilityState={{ disabled: selectedIndices.length === 0 }}
          accessibilityLabel="提交投票"
          style={({ pressed }) => [
            styles.pollSubmitBtn,
            {
              backgroundColor: selectedIndices.length === 0 ? colors.divider : colors.primary,
              opacity: pressed && selectedIndices.length > 0 ? 0.85 : 1,
            },
          ]}
        >
          {/* textOnPrimary：跟随主题主色（withPrimary 高亮主色下为深色字），
              避免硬编码 '#FFF' 在浅色主色（如粉色主题）下白字贴浅底不可见 */}
          <Text style={[styles.pollSubmitText, { color: selectedIndices.length === 0 ? colors.textDisabled : colors.textOnPrimary }]}>
            提交投票{selectedIndices.length > 0 ? ` (${selectedIndices.length})` : ''}
          </Text>
        </Pressable>
      )}

      {/* Total vote count */}
      <Text style={[styles.pollTotal, { color: colors.textDisabled }]}>
        {totalVoteNum}人参与投票
      </Text>
    </View>
  );
}
// ---------- Main Renderer ----------

/**
 * Renders an array of PostContent segments into a rich text view.
 * Text-level segments flow together first; images are extracted from
 * the whole array and rendered as one grid block below the text.
 */
function PostContent({
  content,
  forumName,
  onImagePress,
  onLinkPress,
  onUserPress,
  onTopicPress,
  onVote,
  onVoteMulti,
}: PostContentProps) {
  const router = useRouter();
  const { colors, isDark } = useThemeColors();
  const hideMedia = useAppPreference('hideMedia', false);
  const blockVideo = useAppPreference('blockVideo', false);
  const hideBlockedContent = useAppPreference('hideBlockedContent', false);
  // 阅读字号：显示设置 -fontScale 倍率，作用于正文 / 引用 / @ / 话题
  const fontScale = useAppPreference('fontScale', 1.0) ?? 1;
  const { isContentBlocked: hookIsContentBlocked } = useBlockFilter();
  const isContentBlocked = hookIsContentBlocked;
  const imageDarkenWhenNight = useAppPreference('imageDarkenWhenNight', false);
  const dimImages = isDark && imageDarkenWhenNight;
  const imageWatermarkEnabled = useAppPreference('imageWatermarkEnabled', false);
  const imageWatermark = useAppPreference('imageWatermark', 'none');
  const account = useAuthStore((s) => s.account);
  const watermarkText = imageWatermarkEnabled
    ? imageWatermark === 'username'
      ? (account?.name ?? '')
      : imageWatermark === 'forum_name'
        ? (forumName ?? '')
        : ''
    : '';

  // Cache the regex-based emoticon split per text segment. The split is pure
  // (depends only on the segment text), so memoize it keyed on `content` to
  // avoid re-running the regex on every render.
  const emoticonPartsCache = useMemo(() => {
    const cache = new Map<number, TextOrEmoticon[]>();
    content.forEach((segment, index) => {
      if (segment.type === 'text') {
        cache.set(index, splitTextWithEmoticons(segment.text));
      }
    });
    return cache;
  }, [content]);

  // Stable cell sizing: derive the content width from the window and the
  // fixed card/list insets instead of re-measuring on every layout pass.
  const { width: screenWidth } = useWindowDimensions();
  const contentWidth = Math.max(0, screenWidth - CONTENT_HORIZONTAL_INSET);

  // ── Split segments into native text runs + block media ──
  const { inlineRuns, blockTips, blockNodes, extractedImages } = useMemo(() => {
    const inlineRuns: TiebaRichTextRun[] = [];
    const blockTips: React.ReactNode[] = [];
    const blockNodes: React.ReactNode[] = [];
    const extractedImages: { src: string; width: number; height: number; originSrc?: string }[] = [];
    let key = 0;

    // BlockTip — matches Kotlin Block.kt BlockTip composable
    // textSecondary 是 rgba() 字符串，不能直接拼 alpha 后缀（会得非法色值），
    // 底色统一走 colors.groupFill（与 ThreadMoreSheet groupBg 同源）。
    const renderBlockTip = (k: number) => (
      <View key={`blocked-${k}`} style={[styles.blockTip, { backgroundColor: colors.groupFill }]}>
        <SymbolView name="eye.slash" size={12} tintColor={colors.textSecondary} />
        <Text style={[styles.blockTipText, { color: colors.textSecondary }]}>内容已屏蔽</Text>
      </View>
    );

    // Consecutive text/emoji/@/topic segments become native attributed runs.
    let textRun: TiebaRichTextRun[] = [];
    const flushTextRun = () => {
      if (textRun.length === 0) return;
      inlineRuns.push(...textRun);
      textRun = [];
    };

    const pushBlocked = (k: number) => {
      flushTextRun();
      if (!hideBlockedContent) blockTips.push(renderBlockTip(k));
    };

    content.forEach((segment, segIndex) => {
      switch (segment.type) {
        case 'text': {
          if (isContentBlocked(segment)) {
            pushBlocked(key);
          } else {
            const parts = emoticonPartsCache.get(segIndex) ?? splitTextWithEmoticons(segment.text);
            parts.forEach((part) => {
              if (part.type === 'emoticon') {
                flushTextRun();
                inlineRuns.push({ kind: 'emoticon', text: part.text, src: part.src });
              } else {
                textRun.push({ kind: 'text', text: part.text });
              }
            });
          }
          key++;
          break;
        }

        case 'emoji': {
          if (isContentBlocked(segment)) {
            pushBlocked(key);
          } else {
            textRun.push({ kind: 'emoji', text: segment.text });
          }
          key++;
          break;
        }

        case 'emoticon':
          flushTextRun();
          inlineRuns.push({ kind: 'emoticon', text: segment.text, src: segment.src });
          key++;
          break;

        case 'linebreak':
          flushTextRun();
          inlineRuns.push({ kind: 'linebreak' });
          key++;
          break;

        case 'link': {
          if (isContentBlocked(segment)) {
            pushBlocked(key);
          } else {
            flushTextRun();
            inlineRuns.push({ kind: 'link', text: segment.text, url: segment.url });
          }
          key++;
          break;
        }

        case 'at': {
          if (isContentBlocked(segment)) {
            pushBlocked(key);
          } else {
            textRun.push({ kind: 'at', text: segment.text, uid: segment.uid });
          }
          key++;
          break;
        }

        case 'topic': {
          if (isContentBlocked(segment)) {
            pushBlocked(key);
          } else {
            textRun.push({ kind: 'topic', text: segment.text, topicId: segment.topicId, fontWeight: '500' });
          }
          key++;
          break;
        }

        case 'image':
          // Extracted — rendered as one grid block after all text content
          extractedImages.push({
            src: segment.src,
            width: segment.width,
            height: segment.height,
            originSrc: segment.originSrc,
          });
          break;

        case 'video':
          if (hideMedia) {
            blockNodes.push(
              <View key={`video-${key++}`} style={[styles.mediaPlaceholder, { backgroundColor: colors.chip, borderColor: colors.divider }]}>
                <SymbolView name="video" size={14} tintColor={colors.textSecondary} />
                <Text style={[styles.mediaPlaceholderText, { color: colors.textSecondary }]}>[视频]</Text>
              </View>
            );
          } else if (blockVideo) {
            blockNodes.push(
              <View key={`video-${key++}`} style={[styles.mediaPlaceholder, { backgroundColor: colors.chip, borderColor: colors.divider }]}>
                <SymbolView name="video.slash" size={14} tintColor={colors.textSecondary} />
                <Text style={[styles.mediaPlaceholderText, { color: colors.textSecondary }]}>[视频已屏蔽]</Text>
              </View>
            );
          } else {
            blockNodes.push(
              <VideoSegment
                key={`video-${key++}`}
                src={segment.src}
                poster={segment.poster}
                width={segment.width}
                height={segment.height}
                contentWidth={contentWidth}
              />
            );
          }
          break;

        case 'audio':
          blockNodes.push(
            <AudioSegment
              key={`audio-${key++}`}
              src={segment.src}
              duration={segment.duration}
            />
          );
          break;

        case 'poll':
          {
            const poll = segment as unknown as {
              multi?: boolean;
              deadline?: number | string;
              closed?: boolean;
            };
          blockNodes.push(
            <PollSegment
              key={`poll-${key++}`}
              options={segment.options}
              totalVoteNum={segment.totalVoteNum}
              hasVoted={segment.hasVoted}
              votedOptionIndex={segment.votedOptionIndex}
              multi={poll.multi}
              deadline={poll.deadline}
              closed={poll.closed}
              onVote={onVote}
              onVoteMulti={onVoteMulti}
            />
          );
          }
          break;
      }
    });

    flushTextRun();

    return { inlineRuns, blockTips, blockNodes, extractedImages };
  }, [
    content,
    colors,
    hideMedia,
    blockVideo,
    hideBlockedContent,
    isContentBlocked,
    emoticonPartsCache,
    contentWidth,
    onVote,
    onVoteMulti,
  ]);

  if (!content || content.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: colors.textDisabled }]}>
        [内容已删除]
      </Text>
    );
  }

  const hasTextBlock = inlineRuns.length > 0 || blockTips.length > 0;
  const hasPrecedingContent = hasTextBlock || blockNodes.length > 0;
  const hasImages = extractedImages.length > 0;
  const totalNodes = inlineRuns.length + blockTips.length + blockNodes.length + extractedImages.length;

  return (
    <View style={styles.container}>
      {totalNodes === 0 ? (
        <Text style={[styles.emptyText, { color: colors.textDisabled }]}>
          [内容已删除]
        </Text>
      ) : (
        <>
          {/* 1 — Text content flows first (emoticons stay inline) */}
          {hasTextBlock && (
            <View style={styles.textFlow}>
              {blockTips}
              {inlineRuns.length > 0 && (
                <TiebaRichText
                  runs={inlineRuns}
                  contentWidth={contentWidth}
                  fontSize={15 * fontScale}
                  lineHeight={22 * fontScale}
                  textColor={colors.text}
                  linkColor={colors.primary}
                  onLinkPress={(url) => {
                    if (onLinkPress) onLinkPress(url);
                    else openLink(url);
                  }}
                  onUserPress={(uid) => {
                    if (onUserPress) onUserPress(uid);
                    else router.push(`/user/${uid}`);
                  }}
                  onTopicPress={(topicId, topicName) => {
                    if (onTopicPress) onTopicPress(topicId, topicName);
                    else router.push(`/topic/${topicId}?name=${encodeURIComponent(topicName)}`);
                  }}
                />
              )}
            </View>
          )}

          {/* 2 — Block-level media (video / audio / poll) */}
          {blockNodes}

          {/* 3 — ALL images on their own lines, below the text */}
          {hasImages &&
            (hideMedia ? (
              <View style={[styles.imageBlock, hasPrecedingContent && styles.imageBlockSpaced]}>
                {extractedImages.map((_img, i) => (
                  <View
                    key={`img-ph-${i}`}
                    style={[
                      styles.mediaPlaceholder,
                      { backgroundColor: colors.chip, borderColor: colors.divider, marginTop: 0 },
                    ]}
                  >
                    <SymbolView name="photo" size={14} tintColor={colors.textSecondary} />
                    <Text style={[styles.mediaPlaceholderText, { color: colors.textSecondary }]}>[图片]</Text>
                  </View>
                ))}
              </View>
            ) : (
              <ImageSegment
                images={extractedImages}
                contentWidth={contentWidth}
                watermarkText={watermarkText}
                onPress={onImagePress}
                dimmed={dimImages}
                style={hasPrecedingContent ? styles.imageBlockSpaced : undefined}
              />
            ))}
        </>
      )}
    </View>
  );
}

// Memoized so parent re-renders (e.g. list recycling, theme-independent state
// changes) don't force a full re-render when the content prop is unchanged.
export default React.memo(PostContent);
// ---------- Styles ----------

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
  },
  // Wrapping flow for text-level segments (text / emoji / emoticon / @ / link…)
  textFlow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  paragraphText: {
    fontSize: 15,
    lineHeight: 22,
    flexShrink: 1,
  },
  emoji: {
    fontSize: 16,
    lineHeight: 22,
  },
  emoticon: {
    width: 20,
    height: 20,
    marginHorizontal: 1,
    marginTop: 1,
  },
  linebreak: {
    width: '100%',
    height: 4,
  },
  // Extracted image grid block — always below the text, never inline
  imageBlock: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: IMAGE_GAP,
  },
  imageBlockSpaced: {
    marginTop: 10,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: IMAGE_GAP,
  },
  // 多图横向分页：整块圆角裁切，页码点叠在底部
  imagePagerWrap: {
    borderRadius: IMAGE_RADIUS,
    overflow: 'hidden',
    position: 'relative',
  },
  pagerDots: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  pagerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pagerDotActive: {
    width: 16,
  },
  imageWrapper: {
    borderRadius: IMAGE_RADIUS,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  } as any,
  imageOverlayText: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '700',
  },
  imagePlaceholder: {
    borderRadius: IMAGE_RADIUS,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  mediaPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.chip,
    borderWidth: 1,
    marginTop: 10,
    gap: 6,
  },
  mediaPlaceholderText: {
    fontSize: 13,
  },
  blockTip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 2,
    marginBottom: 2,
    gap: 6,
  },
  blockTipText: {
    fontSize: 12,
  },
  videoWrapper: {
    borderRadius: IMAGE_RADIUS,
    overflow: 'hidden',
    marginTop: 10,
    position: 'relative',
  },
  videoPoster: {
    width: '100%',
    height: '100%',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  playButton: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  } as any,
  videoBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 2,
  },
  videoBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
  expandButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: IMAGE_RADIUS,
    borderWidth: 1,
    gap: 10,
    marginTop: 10,
  },
  audioWave: {
    flex: 1,
    height: 32,
  },
  audioDuration: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  linkWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,122,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 2,
    marginBottom: 2,
  },
  linkText: {
    fontSize: 13,
    flexShrink: 1,
  },
  atText: {
    fontSize: 15,
    lineHeight: 22,
  },
  topicText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  // Poll
  pollWrapper: {
    width: '100%',
    marginTop: 10,
  },
  pollOption: {
    borderRadius: Radius.input,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  pollOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  pollOptionText: {
    fontSize: 14,
    flex: 1,
    marginRight: 8,
    lineHeight: 20,
  },
  /** Row container for checkmark + option text (pre-vote state) */
  pollOptionTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  /** Circular checkmark indicator for selectable poll options */
  pollCheckmark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  /** Square checkmark indicator for multi-select poll options */
  pollCheckSquare: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  pollStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.chip,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  pollStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pollOptionPercent: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  pollBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  pollBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  pollVoteCount: {
    fontSize: 12,
  },
  pollTotal: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  pollSubmitBtn: {
    height: 40,
    borderRadius: Radius.capsule,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginBottom: 4,
  },
  pollSubmitText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
