# 第 26~34 轮审查：API 客户端 / 存储层 / NotificationPoller / 根布局 / tabs / login / webview / user 页 / 剩余 Swift 模块

## 🔴 P0/P1 级发现

### R26-01【已撤销·2026-08-16 更正】~~FlashList v2 没有 `overrideProps` / `initialDrawBatchSize` 属性~~
- **更正**：查证 `FlashListProps.d.ts` 后确认 v2（2.0.2）**保留了** `overrideProps?: OverrideProps`（含 `initialDrawBatchSize`）——4 处使用是合法的 v2 分批绘制配置，并非 no-op。原判断错误。
- 真正的 v1 残留是各列表直接传的 **`estimatedItemSize`**（v2 已移除该 prop，类型报错 ×14，运行时为无效属性）——修复时已全部移除（v2 自动尺寸估算）。

### R26-02【死代码/隐患】模块级 `activeRequestSignal` 已无写入者
- `setActiveRequestSignal` 全库 0 调用；但 `getActiveRequestSignal()` 仍在 client.ts 所有 helper + protoClient + search.ts 作为回退 —— 永远返回 null 的死路径，一旦未来误用即跨屏误取消。建议删除整套全局 signal。

### R26-03【错误吞噬第三例】axios 链路 errorInterceptor（未全读但模式同 R24）：需要确认非 page-1 失败是否有 UI 反馈（结合 R23-02 loadMore 静默）。

### R30-01【闪退兜底缺失】仅 render ErrorBoundary，无 JS 全局错误处理
- `ErrorUtils.setGlobalHandler` / `nativeExceptionHandler` 缺位 —— 事件回调里的异常（如 formatCount 之外的 undefined 访问）直接闪退，无日志无兜底。这正是"点击按钮直接闪退"类问题的放大器。
- **修复**：注册全局 handler（dev 弹 toast / prod 记日志），配合 Sentry 类上报。

### R30-02【启动链路】splash 隐藏被 `migrateLegacyPreferences + checkAuth` 阻塞
- 冷启动 SQLite 迁移慢时白/启动屏时间被拉长。建议：先 hideAsync 再后台迁移，或迁移加超时。

## 🟠 P2 级发现

### R28-01 unifiedDb 同步写队列是"尽力而为"持久化 —— 写后立刻杀进程可能丢失最近一次偏好/tbs。可接受，注意 keychain（快照）与 SQLite 可能短暂不一致。
### R29-01 NotificationPoller 设计优秀（30min 节流、低电量翻倍、in-flight 守卫、uid 命名空间 baseline）✅。唯 `getLastCounts` 先读原生 UserDefaults 再回落 kv，双源可能不同步 —— 建议单一来源。
### R31-01 NativeTabs 用法是全场最佳实践（Liquid Glass tab bar + minimizeBehavior + BottomAccessory 签到进度）✅。
### R32-01 登录流程固定 1.5s sleep 等 cookie 同步 —— 可轮询（100ms 间隔最多 3s）缩短感知延迟。
### R32-02 登录失败后 loginProcessedRef 复位但 WebView 已跳转 —— 重试需手动回退导航，交互不明确。
### R33-01 user/[uid].tsx 用非选择器 `useAuthStore()` 整库订阅 —— 任何 auth 变化重渲染整页（其他页面都用了 selector，此处不一致）。
### R34-01 TiebaFeedCellView 的 contentDirty 合并更新模式应推广到 TiebaRichTextView（对比 R12-02）。
### R34-02 后台快照 BDUSS 存 keychain（AfterFirstUnlockThisDeviceOnly）✅ 安全正确。
### R30-03 QueryClient staleTime 15s/gcTime 30s 过短，且大多数列表根本没用 Query —— 数据层三套并存（Query/usePagedList/zustand stores），建议统一收敛到 Query（forum 迁移见 R18-03）。
