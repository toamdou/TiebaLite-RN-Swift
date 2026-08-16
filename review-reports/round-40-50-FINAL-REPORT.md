# TiebaLite-RN-Swift 全面深度审查·最终总报告（第 40~50 轮汇总）

> 审查范围：全部 src/（~130 TS/TSX）、modules/tieba-native + tieba-system（Swift 11 个）、plugins/、根配置。逐文件多角度（Bug / expo-ui 采用 / 动画模糊 / 性能省电 / 体验功能 / iOS 26 美学 / 闪退健壮性 / 无障碍）共 50 轮，明细见 review-reports/round-01 至 round-39。
> 分报告索引：R1 配置依赖｜R2 图片链｜R3-10 数据+帖子链｜R11-19 Feed+forum+原生｜R20-25 主题+组件+hooks+stores｜R26-34 API+存储+布局+Swift｜R35-38 剩余页面｜R39 iOS26 机会。

---

## 一、用户报告的四大症状·根因判决

### ① 无法显示发帖人/回复人头像
**根因链（实锤）**：`app.json` ATS 全面禁止明文 HTTP（且所有例外域名的 `NSExceptionAllowsInsecureHTTPLoads` 均为 false，等于没有例外）→ 贴吧 API 的 portrait 字段经常返回 `http://tb.himg.baidu.com/...` 完整 URL → `getAvatarUrl()`(utils/index.ts:134) 把 http:// 原样透传（注释声称"消费者层处理"，但全库 grep 无任何 http→https 转换）→ expo-image 被 ATS 拦截 → onError → 永远显示首字母占位。
**修复**：`getAvatarUrl` 内统一 `portrait.replace(/^http:\/\//i, 'https://')`，一处修复全局生效（百度图床全支持 TLS）。

### ② 无法显示帖子里的图片
同根因第 2/3/4 受害者：`thumbnailUrl()`(utils/thumbnail.ts) 不改协议；`useNativeThumbnail` 失败回退原始 http URL；`TiebaImageIO.download`(Swift, URLSession 同样遵守 ATS)；`media.ts` 保存/分享下载。→ 在 `thumbnailUrl` 入口 + `TiebaImageIO.makeThumbnail` 入口做同一归一化。
次要：单图 `contentFit="cover"`+高度 300 上限把长截图裁成一条（R10-01）；表情包灰色占位不刷新（R12-01）。

### ③ 无法显示回复人的回复内容
嫌疑排序：
1. **R16-01 布局风险**：SwiftUI VStack 直接嵌 RN View/FlashList（explore 首页/发现页），非 RNHostView 包裹的 RN 子树在部分版本会得到 0 尺寸 → 信息流/内容不渲染。
2. **R8-01**：带 postId 进入帖子时 posts[0]（其实是目标楼层回复）被当成主贴渲染、真第一条回复被 slice(1) 吞掉 → 看起来"回复错乱/缺失"。
3. **R12-01**：原生 TiebaRichText 表情附件下载后布局缓存不失效 → 部分内容渲染异常。
4. **R24-01/R24-02 错误吞噬**：forumStore 吞掉网络/业务错误显示空列表，"加载不出"。
映射链本身（helpers.ts 双形式键名 + 原生投影白名单）审查为健壮，排除。

### ④ 点击按钮直接闪退
候选根因（按嫌疑）：
1. **R30-01 无全局 JS 错误兜底**：任何事件回调里的未捕获异常（undefined 访问等）直接崩，无日志。
2. **R2-06 水印 OOM**：3x 屏 UIGraphicsImageRenderer 默认 scale 把 4000×3000 图放大 9 倍 → 峰值 ~400MB → 低内存设备 watchdog 强杀（"保存图片/分享"即崩）。
3. **R16-01 布局**：SwiftUI/RN 混排异常路径。
4. React Compiler 实验特性 + Reanimated 混用（R1-02）的偶发记忆化问题。
建议接入 dev 端 console/Sentry 验证具体堆栈，上述 1/2 是结构性修复。

---

## 二、50+ 条改进建议总清单（按优先级）

### 🔴 P0 · 立即修（显示/闪退/翻页）

