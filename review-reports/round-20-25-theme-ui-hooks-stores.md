# 第 20~25 轮审查：主题系统 / UI 组件（ThemedHost/GlassView/SymbolView/ImageViewer）/ hooks（usePagedList/useGlassBudget/useReducedMotion）/ stores（forum/auth/preferences）

## 🔴 P0/P1 级 Bug

### R23-01【分页永久失效】usePagedList.loadingMoreRef 在请求被 supersede 时永不复位
- `run()` 的 finally 里 `if (seq !== seqRef.current) return;` 提前返回，**跳过了 `loadingMoreRef.current = false`**。
- 场景：loadMore 进行中用户下拉刷新（seq++）→ 旧 run 的 finally 提前 return → loadingMoreRef 卡在 true → 之后所有 loadMore() 全部被 `if (loadingMoreRef.current) return` 拦截 → **列表再也翻不了页**，直到组件重挂载。
- 修复：`loadingMoreRef.current = false` 移到 finally 顶部（seq 判断之前），或按 mode 记录重置。

### R24-01【错误吞噬→"界面加载不出"实锤之一】forumStore.loadForumData 吞掉全部错误
- proto 错误与网络错误分支只 `console.error` + 清空列表，**不 throw**；而 forum/[name].tsx 的 doLoad 靠 catch 设置 ErrorState。
- 结果：网络失败/吧不存在时，页面显示"暂无帖子"空态而不是错误+重试按钮。用户感知即"加载不出"。
- 修复：page===1 时 rethrow（保留 seq 守卫），UI 才能进 ErrorState。

### R24-02【同模式】forumStore.loadFollowedForums 内部 catch 不抛出
- index.tsx 的 handleLoadFollowedForums 期待 catch 设 forumsError —— 但 store 已吞错误 → **首页失败也显示"暂无关注的贴吧"**，无重试入口。
- 修复：store 移除内部 catch（或 rethrow）。

### R24-03 热门/最新共享 latestThreads 单份状态
- tab 0（热门 REPLY_TIME）与 tab 1（最新 SEND_TIME）共用 latestThreads：切 tab = 清空重拉 page 1，无独立缓存。加上 R18-01 双重请求，吧内切 tab 明显卡顿。
- 修复：`Record<sortKey, ThreadInfo[]>` 分桶缓存。

## 🟠 P2 级发现

### R22-01 ImageViewer 关闭时 `Image.clearMemoryCache()`（>2 图）连带清掉信息流缩略图缓存 → 关图后回列表滚动重新解码全部缩略图，明显卡顿。建议仅在下一次打开前清理，或依赖 expo-image 自身 LRU。
### R22-02 窗口化 PagerView 滑动到窗口边缘时 pages 数组平移 + setPageWithoutAnimation 兜底 —— 每次翻页都可能闪一帧（窗口滑动重建）。可把 window 提到 5 降低平移频率。
### R22-03 dismissGesture 挂在整个 modal（含顶栏/缩略条），在顶栏上下拖也会触发拖拽关闭视觉。收窄到 pagerWrap。
### R22-04 双击缩放固定 3x，不缩放到点击点（iOS Photos 是 zoom-to-point）。
### R23-02 usePagedList loadMore 失败无任何 UI 反馈（error 只在 page1 设置）—— 加载更多失败静默，用户以为到底了。
### R23-03 useGlassBudget 的 console.warn 无 __DEV__ 门控，生产环境刷日志。
### R20-01 EASE_OUT/HERO/PRESS token 体系质量高；DURATION.enter=220ms 合理。
### R21-01 ThemedHost 正确传递 colorScheme ✅；GlassView 的 reduceTransparency/预算双降级链路设计优秀 ✅。
### R21-02 SymbolView 未暴露 `fallback`/`variable value`（SF Symbol 可变字重/调色板），某些 symbol 名称在低版本 iOS 不存在时 expo-symbols 会渲染空白（如 iOS17 新增 symbol 在 iOS16 上）——建议对新增 symbol 加版本兜底。

## ✅ 亮点（保持）
- usePagedList 的 seq 守卫 + 实例级 AbortController + 同步 ref 防抖——设计成熟（仅 R23-01 一处遗漏）。
- useGlassBudget 按路由键 + 聚焦判定的实时玻璃预算——业界少见的精细度。
- ImageViewer：窗口化解码、低功耗 windowSize 降级、Twitter 式拖拽揭示背景、退场动画、内存上限清理。
- preferencesStore：per-key 持久化 + 旧 key 迁移 + 写队列串行化。
