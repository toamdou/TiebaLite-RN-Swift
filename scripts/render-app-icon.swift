// TiebaLite 应用图标渲染脚本（CoreGraphics，headless）
//
// 用途：把 assets/expo.icon/Assets/expo-symbol 2.svg 的同一套几何，加上蓝色
// 液态玻璃渐变背景，渲染成 1024×1024 的 splash 图标（expo-splash-screen 插件
// 只接受 PNG，且会按 imageWidth 自动缩放出 76/152/228 三档）。
//
// 几何常量必须与 expo-symbol 2.svg 保持一致；任何一处改动两处同步。
//
// 运行：swift scripts/render-app-icon.swift
// 输出：assets/images/splash-icon.png（1024×1024，sRGB，带 alpha）

import CoreGraphics
import Foundation
import ImageIO

let W = 1024
let H = 1024

// ── 几何常量（与 expo-symbol 2.svg 一一对应） ──
// 白色气泡卡片
let bubbleX: CGFloat = 200, bubbleY: CGFloat = 215
let bubbleW: CGFloat = 624, bubbleH: CGFloat = 594
let bubbleTopR: CGFloat = 80, bubbleBottomR: CGFloat = 40
// 半透明蓝色玻璃带
let bandX: CGFloat = 208, bandY: CGFloat = 228
let bandW: CGFloat = 608, bandH: CGFloat = 95
let bandTopR: CGFloat = 60, bandBottomR: CGFloat = 25
// 玻璃带顶部高光条
let glossX: CGFloat = 240, glossY: CGFloat = 238
let glossW: CGFloat = 544, glossH: CGFloat = 32
let glossR: CGFloat = 16
// 深蓝长线 / 短线（胶囊）
let longX: CGFloat = 259.5, longY: CGFloat = 375, longW: CGFloat = 505, longH: CGFloat = 48
let shortX: CGFloat = 358, shortY: CGFloat = 459, shortW: CGFloat = 308, shortH: CGFloat = 48
let lineR: CGFloat = 24

// ── 颜色 ──
func rgba(_ r: Int, _ g: Int, _ b: Int, _ a: CGFloat = 1.0) -> CGColor {
  CGColor(srgbRed: CGFloat(r) / 255.0, green: CGFloat(g) / 255.0, blue: CGFloat(b) / 255.0, alpha: a)
}
let cBgLight = rgba(0x2E, 0x93, 0xF7)   // 渐变亮端 #2E93F7
let cBgDark  = rgba(0x0D, 0x5F, 0xD8)   // 渐变暗端 #0D5FD8
let cBand    = rgba(0x1E, 0x6D, 0xF5, 0.5) // 玻璃带 #1E6DF5 @ 50%
let cLine    = rgba(0x1E, 0x5F, 0xBF)   // 深蓝线 #1E5FBF

/// 顶部大圆角、底部小圆角（同 SVG path 构造）
func roundedPath(x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, topR: CGFloat, bottomR: CGFloat) -> CGPath {
  let p = CGMutablePath()
  p.move(to: CGPoint(x: x, y: y + topR))
  p.addQuadCurve(to: CGPoint(x: x + topR, y: y), control: CGPoint(x: x, y: y))
  p.addLine(to: CGPoint(x: x + w - topR, y: y))
  p.addQuadCurve(to: CGPoint(x: x + w, y: y + topR), control: CGPoint(x: x + w, y: y))
  p.addLine(to: CGPoint(x: x + w, y: y + h - bottomR))
  p.addQuadCurve(to: CGPoint(x: x + w - bottomR, y: y + h), control: CGPoint(x: x + w, y: y + h))
  p.addLine(to: CGPoint(x: x + bottomR, y: y + h))
  p.addQuadCurve(to: CGPoint(x: x, y: y + h - bottomR), control: CGPoint(x: x, y: y + h))
  p.closeSubpath()
  return p
}

// ── 画布 ──
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
let bytesPerRow = W * 4
var data = [UInt8](repeating: 0, count: H * bytesPerRow)
let ctx = CGContext(
  data: &data, width: W, height: H, bitsPerComponent: 8, bytesPerRow: bytesPerRow,
  space: colorSpace,
  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
)!

// y 轴翻转为向下（与图像/屏幕坐标一致）
ctx.translateBy(x: 0, y: CGFloat(H))
ctx.scaleBy(x: 1, y: -1)

// 翻转后坐标系 y 向上：视觉坐标 y（自上而下）→ CoreGraphics y = 1024 - y - h。
// 元素常量全部采用视觉坐标（与 SVG 一致），绘制时经 flippedRect 转换。
func flippedRect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect {
  CGRect(x: x, y: CGFloat(H) - y - h, width: w, height: h)
}

// ── 1. 液态玻璃渐变背景（视觉对角：左上亮 → 右下暗） ──
// 翻转后 y 向上，左上角 = (0, 1024)，右下角 = (1024, 0)。
let gradient = CGGradient(
  colorsSpace: colorSpace,
  colors: [cBgLight, cBgDark] as CFArray,
  locations: [0, 1]
)!
ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: CGFloat(H)), end: CGPoint(x: CGFloat(W), y: 0), options: [])

