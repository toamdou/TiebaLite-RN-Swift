# 第 3~10 轮审查：数据链路（proto.ts / protoClient.ts / TiebaProtoCodec.swift / helpers.ts / thread.ts）+ 帖子详情链（thread/[id].tsx / PostCard / PostContent）

## 🔴 P0/P1 级 Bug

### R3-01【键名混用隐患】`DecodedTopicListResponse` 接口声明 `data.topic_list`（下划线），但原生解码器输出驼峰 `topicList`
- protobufjs 生成描述符默认 camelCase；`TiebaProtoDecoder` 用 `field.name`（驼峰）作为输出键。
- proto.ts:363 `topic_list?: Record<string, unknown>[]` —— 任何按此接口读取 `data.topic_list` 的消费方都会得到 `undefined`。
- 同文件其他接口（如 `DecodedFrsPageResponse.threadList`）用驼峰，说明 topicList 的接口声明是笔误。**需检查 topic 消费方**（topic/list.tsx）实际读哪个键——若读下划线版则话题列表恒空。

### R8-01【带 postId 进入帖子时主贴错位】`thread/[id].tsx:336` `replyPosts = filteredPosts.slice(1)`
- 从通知/收藏带 `postId` 跳转时，pbPage 返回的 postList[0] 是**目标楼层附近的第一条回复**，不是楼主帖。
- 结果：`mainPost = posts[0]`（一条普通回复）被渲染成"楼主帖"卡片 + 真正的第一条回复被 slice(1) 吞掉。
- **修复**：仅当 `!postId && page===1` 时才把 posts[0] 当主贴；否则列表渲染全部楼层并隐藏主贴卡片（或额外请求第一页拿主贴）。

### R8-02【性能】`handleAgree/handleDisagree` 依赖 `posts` 数组 → 任何一次点赞 patchPost 都会重建 renderPost → FlashList 全部可见项重渲染
- `thread/[id].tsx:482-513`：`useCallback(..., [posts, ...])`。patchPost 更新一个 post → posts 引用变化 → renderPost 新引用 → 所有 PostCard 重跑 memo 比较（props 含 onAgree 新引用）→ 全列表重渲染 + 卡顿。
- **修复**：把 `posts` 依赖去掉，用 `setPosts(prev => ...)` 内部读取当前值判断 isAgree，或用 ref 保存 posts。

### R9-01【已撤销·2026-08-16 更正】~~`onDisagree` 传入 PostCard 但从未使用 —— 回复卡片没有"踩"按钮~~
- **更正**：官方贴吧客户端的回复卡片只有点赞、没有"踩"功能。代码里的 `disagree()` 接口、`onDisagree` prop、proto `disagreeNum` 字段只是从 Kotlin 版移植的遗留 API 管道，不是缺失的 UI 功能。最初把它判为"功能缺口"是错误推断，相关修复已撤销。
- 处置建议：这些遗留管道可留作兼容（服务端确实接受 opAgree 的 disagree 操作），也可择机清理死代码；不应增加 UI 入口。

### R9-02【性能·重大】每张回复卡挂一个 SwiftUI `Menu`（ThemedHost + @expo/ui Menu）
- PostCard 底部栏每卡一个原生 SwiftUI Menu 视图树。400 楼线程快速滚动 = 每秒数十次 SwiftUI 视图树创建/销毁，桥接与内存压力巨大，是滚动掉帧的重要嫌疑。
- 长按卡片已有"复制内容"入口，底部 "..." 菜单与长按重复。
- **修复**：去掉 per-card Menu；点击 "..." 时用页面级共享的 `MenuView`（@expo/ui）或 `ActionSheetIOS.showActionSheetWithOptions`（纯原生、零视图树开销）。

### R10-01【显示 bug】单图 contentFit="cover" + 高度 300 上限 → 长截图被裁切
- PostContent ImageSegment：单图 `displayHeight = min(w/aspect, 300)`，`contentFit="cover"` —— 竖长截图（贴吧极常见）被裁成中间一条，无法预览。
- **修复**：`contentFit` 改 "contain" 或保留 aspect 填宽、高度上限放宽到 ~1.5×contentWidth，超出显示"查看长图"。