1. **统一 http→https 归一化**（症状①②总根因）：utils 新增 `sanitizeUrl()`，接入 getAvatarUrl / thumbnailUrl / useNativeThumbnail / TiebaImageIO / media.ts 五处。
2. **水印渲染固定 scale=1**（R2-06，OOM 闪退）：`UIGraphicsImageRendererFormat` + `format.scale = 1`。
3. **usePagedList.loadingMoreRef 复位 bug**（R23-01，刷新后分页永久失效）：finally 顶部无条件复位。
4. **forumStore 错误吞噬**（R24-01/02）：loadForumData / loadFollowedForums page-1 失败 rethrow，让 ErrorState 出现。
5. **注册全局 JS 错误处理**（R30-01）：ErrorUtils.setGlobalHandler + 原生 crash 上报通道，终结"无理由闪退"。
6. **帖子详情带 postId 的主贴错位**（R8-01）：仅 `!postId && page===1` 时视 posts[0] 为主贴。
7. **SwiftUI 容器内 RN 子树规范化**（R16-01）：VStack 内 RN 内容一律 RNHostView 包裹并显式定尺寸；排查 explore/index 的 0 高度风险。
8. **TiebaRichText 表情附件刷新**（R12-01）：下载完成用 layoutManager.invalidateLayout 或重设 attributedText。
9. ~~删除 FlashList overrideProps~~ **【已更正】overrideProps/initialDrawBatchSize 在 v2 合法保留（R26-01 更正）**；实际移除的是 v2 已删除的 `estimatedItemSize`（14 处，全部为无效属性 + 类型错误）。
10. **forum 页双重请求**（R18-01）：tab-effect 去掉 currentForum?.forumId 依赖（ref 读取）。

### 🟠 P1 · 高优（性能/内存/核心体验）

11. PostCard 每卡一个 SwiftUI Menu（R9-02）→ 改页面级共享菜单/ActionSheetIOS，滚动性能大头。
12. thread/[id] handleAgree 依赖 posts（R8-02）→ setPosts 函数式读取，点赞不再全列表重渲染。
13. ForumThreadCard hero 图用原图（R18-02）→ thumbnailUrl(THUMB_CARD)。
14. 楼中楼缩略图 80px 加载原图（R11-02）→ thumbnailUrl(THUMB_LIST)。
15. 楼中楼点赞无反馈（R11-01）→ 乐观更新（复用 patchPost 模式）。
16. explore 每次聚焦全量刷新（R16-02）→ stale>5min 才刷（stale-while-revalidate）。
17. forum 热门/最新共享一份列表（R24-03）→ 按 sortType 分桶缓存。
18. forum 数据迁 TanStack Query 按 [name,tab,page] 缓存（R18-03）→ 返回不重载、三套数据层收敛为一。
19. 帖子图片网格关掉 preferHighDynamicRange（R10-02），HDR 只留查看器。
20. 长图 contentFit=cover 裁切（R10-01）→ contain/放宽高度上限+「查看长图」。
21. ~~回复卡补"踩"按钮~~ **【已撤销】官方贴吧没有踩功能，disagree 相关代码是 Kotlin 版遗留管道，不补 UI**（R9-01 更正）。
22. pbFloor IP 属地映射补 location.addr（R11-03）。
23. ImageViewer 关图 clearMemoryCache 连坐清掉信息流缓存（R22-01）→ 移除或仅在下次打开前清。
24. protoPost 手动 Accept-Encoding 含 deflate（R13-01）→ 删头，交 URLSession。
25. 头像小尺寸变体（R2-09）：portrait 拼小图后缀，信息流省流量/内存。
26. 启动 splash 被 SQLite 迁移阻塞（R30-02）→ 先隐藏再迁移。
27. 登录 1.5s 固定 sleep（R32-01）→ 轮询 cookie（100ms×30）。
28. explore"分享"实际是复制（R35-01）→ 统一 ShareSheet。
29. 单图加载中无 placeholder（R10-05）→ expo-image blurhash/thumbhash 或主色占位。
30. 死代码清理：activeRequestSignal 全套（R26-02）、debugLogs（R8-04）、DecodedTopicListResponse.topic_list 类型笔误（R3-01）。
31. 水印临时文件 finally 未清理（R37-02）。
32. 内存缓存 NSData 层降级或移除（R2-05）：省 50MB 或改存解码位图。

### 🟡 P2 · iOS 26 美学与 @expo/ui 合理化（对应"奇丑/无 Apple 美学"）

