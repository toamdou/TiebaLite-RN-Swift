// 标准 Expo Router 入口（原生 dev app 的 RCTBundleURLProvider 默认请求
// /index.bundle，缺少此文件会导致 404 并回退到内嵌 main.jsbundle，
// 使 reload/热更不生效）。
import 'expo-router/entry';
