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

/**
 * 贴吧图片 URL 统一入口。
 *
 * ⚠️ 2026-08 实测：贴吧 CDN（tiebapic / imgsrc）已停止支持客户端注入的 w= 尺寸段
 * ——任何 `.../forum/w%3D<宽>%3Bq%3D90/...` 注入都会返回默认「贴」占位图（约 4KB），
 * 只有服务端带 sign 的尺寸 URL（ThreadInfo.media 的 bigPic / srcPic）与裸
 * `/forum/pic/item/<hash>.jpg` 原图才真实可显示。因此这里不再改写路径：列表/卡片
 * 用的缩略图由 mapMediaList 直接取服务端算好的尺寸图（bigPic → srcPic 优先）。
 * 本函数保留的意义：统一做 ATS 协议升级（http / 协议相对 → https）与本地 URI 透传。
 */
export function thumbnailUrl(url: string, width: number): string {
  if (!url || typeof url !== 'string') return url;
  if (!(width > 0)) return url;

  // ATS 禁止明文 HTTP：统一升级协议（本地 URI 原样返回）；
  // 协议相对 URL（//imgsrc.baidu.com/...）同样补全为 https:（expo-image 不识别 // 开头）
  return (url.startsWith('http://') || url.startsWith('//'))
    && !url.startsWith('file://') && !url.startsWith('ph://') && !url.startsWith('data:')
    ? url.replace(/^http:\/\//i, 'https://').replace(/^\/\//, 'https://')
    : url;
}

/**
 * 省流量模式下的查看器图片选择。
 *
 * 贴吧图片分两档：originSrc = 原图（可数 MB，查看器默认加载）；src = 服务端
 * 中等尺寸图（bigPic ~960px，列表/帖内缩略图用）。开启省流量后，查看器大图
 * 改用 src（bigPic），画质在手机屏幕上几乎无感，流量省 60-80%。
 */
export type ViewerImageMode = 'off' | 'on';

export function pickViewerImages(
  images: { src?: string; originSrc?: string }[],
  mode: ViewerImageMode,
): string[] {
  return images.map((i) => {
    const preferred = mode === 'on' ? i.src : i.originSrc || i.src;
    return preferred || i.src || '';
  });
}