33. 统一玻璃体系（R14-01）：iOS 26 走 expo-glass-effect，自研 GlassSurface 仅 <26 fallback；删除 R15-02 无意义玻璃（纯色底上的搜索胶囊）。
34. 对话框体系统一（R35-04）：76 处 Alert.alert → 封装 showConfirm（SwiftUI ConfirmationDialog）；Toast 已有，替代剩余 alert 提示。
35. SF Symbol 动效（R39-7）：heart bounce / bell pulse / 加载 rotate——expo-symbols SymbolView 加 animations。
36. 卡片长按换原生 ContextMenu 预览（R39-8），/copy 页降级为菜单项。
37. 默认主色换 systemBlue 系（R39-14），全局 tint 联动已有基础设施。
38. 排版 token 化收尾（R39-16）：清除内联 fontSize magic number。
39. 硬编码色收入语义色（R39-17）：'#FFF' 徽章字、'#FFCC00' 星标、'#FF3B5C' 等。
40. notifications 行的 accent bar 去掉（R39-15），改 inset 分组列表风格。
41. 设置页 PreferenceToggleRow → @expo/ui Form+Toggle 原生开关（R39-4）。
42. 两套 bottom sheet 统一（R39-5）。
43. Splash 背景自适应深浅色（R1-06/R39-19）。
44. 触觉 prepare() 预热（R39-20）。
45. SymbolView 加低版本兜底（R21-02），避免 iOS16/17 上新 symbol 空白。

### 🟢 P3 · 功能补全（对应"功能欠缺"）

46. **恢复发帖/回复**（R8-09）：API 层已按"产品要求"移除，但 UI 处处暗示可回复——这是最大功能缺口；贴吧客户端没有回复闭环等于残废。至少恢复"回复楼层/楼中楼"。
47. **投票**（R10-15）：渲染了完整投票 UI 却只读——接 vote API。
48. **首页改关注流**（R15-01）：userLike API 已实现，首页却是吧列表启动器；建议首页=关注动态流+顶部吧横条。
49. 帖子页页码指示器（R8-07）+ 跳页入口保留在浮动栏。
50. App Intents/快捷指令 + 剪贴板链接已有 → 加 Spotlight 索引（CSSearchableIndex 收藏/历史）。
51. 视频卡 280pt 上限放开满宽（R10-04）。
52. 楼中楼预览区分 [视频]/[语音]（R9-03）。
53. Explore 多图横滑改九宫格/双列网格（R17-01，贴吧心智）。
54. useGlassBudget console.warn 加 __DEV__（R23-03）。
55. 双击缩放 zoom-to-point（R22-04）。
56. proto 映射下沉 Swift（R39-21）：mapProtoPosts 也在原生完成，JS 只收最终模型，大帖解析 0 JS 开销。

---

## 三、值得保持的亮点（修复时不要破坏）
- 原生 proto 编解码 + 响应投影裁剪（TiebaProtoCodec/Projector）——架构一流。
- useGlassBudget 按屏玻璃预算、FeedCard 全局实时模糊槽位——罕见的精细度。
- NotificationPoller 30min+低电量加倍+BGTask 原生签到——省电范本。
- ImageViewer 窗口化解码/Twitter 拖拽关闭/内存清理。
- NativeTabs 液态玻璃 + BottomAccessory 签到进度——iOS 26 正统用法。
- hapticsMap 场景化触感、reduceMotion/reduceTransparency 全覆盖、动态字号（原生 cell）。
- 安全面：postProto host 白名单、凭据全 keychain、登录 WebView 域名白名单、debug 日志不泄凭据。

## 四、建议的修复顺序
第一批（半天）：#1 sanitizeUrl、#2 水印 scale、#3 loadingMoreRef、#4 错误吞噬、#8 表情刷新、#10 双重请求。（#9 已更正为移除 estimatedItemSize）
第二批（1 天）：#5 全局错误兜底、#6 主贴错位、#11 共享菜单、#12-#15 性能四连、#28 分享统一。（#21 已撤销：贴吧无踩功能）
第三批（2-3 天）：#16-#20 性能/内存、#33-#45 iOS 26 美学批、#46-#48 功能三大件。
每批修完跑 `npx tsc --noEmit` + 真机回归：头像/图片/回复三链路 + 论坛进出 + 长帖滚动 + 楼中楼 + 关图回列表。
