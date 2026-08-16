# 第 39 轮专项：iOS 26 / 27 新接口与 Apple 设计美学机会清单

以"顶级原生 iOS 26 系统应用"标准衡量，本应用已做对的：NativeTabs 液态玻璃标签栏（minimizeBehavior + BottomAccessory）、root header 的 scrollEdgeEffects 显式配置、expo-glass-effect + 预算降级链、SF Symbols 全覆盖、reduceMotion/reduceTransparency 全链路尊重、动态字号（原生 FeedCell 用 UIFontMetrics）。以下是**尚未用上 / 未用满**的 iOS 26 能力与美学差距：

## A. SwiftUI/@expo/ui 采用差距（对照系统 App）
1. **详情页回复列表仍是 RN PostCard**：ThreadMoreSheet/对话框已 SwiftUI 化，但帖子正文卡（占比最大的 UI）没有 SwiftUI 变体。@expo/ui 已有 `List/Section/VStack`，可试点把"楼中楼预览块"做成 SwiftUI 子树，进一步降 JS 压力（与现有 TiebaRichText 原生文本同一思路）。
2. **菜单体系不统一**：RN `Alert.alert`(76处) + SwiftUI `ConfirmationDialog` + `MenuView` + `Menu` 四套并存。iOS 26 规范：操作确认用 `ConfirmationDialog`、上下文菜单用 `MenuView`/原生 ContextMenu、提示用 SwiftUI `Alert`。建议封装一个 `showConfirm()` 全局工具统一。
3. **搜索**：search/index 用了原生 `headerSearchBarOptions`（UISearchController）✅；但首页搜索胶囊是自绘 Pressable+GlassView——可统一为原生 search bar 或至少加 `searchSuggestions` 联动。
4. **@expo/ui 未用的组件**：`CartesianChart`(图表)、`Slider`、`Stepper`、`Toggle`（设置页有自绘开关——PreferenceToggleRow 应换原生 Toggle in Form）、`WebView`（社区）、`PageView`。设置页的 PreferenceToggleRow 自绘 RN 开关在 Form 里嵌 RNHostView，直接换 `Toggle` 更原生。
5. **BottomSheet**：@expo/ui community bottom-sheet 已用于分类选择 ✅；"不感兴趣"面板用 SwiftUI BottomSheet + detents ✅。论坛页 ClassifyPickerSheet 是社区版——两套 sheet 并存，可统一。

## B. iOS 26 专属 API 机会
6. **Liquid Glass 全面化**：`expo-glass-effect` 的 `GlassContainer` 已用于浮动栏 ✅；但帖子主楼卡/回复工具条用的是自研 `GlassSurface`（UIVisualEffectView）。iOS 26 设备上应优先 `expo-glass-effect`（真 LiquidEffect，GPU 更省），自研版仅作 fallback——见 R14-01。
7. **SF Symbols 动效**（iOS 17+ `SymbolView` 支持 effects）：点赞 heart 应加 `bounce`、通知 bell 加 `pulse`、加载 `rotate`。expo-symbols 的 `SymbolView` 支持 animated；当前全静态。
8. **UIContextMenu 主交互**：iOS 26 的卡片长按应是原生 ContextMenu（模糊预览放大），当前长按跳 /copy 页。@expo/ui `MenuView` 应该配 `shouldOpenOnLongPress` 或换原生 ContextMenu（预览缩放效果是 iOS 质感的关键一环）。
9. **TipKit / 教学提示**：新用户引导（只看楼主/倒序/长按复制）可用 SwiftUI TipKit —— @expo/ui 未暴露，可写小原生模块。
10. **NSToolbar / UIHostingConfiguration**：iOS 26 的 `UIHostingConfiguration`（列表 cell 内嵌 SwiftUI）暂无 expo 封装——TiebaFeedCellView 已用纯 UIKit 实现同等效果 ✅（认可）。
11. **Live Activity**：签到进度已接入（LiveActivityKit + BottomAccessory 展示）✅；可扩展到"热榜更新"话题（需 frequent updates 权衡，低优先）。
12. **App Intents / Siri 快捷指令**：`tiebalite://thread/{id}` 深链已备好，加 App Intents（"打开关注的第一个吧"）成本低、观感高。
13. **键盘 сценe**（iOS 26 new keyboard layout API）不适用；但 `keyboardAvoidingView` 行为——帖子页无输入框（发帖被移除），恢复发帖时用 SwiftUI TextField 的原生避让。

## C. Apple 设计美学差距（"奇丑"指控的具体解法）
14. **色彩系统**：主题色 #208AEF（Splash/Button）是"安卓蓝"。iOS 26 系统应用主色来自 tint 语义（systemBlue / 品牌色但饱和度克制）。建议默认主题改 `systemBlue`（#007AFF）或贴吧品牌蓝的降饱和版，全局 tint 联动（selected tab、按钮、链接统一从 colors.primary 取——已具备，只差换色板）。
15. **卡片密度**：FeedCard/TweetCard padding 12-16、圆角 16 统一 ✅；但 PostCard（回复卡）marginHorizontal 12+4=16 与 TweetCard 16 一致——整体 OK。主要问题是个别页面仍是"全宽白底列表"（notifications 行）vs 卡片流（feed）两种密度并存——按 iOS 惯例：feed=卡片、通知=分组 inset 列表（SwiftUI List automatic inset grouping）。notifications 已用 List 风格行 ✅，但视觉上加了 accent bar（安卓味）——可去掉。
16. **排版**：typography.ts 已定义 iOS 文本样式 token ✅；但大量内联 fontSize: 13/14/15 magic number（PostCard/热榜页）——统一切换到 typographyStyles。
17. **暗色模式**：主题系统完善 ✅；遗留硬编码色：'#FFF'（PostCard 等级徽章文字）、'#FFCC00' 收藏星标、'#FF3B5C' LIKE_COLOR、debug 橙——收入语义色。
18. **空态插画**：EmptyState 用 SF Symbol ✅ 但单图标+文字略素；iOS 26 风格 ContentUnavailableView 已在 SwiftUI 页使用 ✅——RN 侧 ErrorState/EmptyState 对齐同款排版（大图标 + 双行文案 + 主按钮）。
19. **启动屏**：写死蓝色背景 + 76pt 图标（R1-06）——换主题背景自适应 + 图标居中淡入。
20. **触感**：hapticsMap 场景化震动体系完备 ✅（这是全项目最"苹果"的部分之一）；建议补 `prepare()` 预热（UIImpactFeedbackGenerator prepare）降低首击延迟。

## D. 性能/省电 iOS 26 专项
21. **ProMotion**：CADisableMinimumFrameDurationOnPhone=true 已开 ✅；配合把入场动画全部留在 UI 线程（已做 ✅）。剩余 JS 线程压力：protoPost JSON.parse（大帖 50-100ms）——投影已裁剪 ✅，可再把 mapping（helpers mapProtoPosts）也下沉 Swift。
22. **内存**：ImageViewer 窗口化 ✅、onMemoryWarning 清缓存 ✅、FlashList 回收 ✅。剩余：R10-02 HDR 网格、R18-02 hero 原图、R11-02 楼中楼原图三处内存浪费。
23. **省电**：NotificationPoller 30min+低电量加倍 ✅、BGTask 原生签到 ✅。最大 offender 是 exploreAutoRefresh（每次聚焦全量刷）——R16-02。
