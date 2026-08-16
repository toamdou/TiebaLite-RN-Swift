# TiebaLite iOS 26 液态玻璃质感美化 — 设计文档

- 日期：2026-08-13
- 状态：已获用户确认（方案 A 全页面系统化 + 混合组件级 Swift 化，无样板页）
- 关联：[[tiebalite-project-goals]]、[[tiebalite-swift-migration-assessment]]、[[tiebalite-impl-wave2-2026-08]]

## 1. 目标与约束

**目标**：App 页面全面对齐 iOS 26 观感——液态玻璃材质、字体排版、组件间距、动效与震动反馈。性能开销不显著增大、滚动流畅、动画顺滑。

**硬约束**（用户确认）：
- 性能红线：**先落地代码，不跑 Xcode 工具链**；内存占用稍超可接受。性能靠设计规则约束 + 用户实机滚动感受验证，不做工具量化门槛。
- 性能设计规则（代码必须遵守）：
  1. 新增动画一律跑在 UI 线程（原生 SwiftUI 或 Reanimated worklet），不进 JS 每帧往返。
  2. 每屏实时 `UIVisualEffectView` 玻璃最多 1 处（含静态模拟的视觉一致性要求）。
  3. 静态玻璃模拟不得叠加 `shadowOpacity` 绘制（玻璃自带深度，见 `Shadows.glass`）。
  4. 滚动中复用的列表单元格不重放入场动画（仅首帧入场触发）。
  5. 震动不做按压重复触发（长按菜单仅在弹出瞬间震一次）。

**范围**：全页面系统化（30+ 页面），以设计令牌驱动全局覆盖，低流量页顺带受益。

**视觉优先级**（用户多选确认，按投入成本分层）：
- ✅ 液态玻璃铺开（系统材质，成本低）
- ✅ 动效/微交互统一（spring 令牌 + 震动）
- ✅ 排版/间距校准（令牌层）
- ⏸️ 光线折射/高光效果：**本次不投入**（自定义着色器性能风险最高，延后）

## 2. 技术路线：混合——组件级 Swift 化

2026-08-12 全 Swift 迁移评估（`tiebalite-swift-migration-assessment`）结论：全量迁移可行但为 all-in 决策（3-5 月单人），且不解决图片内存 P0，与本次美化目标不匹配。**已确认不采用全量迁移**。

采用第三条路（已被 `modules/tieba-native/ios/` 10 个运行中原生视图验证）：**高价值组件原生化，RN 壳不动，逐组件落地**。

### 双轨架构

```
规范层（RN 单一事实源）           原生层（SwiftUI，modules/tieba-native）
┌───────────────────────┐        ┌──────────────────────────────────┐
│ theme/* 令牌            │──props→│ NativeGlassSurface (iOS26 玻璃)   │
│ hapticsMap 震动规范     │──props→│ NativeFeedCell (原生信息流卡片)    │
│ spacing/typography     │──props→│ NativeSheet (原生底部浮层)         │
│                        │──props→│ NativePressable (原生按压反馈)     │
│ 页面层 30+（RN 壳）      │←──调用──┘ 路由/数据/低流量页仍走 RN         │
└───────────────────────┘
```

**核心原则**：
- **令牌单一事实源放 RN**：JS 包装组件读 `useThemeColors` 解析语义值，以 props 传入原生视图。原生组件保持"哑视图"——颜色/间距/圆角全部由 RN 传入。
- **不会出现 RN/Swift 两套令牌分叉**：`native-swift-prototype/` 的 4-token 设计系统不参与运行，仅作视觉参考。
- **性能边界**：原生组件只在挂载/状态变化时收 props，动画在原生内部跑，无每帧 bridge 往返。
- 改动主题时**不需要动 Swift 代码**。

### 明确不动的（迁移评估确认：纯成本无观感收益）
数据层、proto、路由、登录、WebView、Cookie 同步。

## 3. 令牌层（src/theme/）

### 新增
1. **`glass.ts`** — 玻璃面材质令牌
   - `tint`：浅/深色下玻璃 `tintColor`（现 GlassView 的 tint 靠调用方手传，收敛为令牌）
   - `highlight`：玻璃顶部高光渐变（staticGlass 模拟用：浅色 `rgba(255,255,255,0.5)→0`，深色 `rgba(255,255,255,0.08)→0`）
   - `border`：玻璃描边（浅色半透明白边 / 深色半透明黑边，hairline）
   - `budget`：每屏实时玻璃上限（默认 1）——降级开关源头

2. **`hapticsMap.ts`** — 震动风格映射表（设计规范，放令牌层）
   - 场景 → 风格：`press: Light`、`toggle: Selection`、`like/favorite: Light`、`sheet-present: Soft`、`action-success: Success`、`action-fail: Error`
   - 现有 221 处调用点风格不统一，全部收敛到映射表，一处修改全局生效

3. **`motion.ts`** — 动效令牌补齐（现有 springs.ts 已含按压/入场/级联，缺口）
   - `LIST_ENTER`：列表入场（fade + 8pt 上移，stagger 35ms）
   - `SHEET_PRESENT / SHEET_DISMISS`：浮层过渡
   - `ICON_POP`：图标弹跳（小过冲）

