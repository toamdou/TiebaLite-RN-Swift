# TiebaLite RN + Swift

TiebaLite 的 iOS 迁移源码，包含 React Native 客户端、本地 Swift 原生模块和 SwiftUI/UIKit 迁移原型，不含 Android/Kotlin 原版。

## Structure

- RN app: Expo SDK 57, React Native 0.86, Expo Router
- `modules/tieba-native`: Expo 本地原生模块（Swift）
- `plugins`: Expo config plugins，用于 Live Activity 与后台任务
- `native-swift-prototype`: SwiftUI/UIKit 迁移原型

## Run

```bash
npm install
npx expo run:ios
```

## Protobuf

Protobuf 描述符位于 `src/services/api/protos.json`，由 `src/services/api/protos_src` 生成：

```bash
node scripts/generate-protos.mjs
```
