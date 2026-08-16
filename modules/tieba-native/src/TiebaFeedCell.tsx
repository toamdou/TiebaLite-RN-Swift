import { requireNativeViewManager } from 'expo-modules-core';
import type { StyleProp, ViewStyle } from 'react-native';

const NativeFeedCell = requireNativeViewManager('TiebaNative', 'TiebaFeedCellView');

export interface FeedCellProps {
  /** 帖子标题（原生侧渲染，2 行截断） */
  title: string;
  /** 摘要（原生侧渲染，2 行截断） */
  summary?: string;
  /** 作者名 */
  author: string;
  /** 吧名（可选） */
  forumName?: string;
  /** 回复数（原生格式化，>=1 万显示 "x.x万"） */
  replyCount: number;
  /** 时间字符串（格式由 RN 侧做好后传入，如 "3 分钟前"） */
  timeText: string;
  /** 有图帖 Hero 图源（原生经 TiebaImageIO 加载缓存） */
  imageUrl?: string;
  /** 操作栏图标主色（主题色） */
  accentColor?: string;
  /** 主文字色 */
  textPrimary: string;
  /** 次级文字色 */
  textSecondary: string;
  /** 卡片背景（玻璃/纯色均可） */
  cardBackground?: string;
  /** 圆角（默认 20） */
  radius?: number;
  /** 可选入场 stagger 序号（>0 时覆盖原生内部递增计数器） */
  enterIndex?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

export function FeedCell({
  title,
  summary,
  author,
  forumName,
  replyCount,
  timeText,
  imageUrl,
  accentColor,
  textPrimary,
  textSecondary,
  cardBackground,
  radius = 20,
  enterIndex,
  style,
  onPress,
}: FeedCellProps) {
  return (
    <NativeFeedCell
      style={style}
      title={title}
      summary={summary}
      author={author}
      forumName={forumName}
      replyCount={replyCount}
      timeText={timeText}
      imageUrl={imageUrl}
      accentColor={accentColor}
      textPrimary={textPrimary}
      textSecondary={textSecondary}
      cardBackground={cardBackground}
      radius={radius}
      enterIndex={enterIndex}
      onPress={onPress}
    />
  );
}

export default FeedCell;
