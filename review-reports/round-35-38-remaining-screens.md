# 第 35~38 轮审查：剩余页面与组件快扫（settings 系列 / history / threadstore / copy / search / topic / 论坛子页 / Toast / Skeleton / linkOpener / media）

## 🔴 P1 级发现

### R35-01【"分享"实际是复制】explore.tsx handleThreadShare 把链接写剪贴板而非拉起分享面板
- 信息流卡片"分享"按钮 = `Clipboard.setStringAsync`（无任何 UI 提示），而 forum 页 handleCardShare = `Share.share`。同名操作行为不一致，用户以为分享坏了。
- 统一为系统 ShareSheet（`Share.share`），复制留给长按菜单。

### R37-01【保存/分享图片失败链】media.ts 下载同样遵守 ATS —— http:// 图片 URL 保存/分享必然失败（R1-01 根因链的第 4 个受害者）。

### R37-02 水印临时文件泄漏：shareFile 生成的水印文件（TiebaImageIO 缓存目录 UUID 命名）不被 finally 清理，仅靠 200MB LRU 兜底。

### R35-02 非选择器 store 订阅 4 处（threadstore/login/settings-account/user-uid）——全库重渲染（其余页面均已是 selector 风格，统一之）。

## 🟠 P2 级发现

### R37-03 openLink 的 controlsColor 硬编码 '#208AEF'，不随主题主色。
### R35-03 search 页质量良好（400ms 防抖 + seq 守卫 + abort + 历史仓库迁移）✅。
### R35-04 settings 系列大量使用 @expo/ui Form/Section/Picker/MenuView ✅（采用率高）；但 76 处 `Alert.alert` 与 SwiftUI 对话框混用，视觉不统一（iOS 26 建议统一 ConfirmationDialog 或原生 alert）。
### R35-05 帖子详情 MAX_POSTS=400 与 usePagedList 默认 maxItems=200 上限不一致（一个是显式覆盖）——统一常量避免误配。
### R36-01 搜索建议 seq 处理正确；唯 `suggestionSeqRef.current += 1` 在 cleanup 内的自增写法在 React 18 严格模式双挂载下会自增两次（无害但脆弱）。
