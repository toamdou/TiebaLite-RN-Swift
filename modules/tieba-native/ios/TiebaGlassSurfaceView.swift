import ExpoModulesCore
import QuartzCore
import UIKit

/// 原生玻璃容器（iOS 26 液态玻璃质感 P2 基建，哑视图，不接页面）。
///
/// 与 expo-glass-effect（UIGlassEffect，iOS 26 专属）的差异化：本组件基于
/// `UIVisualEffectView` 系统材质（iOS 16.4 起可用，无需 Xcode 26 / iOS 26），
/// 额外叠加连续曲率 squircle 圆角 + hairline 描边 + 可选顶部高光 CAGradientLayer，
/// 提供"材质深度"组合控制，浅色效果为主，深色自动减弱。
///
/// 层序（底 → 顶）：
///   1. effectView     UIVisualEffectView 系统材质（fill 全视图，不拦截触摸）
///   2. tintView       材质着色覆盖层（UIVisualEffectView 无直接 tint，半透明色层）
///   3. RN 子视图      （经 mountChildComponentView 插入到 3 个装饰层之上）
///   4. highlightView  顶部高光渐变（zPosition = 1，盖在子视图之上，不拦截触摸）
///   5. layer.border   hairline 描边（CALayer border 恒绘制在内容之上）
/// 容器 `layer.masksToBounds = true` + `cornerCurve = .continuous`（squircle 裁切）。
public final class TiebaGlassSurfaceView: ExpoView {
  // MARK: - Props（didSet 驱动，参考 TiebaGradientBlurView 的 intensity/tint 模式）

  /// 系统材质名称（默认 "regular"）。映射表见 `materialStyle(_:)`。
  var material: String = "regular" {
    didSet { updateMaterial() }
  }

  /// 材质着色；UIVisualEffectView 无直接 tint，用覆盖半透明色层实现。
  /// 建议传入 alpha ≤ 0.15 的颜色，避免盖死内容。
  /// 命名避开 `UIView.tintColor`（open 属性），否则需 override 且语义会被
  /// UIView 的 tint 渲染接管；JS prop 键名仍为 "tintColor"（见 TiebaNativeModule）。
  var glassTintColor: UIColor? {
    didSet {
      tintView.backgroundColor = glassTintColor
      tintView.isHidden = glassTintColor == nil
    }
  }

  /// squircle 圆角（默认 20），layer.cornerRadius + cornerCurve = .continuous
  var cornerRadius: Double = 20 {
    didSet { updateCornerRadius() }
  }

  /// hairline 描边色（nil = 不画）；layer.borderWidth = 0.5 + borderColor
  var borderColor: UIColor? {
    didSet { updateBorder() }
  }

  /// 顶部高光（默认 true）
  var highlight: Bool = true {
    didSet { updateHighlight() }
  }

  /// 可选按压回调（导航下浮条等可点场景用；不需要时仅注册）。
  /// 手势常驻注册但 `cancelsTouchesInView = false`，不吞/不延迟内部 Link、Pressable 的点击。
  let onPress = EventDispatcher()

  // MARK: - Private

  /// 系统材质层
  private let effectView = UIVisualEffectView()
  /// 材质着色覆盖层（不拦截触摸）
  private let tintView = UIView()
  /// 顶部高光容器（zPosition 抬到 RN 子视图之上）
  private let highlightView = UIView()
  /// 顶部高光渐变：白色，顶部 alpha 0.35（深色 0.15）→ 0，高度约 28%
  private let highlightLayer = CAGradientLayer()
  /// 高光高度占视图高度比例
  private static let highlightHeightRatio: CGFloat = 0.28
  /// 高光顶部 alpha（浅色效果为主）
  private static let highlightTopAlphaLight: CGFloat = 0.35
  /// 高光顶部 alpha（深色自动减弱）
  private static let highlightTopAlphaDark: CGFloat = 0.15
  /// 初始化阶段先加入的装饰子视图数量（effectView/tintView/highlightView），
  /// RN 子视图插入在其后，保证盖在玻璃材质之上。
  private static let decorativeSubviewCount = 3

  /// 点按手势：常驻注册，但 `cancelsTouchesInView = false`（不吞子视图触摸）+
  /// `delaysTouchesBegan = false`（不延迟子视图点击）。帖详情页主楼卡（作者行 Link、
  /// PostContent 图片/投票）与回复工具条（只看楼主/正倒序 Pressable）内部均为交互密集区，
  /// 父容器手势不得在识别时取消子级触摸——语义与 TiebaFeedCellView 长按手势
  /// （cancelsTouchesInView = false）保持一致。
  private lazy var tapGesture: UITapGestureRecognizer = {
    let gesture = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
    gesture.cancelsTouchesInView = false
    gesture.delaysTouchesBegan = false
    return gesture
  }()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    // 材质层：不拦截触摸（RN 子视图是 effectView 的兄弟而非后代，可正常交互）
    effectView.isUserInteractionEnabled = false
    effectView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(effectView)

