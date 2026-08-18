import { apiPost } from '../client';
import type { AxiosResponse } from '../client';
import { TiebaApiError, assertSuccessPayload } from '../interceptors';
import { getTbsSync, getStokenSync } from '@/services/storage/AuthSQLiteStorage';
import { EMOTICON_NAME_MAP, buildEmoticonSrc } from '@/constants/emoticons';
import type { MediaInfo, PostInfo, SubPostInfo } from '@/types';

/** 获取真实 tbs（反 token）；只读接口可容忍空值。 */
export function getTbs(): string {
  return getTbsSync() || '';
}

/**
 * 时间戳契约（跨代理）：proto/JSON 秒级时间戳统一转毫秒输出。
 * - 已是毫秒（>= 1e11，13 位）保持不变
 * - 秒级（10 位）×1000
 * UI 层按"helpers 输出已是毫秒"消费。
 */
export function toMillis(v: number): number {
  if (!v || !isFinite(v)) return 0;
  return v >= 100000000000 ? v : v * 1000;
}

/** 写接口强制要求真实 tbs，不再返回假值 '1'。 */
export async function requireTbs(): Promise<string> {
  const tbs = getTbsSync();
  if (tbs) return tbs;
  // P0 续期：tbs 缺失/过期时自动向 /c/s/login 重新获取一次（对齐 aiotieba __init_tbs）
  try {
    const { fetchTbs } = await import('./auth');
    const refreshed = await fetchTbs();
    if (refreshed) return refreshed;
  } catch (e) {
    if (__DEV__) console.warn('[requireTbs] refresh failed:', e);
  }
  throw new TiebaApiError('缺少 tbs，无法执行此操作，请刷新页面后重试', 400, 400);
}

/** 获取 stoken */
export function getStoken(): string {
  return getStokenSync() || '';
}

// ============================================================
// Helpers
// ============================================================

export interface TiebaRes<T> { code: number; data: T; message?: string; error_code?: string; error_msg?: string; }
export interface ClientDataRes<T> { data: T; }

export function extractData<T>(response: AxiosResponse<T>): T { return response.data; }

/**
 * Throw a TiebaApiError when a protobuf response carries a non-zero error.
 */
export function assertProtoSuccess(decoded: {
  error?: { error_code?: number; error_msg?: string };
}): void {
  assertSuccessPayload(decoded, false);
}

/**
 * POST a form action and throw on non-zero API code. Returns the full
 * response body for callers that need nested payloads.
 */
export async function postFormAction<T = any>(
  url: string,
  body: Record<string, string | number | boolean | undefined>,
  signal?: AbortSignal,
): Promise<T> {
  const response = extractData(await apiPost<T>(url, body, undefined, signal));
  assertSuccessPayload(response, false);
  return response;
}
/**
 * Build a uid → user lookup map. `keyOf` picks the uid field(s): mapProtoThread
 * accepts several aliases while mapProtoPosts aligns with Kotlin
 * PbPageRepository (user.id only).
 */
function buildUserMap(userList: any[], keyOf: (u: any) => string): Map<string, any> {
  const map = new Map<string, any>();
  for (const u of userList) {
    const uid = String(keyOf(u) ?? '');
    if (uid) map.set(uid, u);
  }
  return map;
}

/** 贴吧图床域名（头像/帖子图）——iOS ATS 禁 http，图床 URL 升级为 https */
const TIEBA_IMG_RE = /(imgsrc|tiebapic|hiphotos|himg|gss\d?)\.baidu\.com/i;