### 修订
- **`spacing.ts`**：全站审计，消灭硬编码间距（页面边距 `insetGrouped`、列表行距对齐 iOS 26）
- **`typography.ts`**：基本已贴 SF Dynamic Type，主要修页面内硬编码 fontSize/lineHeight

## 4. 组件分配（谁原生、谁 RN）

### 原生 SwiftUI（效果密集、高频）
| 组件 | 理由 |
|---|---|
| `NativeGlassSurface` | iOS 26 液态玻璃 + squircle 圆角 + 描边；比 expo-glass-effect 薄封装多材质深度控制；用于导航下玻璃、浮条、分组标题 |
| `NativeFeedCell` | 首页信息流最常滚动；原生 spring 按压 + 图片（复用 `TiebaImageIO`）+ 原生震动，滚动开销最小 |
| `NativeSheet` | 原生底部浮层：玻璃材质、弹簧转场、拖拽关闭、圆角 28、进出场震动。**取舍规则**：现有 `@expo/ui/community/bottom-sheet` 已是原生玻璃 sheet，P3 先评估其材质/震动/圆角缺口——够用则仅包装补震动，缺口明显（如材质透明度、圆角 28、进出场震动缺失）才自建原生 sheet |
| `NativePressable` | 通用原生按压反馈（scale + 高光 + hapticsMap 风格），全站复用，替代手写 Pressable+withSpring+haptic 三段式 |

### RN 层（令牌 + 已有组件升级）
- `GlassView` 增加 **staticGlass 模拟降级**：超预算/`reduceTransparency` 时用"半透明底色 + 顶部高光渐变 + 细描边"模拟玻璃（视觉接近，零高斯开销）；现有降级只落纯色会断档
- `Button`、`ListItem`（新增，iOS insetGrouped 行样式）包装 `NativePressable`
- 排版/间距/震动映射表全站收敛
- 低流量页（设置内页、规则、成员等）直接消费令牌，不逐个原生

## 5. 动效 / 微交互 / 震动清单

### 组件级动画（原生层承担）
| 动效 | 现状 | 动作 |
|---|---|---|
| 列表入场级联 | 无 | `NativeFeedCell` 原生 fade + 8pt 上移 + stagger 35ms；滚动复用不重放 |
| 按压反馈 | 部分页面有 | 全站统一 `NativePressable`：scale 0.97/0.93 + 玻璃高光位移 + 震动 |
| 点赞/收藏图标弹跳 | 无 | `ICON_POP` 小过冲，轻量 transform 不触发重排 |
| sheet 进出场 | 原生已有（@expo/ui bottom-sheet） | 保持原生过渡，补进出场震动 |
| 页面转场 | 原生已有 | 保持，不重做（系统 push 本身就是 iOS 26 质感） |

### 震动反馈（hapticsMap 全站收敛）
- 风格映射：轻按 `Light` · 开关/切换 `Selection` · 点赞收藏 `Light` · sheet 展开 `Soft` · 任务成功 `Success` · 失败 `Error`
- 现有 221 处风格不一 → 映射表；补齐漏点（TabBar 切换、搜索回车、下拉刷新完成）

### 无障碍红线（已有设施，不可破坏）
- `useReducedMotion`：减少动态效果时关闭级联入场与弹跳，保留淡入
- `reduceTransparency`：实时玻璃降级 staticGlass，不透明确认框保持纯色

## 6. 铺开顺序（批次，每批独立验证、可回滚）

| 批次 | 内容 | 验证点 |
|---|---|---|
| **P1 基建** | 令牌补齐（glass/hapticsMap/motion）、`NativePressable`、`GlassView` staticGlass 降级 | 按压手感全站统一、玻璃降级不穿帮 |
| **P2 核心链路** | `NativeFeedCell` 接入首页信息流（FeedCard 替换为原生单元格 + 入场级联）；`NativeGlassSurface` 接入帖子详情页（导航下玻璃、浮条玻璃化） | 首页滚动流畅、入场动画顺滑 |
| **P3 浮层** | `NativeSheet` 统一更多菜单/评论 sheet；导航下玻璃、浮条玻璃化 | 浮层过渡顺滑、拖拽关闭跟手 |
| **P4 全量收敛** | 30+ 页逐页：排版间距令牌化、震动补全、低流量页消费令牌 | 全站观感统一、无硬编码样式残留 |
| **P5 回归** | 无障碍红线、深浅色全扫、内存观察（超一点可接受） | 无 reduce-motion 回归、无白底黑字 |

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 原生组件 props 通信边界 | 哑视图原则：props 只传语义值，逻辑全在 RN 包装组件 |
| 两套令牌分叉 | 令牌单一事实源在 RN，Swift 不落令牌 |
| 滚动性能回归 | 规则 2-4（玻璃限 1 处、复用不重放入场、UI 线程动画）逐批检查 |
| 入场动画在长列表累积 | 仅首帧入场，滚动复用单元格不重放（规则 4） |
| 全量迁移冲动（3-5 月成本） | 本设计明确不迁移数据层/路由/登录，只做组件级 |
