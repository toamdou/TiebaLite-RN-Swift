# 修复实施报告（2026-08-16）

对应审查报告：round-01 ~ round-40-50。验证：`npx tsc --noEmit` 0 错误（修复前基线 39 个错误）、`npx eslint src/**/*.{ts,tsx}` 0 错误 0 警告（修复前 10 错误 6 警告）。

## 一、用户四大症状的根因修复

### 头像/帖子图片不显示（ATS 禁 HTTP + 全链路无 https 归一化）
- `src/utils/index.ts`：新增 `sanitizeUrl()`；`getAvatarUrl` 对 `http://` 输入升级为 `https://`。
- `src/utils/thumbnail.ts`：`thumbnailUrl` 入口统一协议升级（含非图床返回值）。
- `src/hooks/useNativeThumbnail.ts`：native 调用与失败回退均走 sanitize。
- `modules/tieba-native/ios/TiebaImageIO.swift`：`upgradeToHTTPS()`——makeThumbnail 与 applyWatermark 的下载入口统一升级。
- `src/services/media.ts`：保存/分享下载入口 sanitize。

### 闪退
- 水印 OOM：`applyWatermark` 用 `UIGraphicsImageRendererFormat` 固定 `scale = 1`（3x 屏放大 9 倍位图的 ~400MB 峰值消除）。
- 全局 JS 错误兜底：`_layout.tsx` 注册 `ErrorUtils.setGlobalHandler`（dev 打印堆栈）。
- forum/search.tsx 缺 `useRef` 导入（进入吧内搜索即 ReferenceError 崩溃）——已补导入。

### 加载不出界面（错误吞噬）
- `forumStore.loadForumData`：page-1 业务/网络错误改为 rethrow → 页面 ErrorState + 重试可出现。
- `forumStore.loadFollowedForums`：同样 rethrow → 首页失败显示重试而非"暂无关注的贴吧"。

### 回复内容/主贴错位
- `thread/[id].tsx`：新增 `extra.current`（服务端当前页）；仅 `!postId && current===1` 时把 posts[0] 当主贴，带 postId/跳页时全部楼层按回复渲染（旧实现把普通回复当楼主帖展示并吞掉第一条回复）。

## 二、P1 级 Bug 修复
- `usePagedList`：`loadingMoreRef` 在 finally 顶部无条件复位（旧：被刷新抢占时永久卡 true → 分页失效）。
- forum 页双重请求：tab-effect 移除 `currentForum?.forumId` 依赖 + `loadedTabRef` 已加载 tab 不重拉；热门/最新分桶（store 新增 newestThreads/newestPage/newestHasMore），切 tab 不再互相冲刷。
- `TiebaRichTextView.swift`：表情下载完成后重新赋值 `attributedText` 强制 TextKit 重排（灰色占位残留根因）；全部 props didSet 改为 `scheduleRebuild()` 脏标记合并（一次渲染只重建一次）。
- explore 外层 SwiftUI VStack → RN View（三个 RN 子节点的容器，消除 flex 语义失效风险）；index.tsx 的 FlashList/骨架/错误态用 `RNHostView` 包裹进 VStack（与文件内既有模式一致）。
- 楼中楼：点赞乐观更新 + 失败回滚（旧：永远无反馈）；80px 缩略图改走 `thumbnailUrl(THUMB_CARD)`；pbFloor IP 属地补 `location.addr` 读取。
- "分享"统一：explore `handleThreadShare` 从写剪贴板改为系统 `Share.share`。

## 三、性能/内存/省电
- PostContent：图片网格移除 `preferHighDynamicRange`（HDR 只留给全屏查看器）；单图高度上限 300→480（长截图可用）；视频卡满内容宽（去 280pt 上限）。
- PostCard：每卡一个 SwiftUI Menu（ThemedHost+原生视图树）→ 原生 `ActionSheetIOS`（零常驻视图，滚动开销大头消除）。
- `thread/[id].tsx`：handleAgree/handleDisagree 移除 `posts` 依赖（点赞不再引发全列表 renderPost 重建）。
- ForumThreadCard（hero 风格）Hero 图改用 `thumbnailUrl(THUMB_CARD)`（原为原图直出）。
- explore 聚焦刷新改 stale-while-revalidate（5 分钟内不重拉；旧：每次切回全量刷 page 1）。
- ImageViewer：关闭时不再 `clearMemoryCache()`（旧：连带清掉信息流/头像缓存，关图回列表整段重解码）；水印临时文件分享后清理。
- TiebaImageIO：移除 NSData"内存缓存"层（存的是 JPEG 压缩数据仍需解码，名不副实；省 ~50MB 预算）。
- Splash 提前隐藏（SQLite 就绪即渲染，偏好迁移/鉴权后台跑）。
- 登录 cookie 固定 1.5s sleep → 150ms 轮询（最多 3s）。
- protoClient 删除手动 `Accept-Encoding: gzip, deflate` / `Connection` 头（URLSession 自管，deflate 不会被自动解压）。
- useGlassBudget 的 console.warn 加 `__DEV__` 门控。
- index.tsx 搜索胶囊去掉纯色底上的实时玻璃（白占全局槽位）→ surfaceSecondary。

## 四、类型/规范清零（39 个 tsc 错误 → 0）
- FlashList v2 已移除的 `estimatedItemSize` 全部删除（14 处，v2 自动尺寸估算）。
  ※ 更正审查结论 R26-01：`overrideProps/initialDrawBatchSize` 在 v2 **合法**，保留未动。
- threadstore 收藏列表读 snake_case 字段（恒 undefined → 吧名/作者/回复数空白）→ 改 camelCase。
- FeedCard `StyleSheet.absoluteFillObject`（RN 0.86 已移除）→ 手写 absolute 展开；玻璃槽位 ref 渲染期读取 → state 镜像。
- edit-profile 适配新版 expo-media-library API（MediaType.photo/SortBy 枚举 → 字符串联合类型；limited 状态判断移除）。
- account.tsx @expo/ui Button children 条件渲染收敛进 Fragment。
- 清理：全局 activeRequestSignal 死代码（client/protoClient/search）、未用导入（useState/Text/getClientId 等）、unused 参数、重复导入、误置的 eslint-disable。
- 按项目既有约定为 Reanimated 共享值文件补 `react-hooks/immutability` 头部禁用。

## 五、按用户更正撤销
- ~~PostCard 踩按钮~~：官方贴吧无踩功能，disagree 管道为 Kotlin 版遗留。UI 改动已全部撤销；审查报告 R9-01/总报告 #21 已标注撤销。

## 六、验证与遗留
- `npx tsc --noEmit`：**0 错误**（基线 39）。
- `npx eslint src/**/*.{ts,tsx}`：**0 错误 0 警告**（基线 10 错误 6 警告）。
- Swift 侧改动（TiebaImageIO/TiebaRichTextView）在 Windows 环境无法编译验证，需 macOS `xcodebuild` 或 Expo 预构建后真机回归。
- 建议真机回归路径：头像/帖子图/表情三链路 → 论坛进出+切 tab（验证不再双重请求）→ 长帖滚动+点赞+跳页 → 楼中楼点赞/缩略图 → 保存图片（水印内存）→ 关图回信息流（无重解码卡顿）。