    // 着色层：默认隐藏，无交互
    tintView.isUserInteractionEnabled = false
    tintView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    tintView.isHidden = true
    addSubview(tintView)

    // 高光层：zPosition 抬到子视图之上，不拦截触摸
    highlightView.isUserInteractionEnabled = false
    highlightView.layer.zPosition = 1
    addSubview(highlightView)

    highlightLayer.startPoint = CGPoint(x: 0.5, y: 0)
    highlightLayer.endPoint = CGPoint(x: 0.5, y: 1)
    highlightLayer.locations = [0, 1]
    highlightView.layer.addSublayer(highlightLayer)

    addGestureRecognizer(tapGesture)

    updateMaterial()
    updateCornerRadius()
    updateBorder()
    updateHighlight()
  }

  // MARK: - Layout

  public override func layoutSubviews() {
    super.layoutSubviews()
    effectView.frame = bounds
    tintView.frame = bounds
    highlightView.frame = bounds
    let highlightHeight = min(bounds.height * Self.highlightHeightRatio, bounds.height)
    highlightLayer.frame = CGRect(x: 0, y: 0, width: bounds.width, height: highlightHeight)
  }

  public override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    updateHighlight()
  }

  // MARK: - RN 子视图承载

  /// Fabric 默认把 RN 子视图按兄弟索引 insertSubview 到 self，会落到 init 阶段已加入的
  /// 装饰层之下，导致内容被玻璃材质盖住。这里改为插到装饰层之后，
  /// 保证内容盖在材质之上，同时保持 RN 兄弟相对顺序。
  public override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    insertSubview(childComponentView, at: index + Self.decorativeSubviewCount)
  }

  /// 与 mount 配套：默认 unmount 断言 child 位于 subviews[index]，偏移插入后会失配，
  /// 故直接按引用移除。
  public override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    childComponentView.removeFromSuperview()
  }

  // MARK: - 手势

  @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
    if gesture.state == .ended {
      onPress()
    }
  }

  // MARK: - 视觉更新

  private func updateMaterial() {
    effectView.effect = UIBlurEffect(style: Self.materialStyle(material))
  }

  private func updateCornerRadius() {
    layer.cornerRadius = CGFloat(cornerRadius)
    layer.cornerCurve = .continuous
    layer.masksToBounds = true
  }

  private func updateBorder() {
    layer.borderColor = borderColor?.cgColor
    layer.borderWidth = borderColor == nil ? 0 : 0.5
  }

  private func updateHighlight() {
    highlightView.isHidden = !highlight
    guard highlight else { return }
    highlightLayer.colors = [
      UIColor(white: 1, alpha: highlightTopAlpha()).cgColor,
      UIColor(white: 1, alpha: 0).cgColor,
    ]
  }

  /// 深色模式自动减弱高光
  private func highlightTopAlpha() -> CGFloat {
    if traitCollection.userInterfaceStyle == .dark {
      return Self.highlightTopAlphaDark
    }
    return Self.highlightTopAlphaLight
  }

  // MARK: - 材质映射表（内聚在本文件静态函数，参考 TiebaGradientBlurView.blurStyle）

  /// `material` → `UIBlurEffect.Style`。
  /// - "regular"（默认）→ `.systemMaterial`
  /// - "clear" → `.systemUltraThinMaterial`（视觉最接近液态玻璃透明）
  /// - "dark" / "light" → 对应深浅变体（`.systemMaterialDark` / `.systemMaterialLight`）
  /// - 其余接受系统材质全名（"systemThinMaterial"、"systemThickMaterialDark" 等）
  private static func materialStyle(_ material: String) -> UIBlurEffect.Style {
    switch material {
    case "regular":
      return .systemMaterial
    case "clear":
      return .systemUltraThinMaterial
    case "dark":
      return .systemMaterialDark
    case "light":
      return .systemMaterialLight
    case "ultraThin":
      return .systemUltraThinMaterial
    case "ultraThinDark":
      return .systemUltraThinMaterialDark
    case "ultraThinLight":
      return .systemUltraThinMaterialLight
    case "thin":
      return .systemThinMaterial
    case "thinDark":
      return .systemThinMaterialDark
    case "thinLight":
      return .systemThinMaterialLight
    case "thick":
      return .systemThickMaterial
    case "thickDark":
      return .systemThickMaterialDark
    case "thickLight":
      return .systemThickMaterialLight
    case "systemUltraThinMaterialDark":
      return .systemUltraThinMaterialDark
    case "systemUltraThinMaterialLight":
      return .systemUltraThinMaterialLight
    case "systemThinMaterialDark":
      return .systemThinMaterialDark
    case "systemThinMaterialLight":
      return .systemThinMaterialLight
    case "systemMaterialDark":
      return .systemMaterialDark
    case "systemMaterialLight":
      return .systemMaterialLight
    case "systemThickMaterialDark":
      return .systemThickMaterialDark
    case "systemThickMaterialLight":
      return .systemThickMaterialLight
    default:
      return .systemMaterial
    }
  }
}
