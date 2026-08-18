/**
 * FeedCard — 吧 / 话题搜索卡片
 *
 * - 吧卡片：吧头像 + 吧名 + 关注/贴子数 + chevron，整卡进吧
 * - 话题卡片：话题图标 + 名称 + 热标 + 描述 + 讨论数，整卡进话题
 * - 帖子卡片由 TweetCard 统一承载（hero 体系已移除），本组件不再接收 thread 类型
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SymbolView } from '@/components/ui/SymbolView';
import { hapticForScene } from '@/theme/hapticsMap';
import { useThemeColors } from '@/theme/ThemeContext';
import { PRESS_ENTER, PRESS_EXIT, PRESS_SCALE } from '@/theme/springs';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { typographyStyles } from '@/theme/typography';
import { Radius, Shadows, Spacing } from '@/theme/spacing';
import { formatCount } from '@/utils';
import type { FeedItem } from '@/types';

/**
 * 吧卡片头像：forum.avatar 空串 / 加载失败时兜底为首字占位，
 * 避免暗色下出现空白方块。
 */
const ForumCardAvatar = React.memo(function ForumCardAvatar({
  avatar,
  name,
}: {
  avatar: string;
  name: string;
}) {
  const { colors } = useThemeColors();
  const [failed, setFailed] = useState(false);
  const showImage = !!avatar && !failed;
  if (showImage) {
    return (
      <Image
        cachePolicy="memory-disk"
        source={{ uri: avatar }}
        style={styles.forumCardAvatar}
        contentFit="cover"
        recyclingKey={avatar}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View
      style={[
        styles.forumCardAvatar,
        styles.forumAvatarPlaceholder,
        { backgroundColor: colors.surfaceSecondary },
      ]}
    >
      <Text style={[styles.forumAvatarText, { color: colors.textSecondary }]}>
        {(name || '?').slice(0, 1)}
      </Text>
    </View>
  );
});

interface FeedCardProps {
  item: FeedItem;
}

const FeedCard = React.memo(function FeedCard({ item }: FeedCardProps) {
  const { colors, isDark } = useThemeColors();
  const router = useRouter();
  const { reduceMotion } = useReducedMotion();

  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const onPressIn = useCallback(() => {
    if (reduceMotion) return;
    scale.value = withSpring(PRESS_SCALE.default, PRESS_ENTER);
  }, [scale, reduceMotion]);
  const onPressOut = useCallback(() => {
    if (reduceMotion) return;
    scale.value = withSpring(1, PRESS_EXIT);
  }, [scale, reduceMotion]);

  const handlePress = useCallback(() => {
    hapticForScene('press');
    if (item.type === 'forum' && item.forumInfo) {
      router.push(`/forum/${encodeURIComponent(item.forumInfo.forumName)}`);
    } else if (item.type === 'topic' && item.topicInfo) {
      router.push(`/topic/${item.topicInfo.topicId}?name=${encodeURIComponent(item.topicInfo.topicName)}`);
    }
  }, [item, router]);

  // ═══════════════════════════════════════════════════════════
  // 吧卡片
  // ═══════════════════════════════════════════════════════════
  if (item.type === 'forum' && item.forumInfo) {
    const forum = item.forumInfo;
    return (
      <Animated.View style={[styles.cardWrap, animatedStyle]}>
        <Pressable
          onPress={handlePress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          style={[styles.forumCard, { backgroundColor: colors.card }, Shadows.card]}
        >
          <ForumCardAvatar avatar={forum.avatar} name={forum.forumName} />
          <View style={styles.forumCardInfo}>
            <Text style={[styles.forumCardName, { color: colors.text }]}>
              {forum.forumName}吧
            </Text>
            <Text style={[styles.forumCardStats, { color: colors.textTertiary }]} numberOfLines={1}>
              关注 {formatCount(forum.memberCount)}  贴子 {formatCount(forum.threadCount)}
            </Text>
          </View>
          <SymbolView name="chevron.right" size={15} tintColor={colors.textDisabled} />
        </Pressable>
      </Animated.View>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 话题卡片
  // ═══════════════════════════════════════════════════════════
  if (item.type === 'topic' && item.topicInfo) {
    const topic = item.topicInfo;
    return (
      <Animated.View style={[styles.cardWrap, animatedStyle]}>
        <Pressable
          onPress={handlePress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          style={[styles.card, { backgroundColor: colors.card }, Shadows.card]}
        >
          <View style={styles.topicHeader}>
            <View
              style={[
                styles.topicIcon,
                { backgroundColor: isDark ? 'rgba(255,159,10,0.16)' : 'rgba(255,149,0,0.12)' },
              ]}
            >
              <SymbolView name="number" size={14} tintColor={colors.warning} />
            </View>
            <Text style={[styles.topicName, { color: colors.text }]} numberOfLines={1}>
              #{topic.topicName}#
            </Text>
            {topic.isHot && (
              <View style={[styles.hotBadge, { backgroundColor: colors.error }]}>
                <Text style={styles.hotBadgeText}>热</Text>
              </View>
            )}
          </View>
          {topic.topicDesc ? (
            <Text style={[styles.topicDesc, { color: colors.textSecondary }]} numberOfLines={2}>
              {topic.topicDesc}
            </Text>
          ) : null}
          <View style={styles.topicFooter}>
            <SymbolView name="bubble.left.and.bubble.right" size={13} tintColor={colors.textTertiary} />
            <Text style={[styles.topicStat, { color: colors.textTertiary }]}>
              {formatCount(topic.discussNum)} 讨论
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  return null;
});

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // 卡片外层：提供间距
  cardWrap: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6, // 6pt 上下 → 卡片间 12pt
  },
  // 话题卡片容器
  card: {
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    overflow: 'hidden',
  },

  // ── 吧卡片 ──
  forumCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  forumCardAvatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.image,
    backgroundColor: 'rgba(120,120,128,0.12)',
  },
  forumAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  forumAvatarText: {
    fontSize: 15,
    fontWeight: '700',
  },
  forumCardInfo: {
    flex: 1,
  },
  forumCardName: {
    ...typographyStyles.headline,
    marginBottom: 3,
  },
  forumCardStats: {
    ...typographyStyles.caption1,
  },

  // ── 话题卡片 ──
  topicHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    // 2pt 微调（spacing 刻度无 10pt）
    marginBottom: Spacing.xs + 2,
  },
  topicIcon: {
    width: 28,
    height: 28,
    borderRadius: Radius.chip + 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topicName: {
    ...typographyStyles.subheadBold,
    flex: 1,
  },
  hotBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.chip,
  },
  hotBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  topicDesc: {
    ...typographyStyles.subhead,
    // 2pt 微调（spacing 刻度无 10pt）
    marginBottom: Spacing.xs + 2,
  },
  topicFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  topicStat: {
    ...typographyStyles.caption1,
  },
});

export default FeedCard;
