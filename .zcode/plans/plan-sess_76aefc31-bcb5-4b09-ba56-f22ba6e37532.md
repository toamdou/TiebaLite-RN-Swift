# 推特风格信息流深度美化方案

## 约束与总体思路
- **Windows 无 Xcode**：全部改动在 RN/TS 层完成，**不新增、不修改任何 Swift 原生代码**。现有原生能力（expo-image、Reanimated 4、gesture-handler、SF Symbols、expo-glass-effect）已足够实现全部效果，改动可通过现有 dev build 热更新验证。
- 新推特卡片为**默认样式**；原「圆角卡片/HeroUI」风格（动态页原生 FeedCell 路径 + 吧页 ForumThreadCard）完整保留为备选，由设置开关切换，**zustand 响应式立即生效，无需重启**。
- FlashList 已是 v2.0.2：新代码遵循 v2 API（不传 v1 的 `estimatedItemSize`，v2 自动估算；使用 `getItemType` 细分回收类型、`useRecyclingState` 重置卡片内部状态）。

## 从参考图提炼的设计规格（iOS 风格）
- 卡片：`colors.card` 底、圆角 16、hairline 描边 + `Shadows.card` 微阴影；列表水平边距 16，卡间距 8；**无分割线**。
- 头部：44pt 圆头像（左）→ 一行：显示名(15/600) + `@用户名`(15 次要色) + `· 时间`(15 次要色)，单行尾部截断。
- 正文：标题(17/600) + 摘要(15/400) 合并同一 Text 块；超过 6 行截断 + 底部渐隐 + 「显示更多」蓝色次要字按钮，点击原位展开。
- 媒体区：圆角 16；单图按原始宽高比（高/宽钳制 0.667–1.91）；多图卡内横向分页滑动 + 底部居中页码点；点击进入大图（带当前页索引）；视频帖显示 poster + 播放角标，点击进帖。
- 操作栏（仅 3 个）：回复(bubble.left + replyNum) → 分享(square.and.arrow.up) → 点赞(heart/heart.fill 红色 #FF375F + 弹簧放大动画 + zanNum)，图标 17pt 次要色，均匀分布。
- 交互：点击卡片任意空白/文字区域进帖；头像→用户页、吧名→吧页、按钮均 stopPropagation。
- 转发帖 `originThreadInfo` 渲染为推特「引用帖」嵌套小卡（描边圆角容器）。
- 置顶/精品标签：正文上方小彩色文字标签，沿用现有红/橙色。

## 文件改动清单

### 新增
1. **`src/components/feed/TweetCard.tsx`** — 通用推特卡片（动态页 + 吧页共用）
   - Props：`thread: ThreadInfo`、`variant: 'feed' | 'forum'`、`timeType: 'create' | 'last'`（吧页按排序传入：热门=lastTime、最新=createTime、精品按 forumSortType；动态页固定 createTime）、`onImagePress(images, index)`、`onLike`、`onShare`、操作回调。
   - 内部子组件（同文件 memo 化）：`ExpandableText`（onTextLayout 检测行数 + LinearGradient 渐隐 + 显示更多）、`MediaPager`（横向 pagingEnabled ScrollView + Reanimated 驱动页码点 + expo-image recyclingKey/THUMB_CARD 缩略图）、`TweetActionRow`（heart 弹簧 pop）、引用帖小卡。
   - 按压反馈：scale 0.98 PRESS_ENTER 弹簧；入场沿用现有 EntranceRow stagger 模式。
   - 偏好沿用：`hideMedia`、`blockVideo`。
2. **`src/components/feed/FeedTabBar.tsx`** — 推特风格顶栏：推荐/关注/热榜 文本标签（选中粗体主文字色、未选灰），Reanimated 下划线胶囊指示器滑动过渡，替代 SwiftUI segmented Picker；数据切换逻辑（lastFeedSegment/display:none 保活）保持不变。

### 修改
3. **`src/app/(tabs)/explore.tsx`**
   - 顶栏换用 `FeedTabBar`。
   - `useAppPreference('feedCardStyle', 'twitter')` 分支：`twitter` → TweetCard（`getItemType` 细分 `tweet-media`/`tweet-text` 提升回收命中）；`hero` → 现有 NativeThreadCell 原生路径不动。
   -吧/话题卡继续走 FeedCard。
4. **`src/app/forum/[name].tsx`**
   - 同开关分支：`twitter` → TweetCard + **强制单列**（推特无网格）；`hero` → 现有 ForumThreadCard 双列逻辑不动。
   - 计算 `timeType` 传入卡片（Tab0 热门=REPLY_TIME→lastTime；Tab1 最新=SEND_TIME→createTime；Tab2 精品按 forumSortType）。
   - FlashList key 加 numColumns 变化时的既有处理保留。
5. **`src/components/ImageViewer.tsx`** — 大图浏览升级
   - Modal 改 `transparent`：底层全屏 GlassView（dark, regular, 真实模糊后方信息流，尊重 reduceTransparency/玻璃预算降级为纯遮罩）+ 黑色 scrim，透明度随拖拽进度联动（静止时纯黑，拖拽时渐显模糊背景）。
   - 拖拽关闭升级：translateY + **scale 1→0.65 插值** + 圆角增大 + 顶栏/缩略条随进度淡出；松手超阈值 → 继续缩小飞出并淡出背景后 onClose，未超阈值 → spring 弹回。
   - 保留现有 pinch 缩放、双击缩放、PagerView 窗口化、缩略条、保存/分享。
6. **偏好与设置开关**
   - `src/types/index.ts`：`AppPreferences` 增加 `feedCardStyle: 'twitter' | 'hero'`。
   - `src/constants/preferences.ts`：默认 `'twitter'`。
   - `src/app/settings/habit.tsx`「浏览」区新增开关「经典卡片风格（Hero 玻璃卡）」：开=hero 备选样式，关=推特卡片（默认）；立即生效。

## 性能策略
- 卡片 `React.memo` + 父级 useCallback 稳定回调 + `extraData=feedCardStyle`；图片用 `thumbnailUrl(THUMB_CARD)` 服务端缩略图 + memory-disk 缓存 + recyclingKey。
- FlashList v2：`drawDistance` 250–400、`maxItemsInRecyclePool` 24、`getItemType` 按 内容形态细分；`useRecyclingState` 在卡片回收时重置展开状态与多图页位置。
- 动画全部走 Reanimated UI 线程；毛玻璃仅大图查看器 1 处实时实例（不违背现有玻璃预算规则）。

## 验证
- Windows 上可执行：`npx tsc --noEmit`、`expo lint`。
- 真机/模拟器视觉验证（用户侧 dev build）：动态页推荐/关注、吧页热门/最新/精品三 Tab、纯文字/多图/视频/转发帖、显示更多、多图滑动、大图拖拽缩放关闭与背景模糊、设置开关即时切换两种风格。

## 设计决策（未收到回复，按推荐执行）
- 顶栏保留 推荐/关注/热榜 三标签，推特化重绘（不砍功能）。
- 操作栏顺序：回复 → 分享 → 点赞（推特原生顺序，点赞红色高亮在最右）。
- 点赞图标：heart/heart.fill（推特 1:1）。