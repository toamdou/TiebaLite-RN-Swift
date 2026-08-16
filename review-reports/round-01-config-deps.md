# 第 1 轮审查：项目配置与依赖（package.json / app.json / babel / tsconfig）

## 🔴 P0 级发现

### R1-01【疑似头像/图片无法显示的根因之一】ATS 配置实际禁止所有 HTTP，而贴吧 API 返回的图片/头像 URL 大量是 `http://`
- `app.json` 中 `NSAllowsArbitraryLoads: false`，且所有 `NSExceptionDomains` 的 `NSExceptionAllowsInsecureHTTPLoads` 均为 `false` —— 这些"例外域名"实际上一文不值，等于全局禁止 HTTP 明文请求。
- 百度贴吧 protobuf 接口返回的头像（`http://tb.himg.baidu.com/...`、`http://himg.baidu.com/...`）和帖子图片（`http://imgsrc.baidu.com/...`、`http://tiebapic.baidu.com/...`、`tb2~tb5.bdstatic.com`）经常是 `http://` 协议。
- 结果：`expo-image` 加载这些 URL 被 iOS ATS 直接拦截 → **头像、帖子图片全部显示不出来**。
- **修复建议**：不要改 ATS 放开 HTTP（不安全），而是在数据层（proto 解析后）统一 `url.replace(/^http:\/\//i, 'https://')`。百度静态 CDN 均支持 HTTPS。应集中在 `src/utils/` 做一个 `sanitizeUrl()` 并在 Avatar/PostContent/FeedCard 等所有出口调用。
- 同时注意例外域名列表里 `tb2.bdstatic.com` 写了但 `tb3/tb4/tb5.bdstatic.com`、`himg.baidu.com`、`imgsrc.baidu.com`、`tiebapic.baidu.com` 全部缺失 —— 但因为例外本身就是 false，加不加都没意义，正确方案是 HTTPS 化。

### R1-02 `reactCompiler: true`（实验特性）+ Reanimated 4.5.1 组合风险
- React Compiler 仍属实验性，与 Reanimated worklet、`react-native-pager-view`、旧式 `Animated` 混用时可能产生记忆化导致的"UI 不刷新/加载不出界面"类怪问题。
- 建议：保留但针对出现"数据到了界面不更新"的组件加 `use no memo` 验证；或在新架构稳定后再开。

## 🟡 P1 级发现

### R1-03 依赖版本问题
- `react-native-pager-view: 8.0.2` 与 `react-native-screens ~4.26.0`、RN 0.86 的搭配需验证（pager-view 8 是为 RN 0.76+ 新架构准备的大版本，API 有破坏性变更：`onPageScroll` 的 `position` 变 float → 检查所有使用点）。
- `protobufjs ^8.6.3` 在 JS 线程做 protobuf 反序列化，大帖子（几百楼）会卡 JS 线程。项目已有 Swift 原生 `TiebaProtoCodec.swift`，需确认是否真的走原生解码（后续轮次验证）。
- 缺少 `expo-dev-client`（若用 dev build 应显式加入）。

### R1-04 `@expo/ui ~57.0.9` 已安装且大量使用 ✅，但需审查使用质量
- 已发现使用点：history、threadstore、(tabs)/index、+not-found、webview、profile、explore、notifications。
- 需审查：是否与 RN 原生组件混排导致布局断裂（SwiftUI 组件在 Yoga 布局里尺寸塌陷是常见 bug 源）。

### R1-05 `expo-glass-effect` 已使用（index/_layout/thread[id]/GlassView）✅
- 但项目同时自研了 `modules/tieba-native/ios/TiebaGlassSurfaceView.swift` + `TiebaGradientBlurView.swift` —— 两套玻璃体系并存，重复造轮子且增加二进制体积。iOS 26 上 `expo-glass-effect` 就是官方 `GlassEffectContainer` 封装，应统一。

### R1-06 Splash `backgroundColor: "#208AEF"` 写死蓝色
- iOS 26 风格应为系统背景色自适应（深浅色），写死蓝色在深色模式下刺眼。

### R1-07 `userInterfaceStyle: "automatic"` ✅ 但需验证主题系统是否真正跟随系统（后续 theme 轮次）。

### R1-08 性能预算
- `CADisableMinimumFrameDurationOnPhone: true` 开启了 120Hz ProMotion —— 但若 JS 线程做 proto 解析 + 未优化列表，120Hz 反而放大掉帧功耗。需配合原生解码与 FlashList 优化。

## ✅ 做得对的地方
- FlashList 2.0.2、TanStack Query 5、Zustand 5、expo-image、expo-symbols、react-native-worklets 均为当前最佳实践选型。
- 仅 iOS 平台，没有安卓包袱，可以放心用 iOS 26 专属 API。

## 本轮结论
配置层最大嫌疑：**ATS 全面禁 HTTP + 贴吧返回 http:// 图片 URL = 头像/图片全挂**。这是"无法显示头像/图片"的头号嫌疑，待第 2~3 轮在数据层确认 URL 处理代码后定罪。
