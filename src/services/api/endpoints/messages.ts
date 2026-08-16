import { apiPost } from '../client';
import { extractData, postFormAction, toMillis } from './helpers';
import type { MessageItem, NotificationCount } from '@/types';
// ============================================================
// Messages — 对齐 Kotlin NewTiebaApi (POST, FORCE_LOGIN)
// ============================================================
// Kotlin: POST /c/s/msg (bookmark=1)
// Kotlin: POST /c/u/feed/replyme (pn=0)
// Kotlin: POST /c/u/feed/atme (pn=0)
// Kotlin: POST /c/u/feed/agreeme (pn=0)
//
// 消息 proto 化评估：replyMe/atMe/agreeMe 的 proto（ReplyMe.proto cmd=303007 族）
// 依赖 ReplyList/User/Zan 等大量嵌套描述符，工程量与验证成本高；
// 按任务授权"至少保留现有 JSON 实现并新增 GetMoreMsg 分类查询"执行。
// 现有 JSON 实现全部保留，另新增 getMoreMsg 分类查询。

export async function msg(): Promise<NotificationCount> {
  const raw = extractData(await apiPost<any>('/c/s/msg', { bookmark: '1' })).data;
  return { reply: raw?.reply ?? 0, at: raw?.at ?? 0, agree: raw?.agree ?? 0, total: (raw?.reply ?? 0) + (raw?.at ?? 0) + (raw?.agree ?? 0) };
}

export type MsgCategory = 'reply' | 'at' | 'agree';

/**
 * 映射服务端消息单条（snake_case）为 UI MessageItem（camelCase）。
 * 服务端 reply_list / at_list / agree_list 字段命名不完全一致，统一用 ?? 容错
 * （同时兼容 snake_case 与 camelCase）：
 * - user_id → fromUserId、user_name → fromUserName、user_portrait → fromUserPortrait
 * - thread_id → threadId、thread_title → threadTitle、post_id → postId
 * - is_read → isRead（兼容 1 / '1' / true）
 * - time / create_time / reply_time / agree_time → createTime（toMillis 统一毫秒，不乘 1000）
 */
export function mapMessageItem(raw: any, type: MessageItem['type'] = 'reply'): MessageItem {
  if (!raw || typeof raw !== 'object') {
    return {
      id: '', type, fromUserId: '', fromUserName: '', fromUserPortrait: '',
      threadId: '', threadTitle: '', content: '', createTime: 0, isRead: false,
    };
  }
  const threadId = String(raw.thread_id ?? raw.threadId ?? raw.tid ?? '');
  const postId = raw.post_id ?? raw.postId ?? raw.pid;
  return {
    id: String(raw.id ?? raw.reply_id ?? raw.msg_id ?? threadId ?? ''),
    type,
    fromUserId: String(raw.user_id ?? raw.userId ?? raw.from_user_id ?? raw.fromUserId ?? raw.uid ?? ''),
    fromUserName: raw.user_name ?? raw.userName ?? raw.name ?? '',
    fromUserPortrait: raw.user_portrait ?? raw.userPortrait ?? raw.portrait ?? '',
    threadId,
    threadTitle: raw.thread_title ?? raw.threadTitle ?? raw.title ?? '',
    postId: postId != null ? String(postId ?? '') : undefined,
    content: raw.content ?? raw.reply_content ?? raw.replyContent ?? raw.summary ?? '',
    createTime: toMillis(Number(raw.time ?? raw.create_time ?? raw.createTime ?? raw.reply_time ?? raw.agree_time ?? 0)),
    isRead: raw.is_read === 1 || raw.is_read === '1' || raw.is_read === true || raw.isRead === 1 || raw.isRead === true,
  };
}

export async function replyMe(page: number = 0, signal?: AbortSignal): Promise<{ items: MessageItem[]; hasMore: boolean }> {
  const raw = await postFormAction<any>('/c/u/feed/replyme', { pn: String(page) }, signal);
  const list = raw?.data?.reply_list ?? raw?.reply_list ?? [];
  return {
    // 新字段形状：reply_list 映射为 camelCase MessageItem（旧实现透传 snake_case，UI 读 item.fromUserId / item.createTime 等恒空）
    items: Array.isArray(list) ? list.map((i: any) => mapMessageItem(i, 'reply')) : [],
    hasMore: (raw?.data?.has_more ?? raw?.has_more ?? 0) === 1,
  };
}

export async function atMe(page: number = 0, signal?: AbortSignal): Promise<{ items: MessageItem[]; hasMore: boolean }> {
  const raw = await postFormAction<any>('/c/u/feed/atme', { pn: String(page) }, signal);
  const list = raw?.data?.at_list ?? raw?.at_list ?? [];
  return {
    // 新字段形状：at_list 映射为 camelCase MessageItem
    items: Array.isArray(list) ? list.map((i: any) => mapMessageItem(i, 'at')) : [],
    hasMore: (raw?.data?.has_more ?? raw?.has_more ?? 0) === 1,
  };
}

export async function agreeMe(page: number = 0, signal?: AbortSignal): Promise<{ items: MessageItem[]; hasMore: boolean }> {
  const raw = await postFormAction<any>('/c/u/feed/agreeme', { pn: String(page) }, signal);
  const list = raw?.data?.agree_list ?? raw?.agree_list ?? [];
  return {
    // 新字段形状：agree_list 映射为 camelCase MessageItem
    items: Array.isArray(list) ? list.map((i: any) => mapMessageItem(i, 'agree')) : [],
    hasMore: (raw?.data?.has_more ?? raw?.has_more ?? 0) === 1,
  };
}

/**
 * GetMoreMsg 分类查询：按 category 只拉当前分类对应接口，hasMore 只取当前分类。
 * 说明：GetMoreMsg proto（GetMoreMsgReqIdl）仅有 common 字段、数据体在
 * MsgContent 中为文本类，价值有限；此处按任务授权先落地 JSON 分类查询，
 * 后续如需 proto 化再补描述符（CMD=303017 待真机验证）。
 *
 * !!! NOTIFICATIONS-ADAPTER !!!
 * 签名已从 getMoreMsg(page, signal) 变更为 getMoreMsg(category, page, signal)：
 * - notifications.tsx 的 usePagedList fetcher 需改为按当前分段传入 category，
 *   例如 getMoreMsg(params.type, p - 1, signal)，并移除 items.filter(i => i.category === params.type) 过滤。
 * - 返回值不再包含 counts（未读数请单独调用 msg() / loadNotificationCounts()）。
 * - hasMore 只反映当前分类的翻页状态（原实现三源或合并，分类耗尽后会空翻页）。
 */
export async function getMoreMsg(
  category: MsgCategory,
  page: number = 0,
  signal?: AbortSignal,
): Promise<{ items: (MessageItem & { category: MsgCategory })[]; hasMore: boolean }> {
  const res =
    category === 'at' ? await atMe(page, signal)
      : category === 'agree' ? await agreeMe(page, signal)
        : await replyMe(page, signal);
  return {
    items: res.items.map((i) => ({ ...i, category })),
    hasMore: res.hasMore,
  };
}



