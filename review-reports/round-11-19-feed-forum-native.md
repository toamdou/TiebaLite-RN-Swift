# 第 11~19 轮审查：subposts / TiebaRichText / TiebaNativeClient / GlassSurface / 首页 / explore / TweetCard / FeedCard / forum / notifications / profile

## 🔴 P0/P1 级 Bug

### R12-01【表情可能停留在灰色占位】TiebaRichTextView.loadEmoticon 下载后仅 setNeedsDisplay
- Swift 端 `attachment.image = image; textView.setNeedsDisplay()` —— NSTextAttachment 替换图片后，TextKit 布局缓存不会自动失效，iOS 多数版本下**灰色占位不会被替换显示**。
- **修复**：下载完成后 `textView.layoutManager.invalidateLayout(forCharacterRange:actualCharacterRange:)` 或整体重新赋值 attributedText；并加下载失败重试/超时。

### R12-02【性能】TiebaRichTextView 每个 prop didSet 全量 rebuild
- runs/fontSize/lineHeight/textColor/linkColor 逐个设置 → 一次渲染最多 6~7 次 NSAttributedString 全量重建。应合并为单次 setNeedsRebuild（CATransaction 合并）。

### R18-01【双重网络请求】forum/[name].tsx tab-effect 依赖 `currentForum?.forumId`
- 首次 doLoad(1) 后 store 回填 forumId（'' → '123'）→ tab 切换 effect 因依赖变化再次执行 → 同一 tab 再拉一次 page 1。`loaded` 翻转也会触发一次。
- 进入每个吧至少 2~3 次 page-1 请求：流量×3、列表重排、入场动画被打断。**P1 修复**：effect 仅依赖 currentTab + name，forumId 用 ref 读取。

### R18-02【内存/流量】ForumThreadCard（hero 风格）直接用 `mediaList[0].src` 原图
- 未走 `thumbnailUrl()`（TweetCard 用 200px 缩略）。200pt 高的卡片解码 4K 原图 → 内存峰值 + 滚动掉帧。

### R18-03【状态架构】forumStore 全局单例保存 latestThreads/goodThreads
- 吧 A → 吧 B → 返回 A：全部重新加载（无按吧缓存）。建议迁移到 TanStack Query（项目已有）按 `[name, tab, page]` 缓存，免费获得返回不重载。

### R11-01【交互无反馈】subposts 点赞无乐观更新
- `handleAgree` 成功后不更新 item.isAgree/agreeNum，失败静默 —— 用户点爱心永远没视觉反馈，看起来像"按钮坏了"。

### R11-02【内存】subpost 缩略图未降采样
- 80×80 缩略图直接加载 `src` 原图（PostContent 用 600px 缩略，此处没有）。楼中楼多图时内存浪费严重。

### R11-03【显示】楼中楼 IP 属地恒空
- thread.ts pbFloor 映射只读 `item.ipAddress`，而投影白名单里的字段是 `location.addr`（helpers 里 thread 内楼中楼是 `sp.location?.addr ?? sp.ipAddress` 双读，pbFloor 漏了 location）。

### R16-01【布局风险·疑似"界面加载不出"来源】SwiftUI 容器直接嵌 RN View
- explore.tsx：`<VStack>` 直接包含 RN `<View styles.segmentContent(flex:1)>`（无 RNHostView 包裹），且 FeedContent 返回的也是 VStack→RNHostView→View(flex:1)→FlashList。
- @expo/ui 要求 RN 子树必须经 RNHostView 挂进 SwiftUI 层；flex:1 对 SwiftUI 子视图无意义。该结构在部分版本会得到 0 高度 → **信息流不显示**。
- 首页 index.tsx 同样是 VStack 包 FlashList（经 View 容器）。需要真机验证；建议统一"SwiftUI 只做顶层壳/表单，列表主体留在 RN 层"。

### R16-02【流量/耗电】explore 默认 `exploreAutoRefresh=true` 每次聚焦全量刷新
- 每次 tab 切回都重新拉 page 1（关注/推荐）。应改为 stale-while-revalidate（数据 >N 分钟才刷）。

## 🟠 P2 级发现

### R13-01 protoPost 的 JS headers 覆盖 `Accept-Encoding: gzip` 为 `gzip, deflate` —— URLSession 不会自动解压原始 deflate，若服务端返回 deflate 会解码失败。删除手动头。
### R13-02 `httpShouldUsePipelining` 已废弃无效果；`waitsForConnectivity=false` 弱网立即失败（可考虑 true + 超时）。
### R13-03 TiebaImageIO.download 无 host 白名单（postProto 有）—— 建议同样收敛到 *.baidu.com。
### R14-01 两套玻璃体系并存（expo-glass-effect vs 自研 UIVisualEffectView GlassSurface）—— iOS 26 目标下应统一到前者，后者仅作 <iOS26 fallback（内存受限下减少实时模糊数量）。
### R14-02 GlassSurface 的 tapGesture 与子视图点击可能双触发（cancelsTouchesInView=false 语义）—— 纯容器场景建议移除手势。
### R15-01 首页"关注"Tab 只是吧列表启动器——`userLike`（关注动态）API 已实现却在 explore 里；首页没有信息流，与"贴吧客户端首页"预期不符（建议首页=关注流+顶部吧横条，参考官方客户端）。
### R15-02 搜索胶囊玻璃下无内容可blur（背景纯色）——液态玻璃无意义，直接用 surfaceSecondary 更省 GPU。
### R16-03 NativeThreadCell hero 覆盖层固定 200 高，若原生 cell 实际高度不同会错位误触。
### R16-04 mapFeedItem 无标题帖子可能误判为吧卡片（fallback 链）。
### R17-01 TweetCard 多图用卡内横滑分页而非网格 —— 贴吧习惯是九宫格/双列网格；且媒体未与文本列对齐（缩进不一致）。
### R17-02 TweetCard/FeedCard/NativeThreadCell 每卡一个 ThemedHost+MenuView —— 与 PostCard 同样的 per-cell 原生视图开销。
### R18-04 自定义 Tab 点赞后 patch 错列表（customPaged.items 未更新）。
### R18-05 SwiftUI segmented Picker 放不下多个自定义 tab（Kotlin 用 ScrollableTabRow）——建议横向滚动 RN tab 条。
### R19-01 profile 页"服务中心"打开 tieba.baidu.com/mo/ —— 与标题不符，建议改关于/反馈页。

## ✅ 亮点（保持）
- FeedCard 的"全局实时毛玻璃槽位=1"模块级计数器（其余卡片降级为渐变模拟）——优秀的性能设计，值得推广到 GlassSurface。
- StaggeredCard/EntranceRow 的 ran-ref 防重播、reduceMotion 全覆盖。
- notifications 按 category 加 key 前缀防 FlashList 复用冲突。
- forum FAB 多功能偏好（回顶/刷新/隐藏）。
- TweetCard LikeButton 弹簧 pop、PagerDot UI 线程插值——动画质量高。