/** 图床 http/协议相对 → https（ATS 明文拦截；非图床 URL 原样透传） */
export function toHttpsImgUrl(src: string): string {
  if (!src) return src;
  if (src.startsWith('http://')) {
    return TIEBA_IMG_RE.test(src) ? src.replace(/^http:\/\//i, 'https://') : src;
  }
  // 协议相对 URL（//imgsrc.baidu.com/...）：expo-image 不识别 // 开头
  if (src.startsWith('//')) {
    return TIEBA_IMG_RE.test(src) ? `https:${src}` : src;
  }
  return src;
}

export function mapMediaList(raw: any): MediaInfo[] {
  const list = [raw?.media, raw?.media_list].find(Array.isArray) ?? (Array.isArray(raw) ? raw : []);
  const result: MediaInfo[] = [];
  for (const m of list) {
    if (!m || typeof m !== 'object') continue;
    const mediaType = String(m.type ?? '');
    // ⚠️ 只有显式视频类型/字段才算视频。贴吧 media 的数字 type（1/2/3…）
    // 是图片类型（普通图/动图/长图），不能当视频——之前误判导致所有
    // 帖子左上角都出现播放标识、封面图被当成视频走播放器。
    const isVideo =
      mediaType === 'video' ||
      !!(m.vsrc ?? m.video_src ?? m.videoSrc ?? m.video);
    // ⚠️ 列表/卡片显示用“服务端已算好的中等尺寸图”(bigPic ~960px) 优先：
    // 2026-08 Tieba CDN 已停用客户端注入的 w= 尺寸段（一律返回默认「贴」占位图），
    // 只有服务端带 sign 的尺寸 URL（bigPic/srcPic）与裸 /pic/item/ 原图真实可显示。
    // 故 src 直接取服务端派生图原样显示（thumbnailUrl 不再改写），裸原图兜底。
    const src = toHttpsImgUrl(String(
      m.bigPic ?? m.big_pic ?? m.bigSrc ?? m.big_src ??
      m.srcPic ?? m.src_pic ?? m.src ??
      m.originPic ?? m.origin_pic ?? m.originSrc ?? m.origin_src ?? '',
    ));
    if (!src) continue;
    result.push({
      type: isVideo ? 'video' : 'image',
      src,
      originSrc:
        toHttpsImgUrl(String(m.originPic ?? m.origin_pic ?? m.originSrc ?? m.origin_src ?? m.bigPic ?? m.big_pic ?? '')) || undefined,
      poster:
        String(m.poster ?? m.video_poster ?? m.videoPoster ?? '') ||
        (isVideo ? src : undefined),
      width: Number(m.width ?? 0) || 300,
      height: Number(m.height ?? 0) || 300,
      duration: m.duration != null ? Number(m.duration) : undefined,
    });
  }
  return result;
}

/** Map raw protobuf/JSON thread objects to UI ThreadInfo. */
export function mapProtoThread(
  raw: any,
  opts?: { forum?: any; userList?: any[]; forumName?: string },
): any {
  if (!raw) return {};
  const userList = opts?.userList ?? [];
  const userMap = buildUserMap(userList, (u) => u.id ?? u.uid ?? u.user_id ?? '');
  const authorId = String(raw.authorId ?? raw.author_id ?? raw.author?.id ?? '');
  // ⚠️ raw.author 可能是"存在但为空对象 {}"（proto3 解码产物），`??` 不会
  // 回退到 userMap → 作者名/头像全空。必须判空：author 有键才用内嵌，
  // 否则从 userList 按 authorId 匹配（对齐 Kotlin userList.first { id == authorId }）。
  const rawAuthor = raw.author && typeof raw.author === 'object' && Object.keys(raw.author).length > 0
    ? raw.author
    : undefined;
  const author = rawAuthor ?? userMap.get(authorId) ?? {};
  const forum = opts?.forum ?? {};
  const forumName = opts?.forumName ?? raw.forumName ?? raw.forum_name ?? forum?.name ?? '';
  const abstractRaw = raw._abstract ?? raw.abstract;
  const abstract = Array.isArray(abstractRaw)
    ? abstractRaw
        .map((a: any) => (typeof a === 'string' ? a : (a?.text ?? a?.txt ?? a?.content ?? '')))
        .join('')
    : String(abstractRaw ?? '');
  const originRaw = raw.originThreadInfo ?? raw.origin_thread_info;
  const mediaList = mapMediaList(raw);
  return {
    id: String(raw.id ?? raw.threadId ?? raw.thread_id ?? ''),
    threadId: String(raw.threadId ?? raw.thread_id ?? raw.id ?? ''),
    title: raw.title ?? '',
    forumId: String(raw.forumId ?? raw.forum_id ?? raw.fid ?? forum?.id ?? ''),
    forumName: forumName || raw.fname || '',
    forumAvatar: forum?.avatar ?? raw.forumAvatar ?? raw.forum_avatar ?? '',
    authorId,
    authorName: author.name ?? author.userName ?? author.user_name ?? '',
    authorNameShow:
      author.nameShow ?? author.name_show ?? author.showNickname ?? author.show_nickname ?? author.name ?? '',
    authorPortrait: author.portrait ?? '',
    authorLevelId: Number(author.levelId ?? author.level_id ?? 0),
    replyNum: Number(raw.replyNum ?? raw.reply_num ?? 0),
    viewNum: Number(raw.viewNum ?? raw.view_num ?? 0),
    lastTime: toMillis(Number(raw.lastTimeInt ?? raw.last_time_int ?? raw.lastTime ?? raw.last_time ?? 0)),
    createTime: toMillis(Number(raw.createTime ?? raw.create_time ?? 0)),
    isTop: (raw.isTop ?? raw.is_top ?? 0) === 1,
    isGood: (raw.isGood ?? raw.is_good ?? 0) === 1,
    isVideo:
      (raw.isVideo ?? raw.is_video ?? 0) === 1 ||
      !!raw.videoInfo ||
      !!raw.video_info ||
      mediaList.some((m) => m.type === 'video'),
    mediaList,
    abstract,
    // 字段裁剪（P1）：firstPostContent 无任何 UI 读取（grep src/app、src/components 确认），
    // 且为整篇首楼全文，占用大，从输出白名单中移除。
    zanNum: Number(raw.agreeNum ?? raw.agree_num ?? raw.agree?.agreeNum ?? raw.agree?.agree_num ?? 0),
    shareNum: Number(raw.shareNum ?? raw.share_num ?? 0),
    hasAgree: (raw.agree?.hasAgree ?? raw.agree?.has_agree ?? raw.hasAgree ?? raw.has_agree ?? 0) === 1,
    isShareThread: (raw.isShareThread ?? raw.is_share_thread ?? 0) === 1,
    originThreadInfo: originRaw
      ? {
          title: originRaw.title ?? '',
          content: originRaw.content ?? '',
          forumName: originRaw.fname ?? originRaw.forumName ?? '',
          media: mapMediaList(originRaw),
        }
      : undefined,
  };
}

/** Map protobuf Post objects to PostInfo format expected by UI */
export function mapProtoPosts(rawPosts: any[], threadId: string, userList: any[] = []): PostInfo[] {
  // Build user lookup map (mirrors Kotlin PbPageRepository: userList.first { user.id == post.author_id })
  const userMap = buildUserMap(userList, (u) => u.id ?? '');

  return rawPosts.map((p: any) => {
    // Lookup author: embedded in post, or from userList by authorId
    // ⚠️ p.author 可能是空对象 {}（proto3 解码产物），`??` 不会回退到
    // userMap → 回复者头像/名称全空。必须判空（与 mapProtoThread 同因）。
    const authorId = String(p.authorId ?? p.author?.id ?? '');
    const rawAuthor = p.author && typeof p.author === 'object' && Object.keys(p.author).length > 0
      ? p.author
      : undefined;
    const author = rawAuthor ?? userMap.get(authorId) ?? {};
    const rawSubPosts = p.subPostList?.subPostList ?? p.subPostList?.sub_post_list ?? [];
    // 字段裁剪（性能 P1）：UI 预览最多展示前 3 条楼中楼（PostCard slice(0,3)），
    // 完整楼中楼走 pbFloor 单独加载，故这里只映射前 3 条，避免整篇 subPosts 全文驻留内存。
    const cappedSubPosts = Array.isArray(rawSubPosts) ? rawSubPosts.slice(0, 3) : [];
    const mappedSubPosts: SubPostInfo[] = cappedSubPosts.map((sp: any) => {
      const spAuthorId = String(sp.authorId ?? sp.author_id ?? sp.author?.id ?? '');
      const spRawAuthor = sp.author && typeof sp.author === 'object' && Object.keys(sp.author).length > 0
        ? sp.author
        : undefined;
      const spAuthor = spRawAuthor ?? userMap.get(spAuthorId) ?? {};
      return {
        id: String(sp.id ?? ''),
        postId: String(p.id ?? ''),
        authorId: String(sp.authorId ?? sp.author_id ?? spAuthor.id ?? ''),
        authorName: spAuthor.name ?? '',
        authorNameShow: spAuthor.nameShow ?? spAuthor.name ?? '',
        authorPortrait: spAuthor.portrait ?? '',
        authorLevelId: Number(spAuthor.levelId ?? 0) || undefined,
        content: mapProtoContent(sp.content ?? []),
        createTime: toMillis(Number(sp.time ?? 0)),
        replyToUserName: sp.replyToUserName ?? sp.reply_to_user_name ?? '',
        ipLocation: sp.location?.addr ?? sp.ipAddress ?? spAuthor.ipAddress ?? '',
        agreeNum: Number(sp.agree?.agreeNum ?? sp.agreeNum ?? 0),
        isAgree: (sp.agree?.hasAgree ?? 0) === 1,
      };
    });
    return {
      id: String(p.id ?? ''),
      threadId: String(p.tid ?? threadId),
      forumId: '',
      forumName: '',
      floor: Number(p.floor ?? 0),
      authorId: String(p.authorId ?? author.id ?? ''),
      authorName: author.name ?? '',
      authorNameShow: author.nameShow ?? author.name ?? '',
      authorPortrait: author.portrait ?? '',
      authorLevelId: Number(author.levelId ?? 0),
      authorIsLz: (p.isLz ?? 0) === 1,
      content: mapProtoContent(p.content ?? []),
      createTime: toMillis(Number(p.time ?? 0)),
      subPostNum: Number(p.subPostNumber ?? 0),
      subPosts: mappedSubPosts,
      agreeNum: Number(p.agreeNum ?? p.agree?.agreeNum ?? 0),
      disagreeNum: Number(p.agree?.disagreeNum ?? 0),
      isAgree: (p.agree?.hasAgree ?? 0) === 1,
      // 踩状态从 proto 映射（proto 无 has_disagree 字段时保持 false，服务端下发则取真实值）
      isDisagree: (p.agree?.hasDisagree ?? p.agree?.has_disagree ?? p.isDisagree ?? p.is_disagree ?? 0) === 1,
      // 主楼/楼层 IP 属地：Post 无 ip 字段，属地挂在 author(User.ip) 上
      ipLocation: p.author?.ip ?? p.ipAddress ?? p.ip ?? '',
    };
  });
}

/** Map protobuf PbContent array to PostContent format (对齐 PostContent 渲染器期望的形状) */
export function mapProtoContent(rawContent: any[]): any[] {
  if (!Array.isArray(rawContent)) return [];
  return rawContent.map((c: any) => {
    const type = Number(c.type ?? 0);
    // PbContent types: 0=text, 1=link, 2=emoji, 3=image, 4=at, 5=video, 9=voice, 10=phone, 20=graffiti/image
    switch (type) {
      case 3:
      case 20: {
        // Image — 扁平结构 {src,width,height,originSrc}，渲染器直接读取
        // Kotlin 使用 bsize 字段（格式 "width,height"）解析尺寸
        let w = Number(c.width ?? 0);
        let h = Number(c.height ?? 0);
        if ((!w || !h) && c.bsize) {
          const parts = String(c.bsize).split(',');
          if (parts.length === 2) {
            w = parseInt(parts[0], 10) || 0;
            h = parseInt(parts[1], 10) || 0;
          }
        }
        if (!w) w = 300;
        if (!h) h = 300;
        // URL 优先级对齐 Kotlin: cdnSrc > bigCdnSrc > src
        const imgSrc = c.cdnSrc || c.bigCdnSrc || c.cdnSrcActive || c.src || '';
        const imgOrigin = c.originSrc || c.bigSrc || c.bigCdnSrc || c.src || '';
        return {
          type: 'image',
          src: imgSrc,
          originSrc: imgOrigin,
          width: w,
          height: h,
        };
      }
      case 2: {
        // Emoji/Emoticon — 贴吧经典表情渲染为内联图片
        // Proto field `c` (field 11) = emoticon name (e.g. "滑稽")
        // Proto field `text` (field 2) = emoticon ID (e.g. "image_emoticon25") or formatted "(#name)"
        const emoticonName = c.c ?? '';
        const emojiText = c.text ?? '';

        // Priority 1: Use `c` field as emoticon name (matches Kotlin: EmoticonManager.registerEmoticon(it.text, it.c))
        if (emoticonName) {
          const numByName = EMOTICON_NAME_MAP[emoticonName];
          if (numByName) {
            return {
              type: 'emoticon',
              text: emoticonName,
              src: buildEmoticonSrc(numByName),
            };
          }
        }

        // Priority 2: text field is image_emoticon{N} format
        if (/^image_emoticon\d+$/.test(emojiText)) {
          const num = parseInt(emojiText.replace('image_emoticon', ''), 10);
          return {
            type: 'emoticon',
            text: emojiText,
            src: buildEmoticonSrc(num),
          };
        }

        // Priority 3: text field is (#name) format
        const emoticonMatch = emojiText.match(/^\(#(.+?)\)$/);
        if (emoticonMatch) {
          const name = emoticonMatch[1];
          const num = EMOTICON_NAME_MAP[name];
          if (num) {
            return {
              type: 'emoticon',
              text: name,
              src: buildEmoticonSrc(num),
            };
          }
        }

        // Priority 4: text field is a plain emoticon name
        const numByText = EMOTICON_NAME_MAP[emojiText];
        if (numByText) {
          return {
            type: 'emoticon',
            text: emojiText,
            src: buildEmoticonSrc(numByText),
          };
        }

        // Fallback: render as unicode emoji
        return { type: 'emoji', text: emoticonName || emojiText };
      }
      case 1:
        // Link — 渲染器读取 url 字段
        return { type: 'link', text: c.text ?? c.link ?? '', url: c.link ?? c.text ?? '' };
      case 5: {
        // Video — 渲染器需要 src/poster/width/height
        const vw = Number(c.width ?? 0) || 280;
        const vh = Number(c.height ?? 0) || 158;
        return {
          type: 'video',
          src: c.src ?? '',
          poster: c.cdnSrc ?? c.src ?? '',
          width: vw,
          height: vh,
        };
      }
      case 9:
        // Voice — 渲染器使用 audio 段 {src,duration}
        return { type: 'audio', src: c.src ?? '', duration: Number(c.duringTime ?? 0) };
      case 4:
        // At user
        return { type: 'at', text: c.text ?? '', uid: String(c.uid ?? '') };
      default:
        // Text (type 0 or unknown)
        return { type: 'text', text: c.text ?? '' };
    }
  });
}


