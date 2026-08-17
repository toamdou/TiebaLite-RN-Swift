/**
 * 楼中楼页面（subposts）的上一级回复缓存。
 *
 * 从帖子页点「查看更多回复」跳转时，把被点击的那条回复（作者 + 全文 + 图片）
 * 临时存在模块级 Map 里，避免把富文本 content 塞进 URL query 参数
 * （超长、特殊字符、encode 易错）。subposts 页按 postId 取回渲染。
 * 仅存活于当前 JS 会话；整包 reload / 直接深链进入时未命中，会回退展示主楼卡。
 */
import type { PostInfo } from '@/types';

export interface ParentPostSummary {
  id: string;
  authorId: string;
  authorName: string;
  authorNameShow: string;
  authorPortrait: string;
  authorLevelId?: number;
  authorIsLz?: boolean;
  content: PostInfo['content'];
  createTime: number;
  ipLocation?: string;
}

const cache = new Map<string, ParentPostSummary>();

export function cacheParentPost(post: PostInfo) {
  if (!post?.id) return;
  cache.set(post.id, {
    id: post.id,
    authorId: post.authorId,
    authorName: post.authorName,
    authorNameShow: post.authorNameShow,
    authorPortrait: post.authorPortrait,
    authorLevelId: post.authorLevelId,
    authorIsLz: post.authorIsLz,
    content: post.content,
    createTime: post.createTime,
    ipLocation: post.ipLocation,
  });
}

export function getParentPostSummary(postId?: string): ParentPostSummary | undefined {
  if (!postId) return undefined;
  return cache.get(postId);
}
