/**
 * PostCard — iOS 26 reply card
 *
 * Design:
 * - Card shell: colors.card background, borderRadius 16, padding 16, hairline border
 * - Author row: 36pt avatar + name + level badge + 楼主 tag, time/floor/IP meta below
 * - Content: text first, images extracted onto their own lines (PostContent)
 * - 楼中楼: surfaceSecondary rounded block (unchanged)
 * - Action bar: 分享 | 评论 … 点赞, separated from content by a hairline border
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Share,
  ActionSheetIOS,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { SymbolView } from '@/components/ui/SymbolView';
import { hapticForScene } from '@/theme/hapticsMap';
import * as Clipboard from 'expo-clipboard';
import { useThemeColors } from '@/theme/ThemeContext';
import { useAppPreference } from '@/hooks/useAppPreference';
import { Radius } from '@/theme/spacing';
import { contentToText , relativeTime, formatCount, getLevelColor } from '@/utils';
import { thumbnailUrl, THUMB_CARD } from '@/utils/thumbnail';
import { Avatar } from '@/components/ui/Avatar';
import PostContent from './PostContent';
import { openLink } from '@/utils/linkOpener';
import type { PostInfo, PostContent as PostContentType, SubPostInfo } from '@/types';

interface PostCardProps {
  post: PostInfo;
  forumName?: string;
  isLz: boolean;
  subPosts?: SubPostInfo[];
  immersive?: boolean;
  onAgree?: (postId: string, opType: number) => void;
  onDisagree?: (postId: string, opType: number) => void;
  onDelete?: (postId: string) => void;
  onReport?: (postId: string) => void;
  onCollectFloor?: (postId: string) => void;
  onSubPostsPress?: (post: PostInfo) => void;
  onImagePress?: (images: string[], index: number) => void;
  onVote?: (optionIndex: number) => void;
  onVoteMulti?: (optionIndexes: number[]) => void;
}

function InlineQuoteContent({
  content,
  colors,
  onImagePress,
}: {
  content: SubPostInfo['content'];
  colors: any;
  onImagePress?: (images: string[], index: number) => void;
}) {
  const router = useRouter();
  if (!content || content.length === 0) {
    return <Text style={[s.quoteInlineText, { color: colors.textSecondary }]}>[内容已删除]</Text>;
  }
  // 楼中楼图片：收集成可横向滑动的缩略图条（紧凑引用块内 90pt 高）
  const images = content.filter(
    (seg): seg is Extract<PostContentType, { type: 'image' }> =>
      seg.type === 'image' && !!(seg.src || seg.originSrc),
  );
  // 文字/表情/@/链接合并进单个 Text + numberOfLines 省略：
  // 楼中楼超长文字在预览区只显示前 2 行，点进完整页再看全文。
  return (
    <View style={s.quoteInlineFlow}>
      <Text
        style={[s.quoteInlineText, { color: colors.textSecondary }]}
        numberOfLines={2}
        ellipsizeMode="tail"
      >
        {content.map((seg, idx) => {
          switch (seg.type) {
            case 'text':
            case 'emoji':
              return <Text key={idx}>{seg.text}</Text>;
            case 'at':
              return (
                <Text
                  key={idx}
                  style={{ color: colors.primary }}
                  onPress={(e) => {
                    e.stopPropagation();
                    router.push(`/user/${seg.uid}`);
                  }}
                >
                  @{seg.text}
                </Text>
              );
            case 'link':
              return (
                <Text
                  key={idx}
                  style={{ color: colors.primary }}
                  onPress={(e) => {
                    e.stopPropagation();
                    openLink(seg.url);
                  }}
                >
                  {seg.text || seg.url}
                </Text>
              );
            case 'topic':
              return (
                <Text
                  key={idx}
                  style={{ color: colors.primary }}
                  onPress={(e) => {
                    e.stopPropagation();
                    router.push(`/topic/${seg.topicId}?name=${encodeURIComponent(seg.text)}`);
                  }}
                >
                  #{seg.text}#
                </Text>
              );
            case 'emoticon':
              return (
                <Image
                  key={idx}
                  source={{ uri: seg.src }}
                  style={s.quoteEmoticon}
                  cachePolicy="memory-disk"
                  accessibilityLabel={seg.text}
                />
              );
            case 'linebreak':
              return <Text key={idx}>{"\n"}</Text>;
            case 'video':
              return <Text key={idx}>[视频]</Text>;
            case 'audio':
              return <Text key={idx}>[语音]</Text>;
            default:
              return null;
          }
        })}
      </Text>

      {/* 楼中楼图片：横向滑动查看缩略图，点击看大图 */}
      {images.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={s.quoteImageStrip}
        >
          {images.map((img, imgIdx) => {
            const ratio = img.width > 0 && img.height > 0 ? img.width / img.height : 1;
            const thumbW = Math.min(Math.max(90 * ratio, 56), 140);
            const uri = thumbnailUrl(img.src ?? '', THUMB_CARD);
            return (
              <Pressable
                key={imgIdx}
                onPress={(e) => {
                  e.stopPropagation();
                  hapticForScene('press');
                  const urls = images.map((i) => i.originSrc || i.src || '');
                  onImagePress?.(urls, imgIdx);
                }}
                style={[
                  s.quoteImageThumb,
                  { backgroundColor: colors.placeholder, width: thumbW, height: 90 },
                ]}
              >
                <Image
                  source={{ uri }}
                  style={s.quoteImageThumbImg}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={img.src ?? ''}
                />
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const PostCard = React.memo(function PostCard({
  post,
  forumName,
  isLz,
  subPosts,
  immersive = false,
  onAgree,
  onDelete,
  onReport,
  onSubPostsPress,
  onImagePress,
  onVote,
  onVoteMulti,
}: PostCardProps) {
  const { colors } = useThemeColors();
  const showBothUsername = useAppPreference('showBothUsername', false);
  const router = useRouter();

  const handleLongPress = useCallback(() => {
    hapticForScene('press');
    const textContent = contentToText(post.content);
    router.push({ pathname: '/copy', params: { text: encodeURIComponent(textContent || '[图片/视频/音频]') } });
  }, [post.content, router]);

  const handleCopyPress = useCallback(() => {
    hapticForScene('press');
    const textContent = contentToText(post.content);
    router.push({ pathname: '/copy', params: { text: encodeURIComponent(textContent || '[图片/视频/音频]') } });
  }, [post.content, router]);

  const handleCopyLink = useCallback(async () => {
    hapticForScene('press');
    await Clipboard.setStringAsync(`https://tieba.baidu.com/p/${post.threadId}?pid=${post.id}`);
    hapticForScene('action-success');
  }, [post.threadId, post.id]);

  const handleShare = useCallback(async () => {
    hapticForScene('press');
    try {
      await Share.share({
        message: `https://tieba.baidu.com/p/${post.threadId}?pid=${post.id}`,
      });
    } catch {
      // user cancelled the share sheet — ignore
    }
  }, [post.threadId, post.id]);

  const handleAgreePress = useCallback(() => {
    hapticForScene('like');
    onAgree?.(post.id, post.isAgree ? 0 : 1);
  }, [onAgree, post.id, post.isAgree]);

  // "..." 菜单改为原生 ActionSheet：此前每张卡挂一个 SwiftUI Menu（ThemedHost
  // + 原生视图树），400 楼快速滚动时创建/销毁开销是掉帧大头；ActionSheet
  // 零常驻视图，点击时才拉起系统面板。
  const handleMorePress = useCallback(() => {
    hapticForScene('press');
    const options = ['复制内容', '分享', '复制链接', '举报', ...(onDelete ? ['删除'] : []), '取消'];
    const cancelButtonIndex = options.length - 1;
    const destructiveButtonIndex = onDelete ? options.length - 2 : undefined;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        destructiveButtonIndex,
      },
      (buttonIndex) => {
        switch (buttonIndex) {
          case 0: handleCopyPress(); break;
          case 1: void handleShare(); break;
          case 2: void handleCopyLink(); break;
          case 3: onReport?.(post.id); break;
          case 4: onDelete?.(post.id); break;
        }
      },
    );
  }, [handleCopyPress, handleShare, handleCopyLink, onReport, onDelete, post.id]);

  const authorMeta =
    [
      relativeTime(post.createTime),
      post.floor > 0 ? `${post.floor}楼` : null,
      post.ipLocation ? `IP属地:${post.ipLocation}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.divider }]}>
      <Pressable onLongPress={handleLongPress} delayLongPress={400}>
        {/* ── Author Row: avatar + name/badges + meta … more ── */}
        {!immersive && (
          <View style={s.authorRow}>
            <Link href={{ pathname: '/user/[uid]', params: { uid: post.authorId } }} push asChild>
              <Pressable style={s.authorGroup}>
                <Avatar
                  source={post.authorPortrait}
                  initials={post.authorNameShow || post.authorName}
                  size={36}
                />
                <View style={s.authorInfo}>
                  <View style={s.nameRow}>
                    <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>
                      {showBothUsername && post.authorName && post.authorNameShow
                        ? `${post.authorNameShow} @${post.authorName}`
                        : (post.authorNameShow || post.authorName)}
                    </Text>
                    {post.authorLevelId > 0 && (
                      <View style={[s.levelBadge, { backgroundColor: getLevelColor(post.authorLevelId) }]}>
                        <Text style={s.levelBadgeText}>Lv.{post.authorLevelId}</Text>
                      </View>
                    )}
                    {isLz && (
                      <View style={[s.lzTag, { backgroundColor: colors.primary + '18' }]}>
                        <Text style={[s.lzTagText, { color: colors.primary }]}>楼主</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.authorMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                    {authorMeta}
                  </Text>
                </View>
              </Pressable>
            </Link>
            {/* Like button (plain heart, no glass — matches Kotlin) */}
            <Pressable onPress={handleAgreePress} hitSlop={8} style={s.likeBtn}>
              <SymbolView
                name={post.isAgree ? 'heart.fill' : 'heart'}
                size={18}
                tintColor={post.isAgree ? '#FF2D55' : colors.textTertiary}
              />
              {post.agreeNum > 0 && (
                <Text style={[s.likeCount, { color: post.isAgree ? '#FF2D55' : colors.textTertiary }]}>
                  {formatCount(post.agreeNum)}
                </Text>
              )}
            </Pressable>
            {/* "..." menu moved to bottom */}
          </View>
        )}

        {/* ── Content: text first, images on their own lines below ── */}
        <PostContent
          content={post.content}
          forumName={forumName}
          onImagePress={onImagePress}
          onVote={onVote}
          onVoteMulti={onVoteMulti}
        />

        {/* ── Sub-Post Quote Block (楼中楼) ── */}
        {((subPosts && subPosts.length > 0) || (post.subPostNum > 0)) && (
          <Pressable
            onPress={() => onSubPostsPress?.(post)}
            style={[s.quoteBlock, { backgroundColor: colors.surfaceSecondary }]}
          >
            {subPosts && subPosts.length > 0 ? (
              <>
                {subPosts.slice(0, 3).map((sp, idx) => {
                  return (
                    <View key={sp.id} style={[s.quoteRow, idx > 0 && s.quoteRowGap]}>
                      <Text style={[s.quoteName, { color: colors.textSecondary }]} numberOfLines={1}>
                        {sp.authorNameShow || sp.authorName}：
                      </Text>
                      <InlineQuoteContent content={sp.content} colors={colors} onImagePress={onImagePress} />
                    </View>
                  );
                })}
                {post.subPostNum > 3 && (
                  <Text style={[s.quoteMore, { color: colors.primary }]}>
                    查看全部 {post.subPostNum} 条回复
                  </Text>
                )}
              </>
            ) : (
              <Text style={[s.quoteMore, { color: colors.primary }]}>
                查看 {post.subPostNum} 条回复
              </Text>
            )}
          </Pressable>
        )}
      </Pressable>

      {/* ── Bottom bar: "..." menu (native ActionSheet on tap) ── */}
      {!immersive && (
        <View style={[s.bottomBar, { borderTopColor: colors.divider }]}>
          <Pressable
            onPress={handleMorePress}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="更多操作"
          >
            <SymbolView name="ellipsis" size={18} weight="bold" tintColor={colors.textTertiary} />
          </Pressable>
        </View>
      )}
    </View>
  );
});

export default PostCard;
// ── iOS-native styles ──
// Card shell: colors.card / radius 16 / padding 16 / hairline border
// Typography: name=subheadline semibold, meta=caption tertiary, actions=footnote

const s = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: Radius.card,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },

  // Author row — avatar + name/badges/meta … more
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  authorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  authorInfo: {
    flexShrink: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  levelBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  levelBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  lzTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lzTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  authorMeta: {
    fontSize: 12,
    lineHeight: 16,
  },

  // Quote block (楼中楼)
  quoteBlock: {
    marginTop: 10,
    borderRadius: Radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  quoteRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  quoteRowGap: {
    marginTop: 5,
  },
  quoteName: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 0,
  },
  quoteText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  quoteInlineText: {
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1,
  },
  quoteInlineFlow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  quoteEmoticon: {
    width: 20,
    height: 20,
    marginHorizontal: 1,
  },
  quoteLineBreak: {
    width: '100%',
    height: 0,
  },
  // 楼中楼图片：横向滑动缩略图条
  quoteImageStrip: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: 6,
    alignItems: 'flex-start',
  },
  quoteImageThumb: {
    borderRadius: Radius.input - 2,
    overflow: 'hidden',
  },
  quoteImageThumbImg: {
    width: '100%',
    height: '100%',
  },
  quoteMore: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },

  // Like button (top-right, plain heart)
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  likeCount: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Bottom bar ("..." menu)
  bottomBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
