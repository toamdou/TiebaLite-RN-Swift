/**
 * 贴吧图床缩略图工具
 *
 * Tieba CDN（imgsrc / tiebapic.baidu.com）支持服务端按宽度缩放：
 *   - 原图：  https://imgsrc.baidu.com/forum/pic/item/<hash>.jpg
 *   - 缩略：  https://imgsrc.baidu.com/forum/w%3D360%3Bq%3D90/pic/item/<hash>.jpg
 *   - 旧格式： https://imgsrc.baidu.com/forum/<hash>.jpg
 *            → https://imgsrc.baidu.com/forum/w%3D360%3Bq%3D90/<hash>.jpg
 *
 * 非贴吧图床 / 无 /forum/ 路径（如头像 http://tb.himg.baidu.com/sys/portrait/）的
 * URL 原样返回，不做任何改写。
 */

/** 信息流列表图宽度（全屏查看器相邻页） */
export const THUMB_LIST = 360;
/** 帖子正文图宽度（线程详情页 ImageSegment，兼顾清晰度与内存） */
export const THUMB_POST = 600;
/** 信息流卡片 Hero 图宽度 */
export const THUMB_CARD = 200;
/** 头像缩略图宽度 */
export const THUMB_AVATAR = 96;

const TIEBA_CDN_RE = /(imgsrc|tiebapic|hiphotos|himg)\.baidu\.com/i;

/**
 * 将贴吧图床图片 URL 改写为指定宽度的服务端缩略图。
 * 已在 URL 中的尺寸段会被替换（避免 w%3D 嵌套），非图床 URL 原样返回。
 * 协议统一升级为 https（ATS 禁止明文 HTTP，http 图 URL 会被系统拦截）。
 */
export function thumbnailUrl(url: string, width: number): string {
  if (!url || typeof url !== 'string') return url;
  if (!(width > 0)) return url;

  // ATS 禁止明文 HTTP：统一升级协议（本地 URI 原样返回）；
  // 协议相对 URL（//imgsrc.baidu.com/...）同样补全为 https:（expo-image 不识别 // 开头）
  const httpsUrl = (url.startsWith('http://') || url.startsWith('//'))
    && !url.startsWith('file://') && !url.startsWith('ph://') && !url.startsWith('data:')
    ? url.replace(/^http:\/\//i, 'https://').replace(/^\/\//, 'https://')
    : url;

  // 仅重写贴吧图床 URL
  if (!TIEBA_CDN_RE.test(httpsUrl)) return httpsUrl;

  // 剥离已有尺寸段，避免嵌套。贴吧图床尺寸段格式（顺序不固定）：
  //   w%3D720%3Bq%3D60            （宽+质量）
  //   w%3D720%3Bq%3D60%3Bg%3D0    （宽+质量+灰度，老接口常见）
  //   w%3D120%3Bh%3D120           （宽+高，头像/吧徽）
  // ⚠️ 必须把 w 后所有 %3B<字母>%3D<数字> 段整组剥掉；只剥 q/h 会残留
  // %3Bg%3D0 之类尾巴 → 生成坏 URL（w%3D96%3Bq%3D90/%3Bg%3D0/...）→ 图片全挂。
  const clean = httpsUrl
    .replace(/w%3d\d+(?:%3b[a-z]%3d\d+)*/gi, '')
    .replace(/[?&](?:w|width)=\d+/g, '')
    .replace(/\/forum\/\//, '/forum/');

  // 非 /forum/ 路径（头像、表情等）无法按此规则缩放，原样返回（已 https 化）
  if (!/\/forum\//i.test(clean)) return httpsUrl;

  // 在第一个 /forum/ 后注入尺寸段；pic/item 与原 sign= 两种路径都适用
  return clean.replace(/\/forum\//i, `/forum/w%3D${width}%3Bq%3D90/`);
}
