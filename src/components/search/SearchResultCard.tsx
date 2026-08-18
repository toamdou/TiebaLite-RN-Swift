/**
 * Shared search result cards for global search and in-forum search.
 *
 * These preserve the previous per-page card layouts so both search flows
 * keep the same visual density and navigation behavior.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { SymbolView } from '@/components/ui/SymbolView';
import { htmlToText } from '@/utils/htmlSummary';
import { formatCount, relativeTime } from '@/utils';
import { Radius } from '@/theme';
import type {
  SearchForumResult,
  SearchPostResult,
  SearchThreadResult,
  SearchUserResult,
} from '@/types';

const isValidUid = (uid: string): boolean => /^[1-9]\d{0,18}$/.test(String(uid));

export const SearchThreadCard = React.memo(function SearchThreadCard({
  item,
  colors,
  onPressItem,
}: {
  item: SearchThreadResult;
  colors: any;
  onPressItem: (item: SearchThreadResult) => void;
}) {
  // 卡内缓存 HTML→纯文本解析，避免列表重渲时逐卡重复字符级解析（搜索逐键输入场景）
  const preview = React.useMemo(() => htmlToText(item.content), [item]);
  return (
    <Pressable
      style={[styles.threadCard, { backgroundColor: colors.card, borderColor: colors.separator }]}
      onPress={() => onPressItem(item)}
    >
      <View style={styles.threadHeader}>
        <Avatar
          source={item.authorPortrait}
          initials={(item.authorNameShow || item.authorName || '?')[0]}
          size={24}
        />
        <Text style={[styles.threadAuthor, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.authorNameShow || item.authorName}
        </Text>
        {item.createTime > 0 && (
          <Text style={[styles.threadTime, { color: colors.textTertiary }]}>
            {relativeTime(item.createTime * 1000)}
          </Text>
        )}
      </View>
      {item.title ? (
        <Text style={[styles.threadTitle, { color: colors.text }]} numberOfLines={2}>
          {item.title}
        </Text>
      ) : null}
      {item.content ? (
        <Text style={[styles.threadContent, { color: colors.textSecondary }]} numberOfLines={2}>
          {preview}
        </Text>
      ) : null}
      <View style={styles.threadFooter}>
        {item.forumName ? (
          <View style={[styles.forumChip, { backgroundColor: colors.chip }]}>
            <Text style={[styles.forumChipText, { color: colors.onChip }]} numberOfLines={1}>
              {item.forumName}吧
            </Text>
          </View>
        ) : null}
        <View style={styles.threadStats}>
          <SymbolView name="bubble.left" size={12} tintColor={colors.textTertiary} />
          <Text style={[styles.statText, { color: colors.textTertiary }]}>
            {formatCount(item.replyNum)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

export const SearchForumCard = React.memo(function SearchForumCard({
  item,
  colors,
  onPressItem,
}: {
  item: SearchForumResult;
  colors: any;
  onPressItem: (item: SearchForumResult) => void;
}) {
  return (
    <Pressable
      style={[styles.forumCard, { backgroundColor: colors.card, borderColor: colors.separator }]}
      onPress={() => onPressItem(item)}
    >
      <Avatar source={item.avatar} initials={item.forumName[0]} size={44} />
      <View style={styles.forumInfo}>
        <Text style={[styles.forumName, { color: colors.text }]} numberOfLines={1}>
          {item.forumName}吧
        </Text>
        <Text style={[styles.forumMeta, { color: colors.textTertiary }]} numberOfLines={1}>
          {formatCount(item.memberCount)} 关注 · {formatCount(item.threadCount)} 贴子
        </Text>
      </View>
      {item.isLike && (
        <View style={[styles.likedBadge, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.likedText, { color: colors.primary }]}>已关注</Text>
        </View>
      )}
      <SymbolView name="chevron.right" size={14} tintColor={colors.textDisabled} />
    </Pressable>
  );
});

export const SearchUserCard = React.memo(function SearchUserCard({
  item,
  colors,
  onPressItem,
}: {
  item: SearchUserResult;
  colors: any;
  onPressItem: (item: SearchUserResult) => void;
}) {
  return (
    <Pressable
      style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.separator }]}
      onPress={() => {
        if (!isValidUid(item.uid)) return;
        onPressItem(item);
      }}
    >
      <Avatar source={item.portrait} initials={(item.nameShow || item.name || '?')[0]} size={44} />
      <View style={styles.userInfo}>
        <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
          {item.nameShow || item.name}
        </Text>
        {item.intro ? (
          <Text style={[styles.userIntro, { color: colors.textTertiary }]} numberOfLines={1}>
            {htmlToText(item.intro)}
          </Text>
        ) : null}
        {item.fansNum > 0 && (
          <Text style={[styles.userFans, { color: colors.textTertiary }]}>
            {formatCount(item.fansNum)} 粉丝
          </Text>
        )}
      </View>
      <SymbolView name="chevron.right" size={14} tintColor={colors.textDisabled} />
    </Pressable>
  );
});

export const SearchPostCard = React.memo(function SearchPostCard({
  item,
  colors,
  onPressItem,
}: {
  item: SearchPostResult;
  colors: any;
  onPressItem: (item: SearchPostResult) => void;
}) {
  const preview = React.useMemo(() => htmlToText(item.content || ''), [item]);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.postCard,
        {
          backgroundColor: colors.card,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
      onPress={() => onPressItem(item)}
    >
      <Text style={[styles.postTitle, { color: colors.text }]} numberOfLines={2}>
        {item.title || '无标题'}
      </Text>
      <Text style={[styles.postPreview, { color: colors.textSecondary }]} numberOfLines={2}>
        {preview}
      </Text>
      <View style={styles.postFooter}>
        <Text style={[styles.postAuthor, { color: colors.textTertiary }]}>
          {item.authorName}
        </Text>
        <View style={styles.postStats}>
          <Text style={[styles.postStat, { color: colors.textTertiary }]}>
            {formatCount(item.replyNum)}回复
          </Text>
          <Text style={[styles.postStat, { color: colors.textTertiary }]}>
            {relativeTime(item.createTime * 1000)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // Thread card
  threadCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: Radius.card,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  threadAuthor: {
    fontSize: 13,
    flex: 1,
  },
  threadTime: {
    fontSize: 12,
  },
  threadTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 22,
  },
  threadContent: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  threadFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  forumChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.chip,
  },
  forumChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  threadStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
  },

  // Forum card
  forumCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: Radius.card,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  forumInfo: {
    flex: 1,
    gap: 3,
  },
  forumName: {
    fontSize: 16,
    fontWeight: '600',
  },
  forumMeta: {
    fontSize: 13,
  },
  likedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  likedText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // User card
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: Radius.card,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  userIntro: {
    fontSize: 13,
  },
  userFans: {
    fontSize: 12,
    marginTop: 2,
  },

  // In-forum post card
  postCard: {
    padding: 16,
    borderRadius: Radius.chip,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 0.5,
    borderColor: 'rgba(128,128,128,0.12)',
  },
  postTitle: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    marginBottom: 6,
  },
  postPreview: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  postFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  postAuthor: {
    fontSize: 12,
  },
  postStats: {
    flexDirection: 'row',
    gap: 10,
  },
  postStat: {
    fontSize: 11,
  },
});
