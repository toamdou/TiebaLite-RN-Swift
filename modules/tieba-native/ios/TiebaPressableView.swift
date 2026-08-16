import ExpoModulesCore
import UIKit

/// 通用原生按压反馈容器（iOS 26 液态玻璃质感 P1 基建）。
///
/// 按下时由原生 `UIView` 弹簧动画将内容整体缩放（默认 0.97）+ 可选高光覆盖层
/// 淡入微位移，抬起恢复并触发 `onPress`；同时用原生 `UIImpactFeedbackGenerator`
/// 在按下瞬间发送 Light 震动。替换 RN 侧手写 `Pressable + withSpring + hapticImpact`
/// 三段式，避免 JS 每帧驱动动画。
public final class TiebaPressableView: ExpoView {
  // MARK: - Props（didSet 驱动，参考 TiebaGradientBlurView 的 intensity/tint）

  /// 按下时内容缩放比例（默认 0.97，1.0 = 不缩放）
  var scalePressed: Double = 0.97 {
    didSet {
      // 若正在按压中，立即重放视觉，避免下次按下才生效
      guard isPressed, !disabled else { return }
      setPressedTransform(scale: CGFloat(scalePressed))
    }
  }

  /// 按压时覆盖层颜色；nil = 不显示覆盖层
  var highlightColor: UIColor? {
    didSet {
      highlightView.backgroundColor = highlightColor
      highlightView.isHidden = highlightColor == nil || !isPressed
    }
  }

  /// 禁用后不响应手势、不发震动、不触发 onPress
  var disabled: Bool = false {
    didSet {
      pressGesture.isEnabled = !disabled
      // 禁用瞬间若正处于按压态，需立即还原视觉
      if disabled, isPressed {
        isPressed = false
        hideHighlight()
        setPressedTransform(scale: 1)
      }
    }
  }

  /// 抬起（仍落在容器内）时触发；调用方负责防抖
  let onPress = EventDispatcher()

  // MARK: - Private

  /// 高光覆盖层：zPosition 抬高到 RN 子视图之上（Fabric 子视图直接挂到 self 上）
  private let highlightView = UIView()
  private lazy var pressGesture = UILongPressGestureRecognizer(
    target: self,
    action: #selector(handlePress(_:))
  )
  /// 按下瞬间 Light 震动（风格统一由收敛波负责，本组件固定 Light）
  private let haptic = UIImpactFeedbackGenerator(style: .light)

  /// 当前是否处于按压中（供 didSet 重放视觉 / 禁用时还原）
  private var isPressed = false

  /// 高光覆盖层位移幅度（相对自身高度比例）
  private let highlightSlideRatio: CGFloat = 0.04

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = true

    // 高光覆盖层：不拦截触摸；zPosition 抬到 RN 子视图之上以呈现"按压变暗/泛光"
    highlightView.backgroundColor = highlightColor
    highlightView.isUserInteractionEnabled = false
    highlightView.isHidden = true
    highlightView.layer.zPosition = 1
    addSubview(highlightView)

    // "按下即反馈、抬起即触发"：极短长按门槛让手势在落指瞬间即进入 began
    pressGesture.minimumPressDuration = 0.01
    addGestureRecognizer(pressGesture)

    haptic.prepare()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    highlightView.frame = bounds
    // 跟随容器圆角（RN style 的 borderRadius 会同步到本视图 layer.cornerRadius）
    highlightView.layer.cornerRadius = layer.cornerRadius
  }

  // MARK: - 手势

  @objc private func handlePress(_ gesture: UILongPressGestureRecognizer) {
    switch gesture.state {
    case .began:
      guard !disabled else { return }
      isPressed = true
      haptic.impactOccurred()
      showHighlight()
      setPressedTransform(scale: CGFloat(scalePressed))

    case .ended:
      // 仅在容器内抬起才视为一次有效按压
      let inside = bounds.contains(gesture.location(in: self))
      isPressed = false
      hideHighlight()
      setPressedTransform(scale: 1)
      if inside, !disabled {
        onPress()
      }

    case .cancelled, .failed:
      // 拖出容器 / 系统打断：还原视觉，不触发 onPress
      isPressed = false
      hideHighlight()
      setPressedTransform(scale: 1)

    default:
      break
    }
  }

  // MARK: - 视觉

  /// 原生弹簧动画缩放内容（按压快进、抬起慢回），全程不走 JS 每帧
  private func setPressedTransform(scale: CGFloat) {
    let target = CGAffineTransform(scaleX: scale, y: scale)
    UIView.animate(
      withDuration: isPressed ? 0.18 : 0.28,
      delay: 0,
      usingSpringWithDamping: isPressed ? 0.6 : 0.7,
      initialSpringVelocity: isPressed ? 0.9 : 0.4,
      options: [.allowUserInteraction, .curveEaseOut, .beginFromCurrentState]
    ) {
      self.transform = target
    }
  }

  /// 高光覆盖层淡入 + 轻微向下位移（"轻微高光位移"）。
  /// 起点位姿（透明 + 下移）在 hideHighlight 完成时预置，此处从当前值动画到目标位姿。
  private func showHighlight() {
    guard highlightColor != nil, !disabled else { return }
    highlightView.isHidden = false
    UIView.animate(
      withDuration: 0.18,
      delay: 0,
      options: [.curveEaseOut, .allowUserInteraction]
    ) {
      self.highlightView.alpha = 1
      self.highlightView.transform = .identity
    }
  }

  /// 高光覆盖层淡出，完成后预置下一轮的起点位姿并隐藏。
  /// 注意：completion 在动画被新动画取代时仍会触发（finished=false），
  /// 若此期间用户已再次按下（isPressed），必须保留新动画显示出的高光。
  private func hideHighlight() {
    let slide = bounds.height * highlightSlideRatio
    let from = CGAffineTransform(translationX: 0, y: slide)
    UIView.animate(
      withDuration: 0.15,
      delay: 0,
      options: [.curveEaseIn, .allowUserInteraction]
    ) {
      self.highlightView.alpha = 0
      self.highlightView.transform = from
    } completion: { finished in
      guard !self.isPressed, finished || self.highlightView.alpha == 0 else { return }
      self.highlightView.isHidden = true
      self.highlightView.alpha = 0
      self.highlightView.transform = from
    }
  }
}
