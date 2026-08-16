# 第 2 轮审查：头像与图片管线（Avatar.tsx / thumbnail.ts / useNativeThumbnail.ts / TiebaImageIO.swift）

## 🔴 P0 级发现（定罪）

### R2-01【头像无法显示·实锤】`getAvatarUrl` 对 `http://` 完整 URL 原样透传，全代码库无任何 http→https 归一化
- `src/utils/index.ts:134`：`if (portrait.startsWith('http://') || ...) return portrait;` —— 贴吧 API 的 `portrait` 字段经常直接返回 `http://tb.himg.baidu.com/...` 完整 URL。
- 注释声称"Plain http:// inputs are left untouched here and handled by the consumer / link-opener layer"，但 grep 全库：**没有任何消费者做 http→https 转换**（唯一的 `replace` 搜索结果为零）。
- Avatar.tsx 直接 `source={{ uri: avatarUri }}` 交给 expo-image → ATS 拦截 → `onError` → 永远显示首字母 fallback。
- **修复**：在 `getAvatarUrl` 中把 `http://` 统一改写为 `https://`（百度图床全支持 TLS）。同时给帖子图片做同样的 `sanitizeImageUrl()`。

### R2-02【图片无法显示·同根因】`useNativeThumbnail` 失败回退返回原始 `sourceUri`
- `useNativeThumbnail.ts:36`：native 下载失败时 `return sourceUri`——若原图是 `http://`，native `URLSession`（同样遵守 ATS）必然失败，回退后 expo-image 加载 `http://` 也必然失败 → 列表缩略图全挂。
- 且 `TiebaImageIO.download`（Swift）内部没有任何协议修正。
- **修复**：`useNativeThumbnail` 与 `TiebaImageIO.makeThumbnail` 入口处统一 `URL(scheme: "https")` 替换。

### R2-03【图片无法显示·第二根因】`thumbnailUrl()` 对非 `/forum/` 路径原样返回 http URL
- `thumbnail.ts:42`：非图床路径不处理协议。`imgsrc.baidu.com` 的 URL 若为 `http://`（API 常见），同样被 ATS 拦。
- 修复同上：在 thumbnailUrl 入口统一 https 化。

## 🟠 P1 级发现

### R2-04 `useNativeThumbnail` 初始返回空串 → 组件渲染空占位闪烁
- hook 初始 `uri=''`，调用方若直接用它渲染 Image 会先空白再闪现，没有 placeholder/skeleton 过渡。建议初始直接返回 `sourceUri`（expo-image 自带缓存），native 缩略图就绪后再切换，减少闪烁。

### R2-05 `TiebaImageIO` 内存缓存存的是 JPEG 压缩数据而非解码位图
- `memoryCache: NSCache<NSString, NSData>` 命中后仍需完整 JPEG 解码才能上屏，"memory cache" 名不副实。要么存解码后的缩略 `UIImage`/CGImage（真正省 CPU），要么干脆删掉这层只留磁盘缓存，省 50MB 内存预算（内存受限场景值得）。

### R2-06 水印渲染未固定 scale，3x 设备内存放大 9 倍
- `applyWatermark` 用默认 `UIGraphicsImageRenderer`（scale=屏幕scale），4000×3000 的图在 3x 屏渲染 12000×9000 位图 ≈ 400MB 峰值 → 低内存设备直接 OOM 闪退（可能就是"点击按钮直接闪退"的一类）。**必须** `UIGraphicsImageRendererFormat` + `format.scale = 1`。

### R2-07 `enforceDiskLimit` 每写一张图就全目录扫描
- O(n) 目录枚举 + 排序，图片多时（上限 200MB，几千个小文件）在每张图写盘后都执行。建议节流（如每 N 次写或后台延迟合并执行）。

### R2-08 Avatar 组件细节
- ✅ 好的方面：recyclingKey、FlashList 回收 reset、allowFontScaling={false} 都做对了。
- ⚠️ `initials?.slice(0, 2).toUpperCase() ?? '?'`：中文用户名 toUpperCase 无意义，两个中文字符占宽可能超 40px 圆（fontSize 0.38*size=15px 两个中文≈30px OK）。可接受。
- ⚠️ 无 `placeholder`（blurhash/主色）：图片加载中是纯色圆，与 iOS 26 App 的渐入体验有差距。expo-image 支持 `placeholder={{ blurhash }}` 或 thumbhash —— 贴吧头像小，直接 `transition` 即可，但建议加 `placeholderThumbHash` 支持。
- ⚠️ Lv 徽章样式：iOS 26 风格应更轻（capsule + .ultraThinMaterial），当前纯色 accent 方块略重。低优先级。

### R2-09 头像 URL 拼接不带尺寸参数
- `getAvatarUrl` 固定拼 `sys/portrait/item/{portrait}`，贴吧支持 `...item/{portrait}s` 小图后缀（部分客户端用 `_s`）。信息流几百个 40px 头像拉原图（portrait 原图可达 100KB+），流量/内存/解码全浪费。建议小尺寸场景拼接小图变体并验证 CDN 支持。

## 本轮结论
头像/图片显示问题 = **ATS 禁 HTTP（R1-01）+ 全链路无 https 归一化（R2-01/02/03）**，三处叠加。这是用户报告"无法显示头像、无法显示帖子图片"的第一根因链，修复成本低（一个 sanitize 函数 + 三个入口调用）。
