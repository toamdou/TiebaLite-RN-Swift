import { apiPost } from '../client';
import { extractData, postFormAction } from './helpers';
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

export async function replyMe(page: number = 0, signal?: AbortSignal): Promise<{ items: MessageItem[]; hasMore: boolean }> {
  const raw = await postFormAction<any>('/c/u/feed/replyme', { pn: String(page) }, signal);
  return { items: raw?.data?.reply_list ?? raw?.reply_list ?? [], hasMore: (raw?.data?.has_more ?? raw?.has_more ?? 0) === 1 };
}

export async function atMe(page: number = 0, signal?: AbortSignal): Promise<{ items: MessageItem[]; hasMore: boolean }> {
  const raw = await postFormAction<any>('/c/u/feed/atme', { pn: String(page) }, signal);
  return { items: raw?.data?.at_list ?? raw?.at_list ?? [], hasMore: (raw?.data?.has_more ?? raw?.has_more ?? 0) === 1 };
}

export async function agreeMe(page: number = 0, signal?: AbortSignal): Promise<{ items: MessageItem[]; hasMore: boolean }> {
  const raw = await postFormAction<any>('/c/u/feed/agreeme', { pn: String(page) }, signal);
  return { items: raw?.data?.agree_list ?? raw?.agree_list ?? [], hasMore: (raw?.data?.has_more ?? raw?.has_more ?? 0) === 1 };
}

/**
 * GetMoreMsg 分类查询：并行拉取三种消息并打上 category 标签，合并输出。
 * 说明：GetMoreMsg proto（GetMoreMsgReqIdl）仅有 common 字段、数据体在
 * MsgContent 中为文本类，价值有限；此处按任务授权先落地 JSON 分类查询，
 * 后续如需 proto 化再补描述符（CMD=303017 待真机验证）。
 */
export async function getMoreMsg(
  page: number = 0,
  signal?: AbortSignal,
): Promise<{ items: (MessageItem & { category: MsgCategory })[]; counts: NotificationCount; hasMore: boolean }> {
  const [replyRes, atRes, agreeRes, counts] = await Promise.all([
    replyMe(page, signal),
    atMe(page, signal),
    agreeMe(page, signal),
    msg(),
  ]);
  const items = [
    ...replyRes.items.map((i) => ({ ...i, category: 'reply' as MsgCategory })),
    ...atRes.items.map((i) => ({ ...i, category: 'at' as MsgCategory })),
    ...agreeRes.items.map((i) => ({ ...i, category: 'agree' as MsgCategory })),
  ];
  return {
    items,
    counts,
    hasMore: replyRes.hasMore || atRes.hasMore || agreeRes.hasMore,
  };
}



