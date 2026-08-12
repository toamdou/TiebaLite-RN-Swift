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
 */
export function thumbnailUrl(url: string, width: number): string {
  if (!url || typeof url !== 'string') return url;
  if (!(width > 0)) return url;

  // 仅重写贴吧图床 URL
  if (!TIEBA_CDN_RE.test(url)) return url;

  // 剥离已有尺寸段，避免嵌套：w%3D580、w%3D580%3Bq%3D90、w=580、query 参数
  const clean = url
    .replace(/w%3d\d+(?:%3bq%3d\d+|;q=\d+)?/gi, '')
    .replace(/[?&](?:w|width)=\d+/g, '');

  // 非 /forum/ 路径（头像、表情等）无法按此规则缩放，原样返回
  if (!/\/forum\//i.test(clean)) return url;

  // 在第一个 /forum/ 后注入尺寸段；pic/item 与原 sign= 两种路径都适用
  return clean.replace(/\/forum\//i, `/forum/w%3D${width}%3Bq%3D90/`);
}