### R10-02【性能】图片网格 `preferHighDynamicRange` 
- 9 图网格强制 HDR 解码，内存/解码开销大；HDR 应只留给全屏查看器。

### R10-03【http 链未断】`thumbnailUrl(img.src, THUMB_POST)` 依旧不做协议归一化（承接 R1/R2 结论）

## 🟠 P2 级发现

### R3-02 protoPost 的 `'302001&format=protobuf'` 作为 cmd 拼接 —— 能跑但脆弱，URL 应显式拼 query 参数。
### R3-03 `Accept-Encoding/Connection` 手动设置与 URLSession 自动管理冲突（多余、可能重复头）。
### R3-04 proto 通道无重试 —— 移动网络抖动直接报错。建议 TanStack Query retry: 1~2。
### R8-03 `overrideProps={POST_LIST_OVERRIDES}` —— FlashList v2 没有 `overrideProps` 属性；`initialDrawBatchSize` 在 v2 是直接 prop。多余对象可能触发未知属性告警/被忽略。
### R8-04 debugLogs 死代码：`setDebugLogs` 仅有清空调用，从未写入。
### R8-05 混用 RN `Alert.alert` 与 SwiftUI `ConfirmationDialog/SWAlert` 两套对话框（视觉不统一，iOS 26 应统一一套）。
### R8-06 浮动栏没有"回复"按钮（注释称入口在 PostContent，但 PostContent 也没有回复入口——发帖功能按注释被移除）→ 回复闭环缺失（见 R8-09）。
### R8-07 无页码指示（页 X/Y 仅 debug 面板可见）。
### R8-08 StaggerItem 包裹每个 item 各建一个 useAnimatedStyle —— 首屏后 p 恒为 1，开销可接受但可用 `Layout` 动画替代。
### R8-09【功能】回复/发帖 API 已按"产品要求"移除（thread.ts 注释），但 UI 里到处是"请先登录"的交互暗示 —— 功能与 UI 承诺不匹配，用户会以为是 bug。
### R9-03 楼中楼预览 InlineQuoteContent 对 video/audio 段显示 "[图片]" —— 应区分 [视频]/[语音]。
### R10-04 视频宽度固定 280pt 上限，不满宽 —— 与 iOS 26 大图流风格不符。
### R10-05 图片无加载中 placeholder（blurhash/进度），只有纯色底。
### R10-06 投票渲染为只读（无投票 API）—— 显示了交互控件但点了没反应（canVote=false 时 disabled，尚可）。
### R10-07 `contentWidth = screenWidth - 64` 硬编码，与各宿主容器实际 inset 耦合，换容器就错位。

## ✅ 做得对的地方
- 原生 Swift proto 编解码 + 投影裁剪（TiebaProtoProjector）是高端架构，大幅降低桥接开销。
- 解码 window 复用避免 subdata 拷贝；负缓存 resolveMessage。
- helpers.ts 全部双形式键名读取（`raw.x ?? raw.x_y`），防御到位。
- mapProtoContent 对表情 4 级 fallback（c 字段 → image_emoticonN → (#name) → 名称表）覆盖全面。
- PostContent 把文本 runs 交给原生 SwiftUI TiebaRichText 渲染 —— 正确的性能选择。
- 视频/音频播放器懒创建（点击才 mount）+ 卸载自动 pause，内存纪律好。
- ThreadHeader memo + 稳定 mainPost 引用，分页不重建头部。

## 头像/图片/回复不显示的根因链总结（截至本轮）
1. ATS 禁全部 HTTP（R1-01）+ `getAvatarUrl` 透传 http URL（R2-01）→ 头像挂。
2. 同因 + thumbnailUrl 不改协议（R2-03/R10-03）→ 帖子图挂。
3. 回复内容：映射链（helpers）健壮，嫌疑转移到——(a) pbPage 返回后 UI 侧渲染（TiebaRichText Swift 视图）；(b) 带 postId 进入的主贴错位（R8-01）；(c) 待查 subposts 页与 TiebaRichText.swift。
