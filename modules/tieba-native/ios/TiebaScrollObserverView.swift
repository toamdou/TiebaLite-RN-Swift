import ExpoModulesCore
import UIKit

/// 原生滚动观察器 — 把"深层嵌套列表"的 contentOffset 送到 JS
///
/// 背景：动态页列表经 RNHostView（SwiftUI 托管）挂载后，FlashList 的
/// onScroll 事件到不了 JS（实测：纯 RN 页能触发、Host 树内不能），原生
/// tab bar 的 minimizeBehavior 也监测不到这类嵌套滚动。底栏自动隐藏需要
/// 一个可靠的滚动信号，本视图用 KVO 直读所在 RN 容器子树里的第一个
/// UIScrollView 的 contentOffset，把 { y } 事件发回 JS（不侵入滚动视图
/// 的 delegate，不影响列表本身行为）。
///
/// 用法：放在与 FlashList 同一个 RN 容器内（兄弟节点，尺寸 0×0）。
/// 事件：onScrollChanged → { y: Double }
public final class TiebaScrollObserverView: ExpoView {
  let onScrollChanged = EventDispatcher()

  private weak var observedScrollView: UIScrollView?
  private var observation: NSKeyValueObservation?
  private var attached = false

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    attach()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    attach()
  }

  deinit {
    observation?.invalidate()
  }

  /// 在自身所在容器子树里找第一个 UIScrollView（FlashList 的滚动视图），
  /// 找到后 KVO 监听 contentOffset。滚动视图可能晚于本视图挂载或被
  /// 重建，layoutSubviews 会持续补挂；切换目标时先释放旧监听。
  private func attach() {
    guard !attached, let container = superview else { return }
    var queue: [UIView] = [container]
    while let view = queue.popLast() {
      if view === self { continue }
      if let scroll = view as? UIScrollView {
        attach(to: scroll)
        return
      }
      queue.append(contentsOf: view.subviews)
    }
  }

  private func attach(to scroll: UIScrollView) {
    attached = true
    observedScrollView = scroll
    observation = scroll.observe(\.contentOffset, options: [.new]) { [weak self] _, change in
      guard let self, let newValue = change.newValue else { return }
      self.onScrollChanged(["y": newValue.y])
    }
  }
}