// 顶部柔和高光（玻璃反光，与页面背景同向）
ctx.setFillColor(rgba(0xFF, 0xFF, 0xFF, 0.08))
ctx.fill(flippedRect(0, 0, CGFloat(W), 420))

// ── 2. 白色气泡卡片 ──
// 翻转后 y-up：视觉顶部 = 小 CG y，故圆角参数交换（视觉 topR 画在 CG y 小端）。
ctx.setFillColor(rgba(0xFF, 0xFF, 0xFF, 0.92))
ctx.addPath(roundedPath(x: bubbleX, y: CGFloat(H) - bubbleY - bubbleH, w: bubbleW, h: bubbleH, topR: bubbleBottomR, bottomR: bubbleTopR))
ctx.fillPath()

// ── 3. 半透明蓝色玻璃带（压气泡顶部） ──
ctx.setFillColor(cBand)
ctx.addPath(roundedPath(x: bandX, y: CGFloat(H) - bandY - bandH, w: bandW, h: bandH, topR: bandBottomR, bottomR: bandTopR))
ctx.fillPath()

// ── 4. 玻璃带顶部高光条 ──
ctx.setFillColor(rgba(0xFF, 0xFF, 0xFF, 0.3))
ctx.addPath(CGPath(roundedRect: flippedRect(glossX, glossY, glossW, glossH), cornerWidth: glossR, cornerHeight: glossR, transform: nil))
ctx.fillPath()

// ── 5. 深蓝长线 / 短线 ──
ctx.setFillColor(cLine)
ctx.addPath(CGPath(roundedRect: flippedRect(longX, longY, longW, longH), cornerWidth: lineR, cornerHeight: lineR, transform: nil))
ctx.fillPath()
ctx.addPath(CGPath(roundedRect: flippedRect(shortX, shortY, shortW, shortH), cornerWidth: lineR, cornerHeight: lineR, transform: nil))
ctx.fillPath()

// ── 6. 写出 PNG ──
guard let image = ctx.makeImage() else {
  fatalError("CGContext.makeImage failed")
}
let outURL = URL(fileURLWithPath: "assets/images/splash-icon.png")
guard let dest = CGImageDestinationCreateWithURL(outURL as CFURL, "public.png" as CFString, 1, nil) else {
  fatalError("CGImageDestinationCreateWithURL failed")
}
CGImageDestinationAddImage(dest, image, nil)
guard CGImageDestinationFinalize(dest) else {
  fatalError("CGImageDestinationFinalize failed")
}

// ── 7. 像素断言（无头验证，替代目视检查） ──
// data 行号是 CG 坐标（翻转后 y 向上）；视觉坐标（自上而下）行号 = H-1-y。
func pixel(_ x: Int, _ visualY: Int) -> (r: UInt8, g: UInt8, b: UInt8, a: UInt8) {
  let off = (H - 1 - visualY) * bytesPerRow + x * 4
  return (data[off], data[off + 1], data[off + 2], data[off + 3])
}
func expectNear(_ name: String, _ x: Int, _ y: Int, _ er: Int, _ eg: Int, _ eb: Int, tol: Int = 30) {
  let p = pixel(x, y)
  func d(_ a: Int, _ b: UInt8) -> Int { abs(a - Int(b)) }
  guard p.a > 200, d(er, p.r) <= tol, d(eg, p.g) <= tol, d(eb, p.b) <= tol else {
    print("FAIL \(name) @(\(x),\(y)): got (\(p.r),\(p.g),\(p.b),\(p.a)) expected ~(\(er),\(eg),\(eb))")
    exit(1)
  }
  print("ok   \(name) @(\(x),\(y)): (\(p.r),\(p.g),\(p.b))")
}

// 背景渐变亮端（顶部）
expectNear("bg-top", 512, 60, 0x2E, 0x93, 0xF7, tol: 40)
// 背景渐变暗端（右下角）
expectNear("bg-corner", 900, 980, 0x0D, 0x5F, 0xD8, tol: 40)
// 玻璃带（半透明蓝叠白 ≈ 143,182,250）
expectNear("band", 512, 310, 143, 182, 250, tol: 30)
// 长线中心
expectNear("long-line", 512, 399, 0x1E, 0x5F, 0xBF, tol: 20)
// 短线中心
expectNear("short-line", 512, 483, 0x1E, 0x5F, 0xBF, tol: 20)
// 两线之间白气泡（0.92 白叠背景渐变蓝 ≈ 239,246,254）
expectNear("bubble-white", 512, 440, 239, 246, 254, tol: 12)
// 气泡外玻璃背景（左侧中部）
expectNear("bg-left", 110, 500, 0x2E, 0x93, 0xF7, tol: 45)
// 气泡底部（无元素区，背景渐变）
expectNear("bg-under", 512, 860, 0x0D, 0x5F, 0xD8, tol: 45)

print("splash-icon.png: 1024×1024 written, all pixel assertions passed")
