import ExpoModulesCore
import UIKit

/// NativeFeedCell — 原生信息流卡片（哑视图）
///
/// 视觉数据全部由 RN 侧以 props 传入，本类不做任何数据逻辑。
/// 布局为纯 UIKit（手排 frame）：模块内（tieba-native/ios）无 SwiftUI/UIHostingController
/// 先例，列表滚动复用场景下纯 UIKit 的开销最小、尺寸可控性最强。
///
/// 动效：
/// - 按压：原生 spring 缩放至 0.97（阻尼感参考 PRESS_ENTER/PRESS_EXIT）+ Light 震动；
///   反馈带确认窗口 + 窗口坐标系位移判定取消，
///   滚动意图（屏幕位移 > 10pt）不产生反馈、不触发 onPress（快慢滚一致）
/// - 入场：首帧 fade + 8pt 上移 + 35ms stagger；滚动复用的单元格不重放入场动画
///   （entryPlayed 标记 + 递增计数器，仅每个原生视图实例首次挂载时播放一次）
/// - 图片：经 TiebaImageIO（内存 + 磁盘缓存）加载 Hero 图，200pt
public final class TiebaFeedCellView: ExpoView {
  // MARK: - Props（didSet 驱动）

  var title: String = "" {
    didSet { scheduleContentUpdate() }
  }
  var summary: String? {
    didSet { scheduleContentUpdate() }
  }
  var author: String = "" {
    didSet { scheduleContentUpdate() }
  }
  var forumName: String? {
    didSet { scheduleContentUpdate() }
  }
  var replyCount: Int = 0 {
    didSet { scheduleContentUpdate() }
  }
  /// 时间字符串，格式由 RN 侧完成（如 "3 分钟前"）。
  var timeText: String = "" {
    didSet { scheduleContentUpdate() }
  }
  /// 有图帖 Hero 图源。
  var imageUrl: String? {
    didSet { reloadHeroImage() }
  }
  /// 操作栏图标主色（RN 传主题色）。
  var accentColor: UIColor? {
    didSet { scheduleContentUpdate() }
  }
  var textPrimary: UIColor = .label {
    didSet { scheduleContentUpdate() }
  }
  var textSecondary: UIColor = .secondaryLabel {
    didSet { scheduleContentUpdate() }
  }
  var cardBackground: UIColor? {
    didSet { scheduleContentUpdate() }
  }
  var radius: Double = 20 {
    didSet { scheduleContentUpdate() }
  }
  /// 可选：RN 传入的 stagger 序号（>= 0 时覆盖内部递增计数器；-1 = 内部计数器）。
  var enterIndex: Int = -1 {
    didSet { scheduleContentUpdate() }
  }

  let onPress = EventDispatcher()

  // MARK: - 布局常量

  private static let heroImageHeight: CGFloat = 200
  private static let contentPadding: CGFloat = 12
  private static let actionBarHeight: CGFloat = 18
  private static let heroToContentGap: CGFloat = 8
  private static let blockGap: CGFloat = 6

  // MARK: - Subviews

  private let heroImageView = UIImageView()
  private let titleLabel = UILabel()
  private let summaryLabel = UILabel()
  private let metaLabel = UILabel()
  private let commentIconView = UIImageView()
  private let replyCountLabel = UILabel()

  // MARK: - 状态

  private let hapticGenerator = UIImpactFeedbackGenerator(style: .light)
  private var contentDirty = true
  private var hasReceivedProps = false
  private var entryPlayed = false
  private var claimedIndex = 0
  private var heroLoadGeneration = 0
  private var lastImageUrl: String?

  // MARK: 按压状态（滚动协调）
  // .began 后进入确认窗口：屏幕位移未超阈值才显示缩放 + 震动；
  // 位移超阈值判定为滚动意图 → 撤销反馈且后续不触发 onPress。
  // 位移统一在【窗口坐标系】测量：滚动时 UIScrollView 内容跟手 1:1，
  // cell 局部坐标的位移会被内容移动抵消（慢速滚动近乎为零），
  // 窗口（屏幕）坐标位移不受内容跟手影响，快慢滚都能可靠判别。
  private var pressStartWindowPoint = CGPoint.zero
  private var pressConfirmed = false
  private var pressCancelled = false
  private var pressTimer: Timer?

  /// 位移判定阈值（pt，窗口坐标系）：手指从按下点移出该距离即视为滚动意图。
  /// 不宜过小——原地轻微抖动（< 阈值）仍应保留按压反馈与 onPress。
  private static let pressMovementThreshold: CGFloat = 10
  /// 按压反馈确认延迟（s）：窗口内位移未超阈值才进入按压态。
  /// 0.08s 兼顾两点：滚动通常在窗口内就已移出阈值（无反馈、无误触），
  /// 常规点按（≥ 0.08s）保留缩放 + 震动 + onPress。
  private static let pressConfirmDelay: TimeInterval = 0.08

  // 入场 stagger：递增计数器跨实例共享，保证首屏按 35ms 级联。
  private static let staggerStep: TimeInterval = 0.035
  private static let staggerCap = 8
  private static let counterLock = NSLock()
  private static var globalCounter = 0

  private let tiebaReferer = "https://tieba.baidu.com/"

  // MARK: - Init

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    heroImageView.contentMode = .scaleAspectFill
    heroImageView.clipsToBounds = true
    heroImageView.backgroundColor = .systemGray5
    heroImageView.isHidden = true
    addSubview(heroImageView)

    configureLabel(titleLabel, font: titleFont, lines: 2)
    configureLabel(summaryLabel, font: summaryFont, lines: 2)
    configureLabel(metaLabel, font: actionFont, lines: 1)
    configureLabel(replyCountLabel, font: actionFont, lines: 1)
    addSubview(titleLabel)
    addSubview(summaryLabel)
    addSubview(metaLabel)

    commentIconView.contentMode = .scaleAspectFit
    addSubview(commentIconView)
    addSubview(replyCountLabel)

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(contentSizeCategoryDidChange),
      name: UIContentSizeCategory.didChangeNotification,
      object: nil
    )

    setupPressGesture()

    // 无障碍：整卡作为单一 button role 元素，VoiceOver 可聚焦整卡并双击激活打开帖子。
    isAccessibilityElement = true
    accessibilityTraits = [.button]
  }

  deinit {
    pressTimer?.invalidate()
    NotificationCenter.default.removeObserver(self)
  }

  private func configureLabel(_ label: UILabel, font: UIFont, lines: Int) {
    label.font = font
    label.numberOfLines = lines
    label.lineBreakMode = .byTruncatingTail
  }

  // MARK: - 动态字号

  private static func scaledFont(_ size: CGFloat, _ weight: UIFont.Weight, textStyle: UIFont.TextStyle) -> UIFont {
    UIFontMetrics(forTextStyle: textStyle).scaledFont(for: UIFont.systemFont(ofSize: size, weight: weight))
  }

  /// 标题 17/600（SF，随系统动态字号）。
  private var titleFont: UIFont { Self.scaledFont(17, .semibold, textStyle: .headline) }
  /// 摘要 15/400。
  private var summaryFont: UIFont { Self.scaledFont(15, .regular, textStyle: .subheadline) }
  /// 操作栏 13/400。
  private var actionFont: UIFont { Self.scaledFont(13, .regular, textStyle: .footnote) }

  @objc private func contentSizeCategoryDidChange() {
    applyFonts()
    scheduleContentUpdate()
  }

  private func applyFonts() {
    titleLabel.font = titleFont
    summaryLabel.font = summaryFont
    metaLabel.font = actionFont
    replyCountLabel.font = actionFont
  }

  // MARK: - 内容 / 布局

  private func scheduleContentUpdate() {
    contentDirty = true
    setNeedsLayout()
    invalidateIntrinsicContentSize()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    if contentDirty {
      contentDirty = false
      applyContent()
    }
    applyFrames()
  }

  public override var intrinsicContentSize: CGSize {
    if contentDirty {
      contentDirty = false
      applyContent()
    }
    let width = bounds.width > 0 ? bounds.width : 320
    let contentWidth = width - Self.contentPadding * 2
    var height: CGFloat = 0
    if hasImageUrl {
      height += Self.heroImageHeight + Self.heroToContentGap
    }
    height += Self.contentPadding
    height += Self.labelHeight(titleLabel, width: contentWidth, maxLines: 2)
    height += Self.blockGap
    if let summary, !summary.isEmpty {
      height += Self.labelHeight(summaryLabel, width: contentWidth, maxLines: 2)
      height += Self.blockGap
    }
    height += Self.actionBarHeight
    height += Self.contentPadding
    return CGSize(width: width, height: height)
  }

  private var hasImageUrl: Bool {
    guard let imageUrl else { return false }
    return !imageUrl.isEmpty
  }

  private func applyContent() {
    let firstContent = !hasReceivedProps
    hasReceivedProps = true
    if firstContent {
      claimStaggerIndex()
    }
    maybePlayEntryAnimation()

    layer.cornerRadius = CGFloat(radius)
    layer.cornerCurve = .continuous
    clipsToBounds = true
    backgroundColor = cardBackground ?? UIColor.secondarySystemGroupedBackground

    titleLabel.text = title
    titleLabel.textColor = textPrimary

    summaryLabel.text = summary
    summaryLabel.textColor = textSecondary

    var metaParts: [String] = []
    if !author.isEmpty { metaParts.append(author) }
    if let forumName, !forumName.isEmpty { metaParts.append(forumName) }
    if !timeText.isEmpty { metaParts.append(timeText) }
    metaLabel.text = metaParts.joined(separator: " · ")
    metaLabel.textColor = textSecondary

    replyCountLabel.text = Self.formatReplyCount(replyCount)
    replyCountLabel.textColor = textSecondary

    commentIconView.image = UIImage(systemName: "bubble.right.fill")?.withRenderingMode(.alwaysTemplate)
    commentIconView.tintColor = accentColor ?? textSecondary

    let showHero = hasImageUrl
    heroImageView.isHidden = !showHero
    if !showHero {
      heroImageView.image = nil
    }

    updateAccessibilityLabel()
  }

  /// 无障碍朗读：标题 + 作者 + 回复数（VoiceOver 聚焦整卡时的 label）。
  private func updateAccessibilityLabel() {
    var parts: [String] = []
    if !title.isEmpty {
      parts.append(title)
    }
    if !author.isEmpty {
      parts.append("作者：\(author)")
    }
    parts.append("回复数：\(Self.formatReplyCount(replyCount))")
    accessibilityLabel = parts.joined(separator: "，")
  }

  private func applyFrames() {
    let width = bounds.width
    guard width > 0, bounds.height > 0 else { return }

    let contentWidth = width - Self.contentPadding * 2
    let showHero = !heroImageView.isHidden

    if showHero {
      heroImageView.frame = CGRect(x: 0, y: 0, width: width, height: Self.heroImageHeight)
    } else {
      heroImageView.frame = .zero
    }

    var y: CGFloat = showHero ? Self.heroImageHeight + Self.heroToContentGap : Self.contentPadding

    let titleHeight = Self.labelHeight(titleLabel, width: contentWidth, maxLines: 2)
    titleLabel.frame = CGRect(x: Self.contentPadding, y: y, width: contentWidth, height: titleHeight)
    y += titleHeight + Self.blockGap

    if let summary, !summary.isEmpty {
      let summaryHeight = Self.labelHeight(summaryLabel, width: contentWidth, maxLines: 2)
      summaryLabel.frame = CGRect(x: Self.contentPadding, y: y, width: contentWidth, height: summaryHeight)
      y += summaryHeight + Self.blockGap
    } else {
      summaryLabel.frame = .zero
    }

    let barY = bounds.height - Self.contentPadding - Self.actionBarHeight

    // 右侧：回复图标 + 数量（图标用 accentColor）
    let replyWidth = (replyCountLabel.text as NSString?)?.size(withAttributes: [.font: actionFont]).width ?? 0
    let iconSize: CGFloat = 13
    let iconGap: CGFloat = 3
    let replyBlockWidth = replyWidth + iconGap + iconSize
    let replyX = width - Self.contentPadding - replyBlockWidth
    commentIconView.frame = CGRect(
      x: replyX,
      y: barY + (Self.actionBarHeight - iconSize) / 2,
      width: iconSize,
      height: iconSize
    )
    replyCountLabel.frame = CGRect(x: replyX + iconSize + iconGap, y: barY, width: replyWidth, height: Self.actionBarHeight)

    // 左侧：作者/吧名/时间（剩余宽度，尾部截断）
    let metaWidth = replyX - Self.contentPadding - Self.blockGap
    if metaWidth > 0 {
      metaLabel.frame = CGRect(x: Self.contentPadding, y: barY, width: metaWidth, height: Self.actionBarHeight)
    } else {
      metaLabel.frame = .zero
    }
  }

  /// UILabel.sizeThatFits 会尊重 numberOfLines 与 lineBreakMode，
  /// 返回该宽度下最多 maxLines 行的实际高度。
  private static func labelHeight(_ label: UILabel, width: CGFloat, maxLines: Int) -> CGFloat {
    label.numberOfLines = maxLines
    return ceil(label.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude)).height)
  }

  private static func formatReplyCount(_ count: Int) -> String {
    if count >= 10000 {
      return String(format: "%.1f万", Double(count) / 10000.0)
    }
    return "\(count)"
  }

  // MARK: - Hero 图加载（TiebaImageIO）

  private func reloadHeroImage() {
    let newUrl = imageUrl
    guard newUrl != lastImageUrl else { return }
    lastImageUrl = newUrl
    heroLoadGeneration += 1
    let generation = heroLoadGeneration

    guard let newUrl, !newUrl.isEmpty else {
      heroImageView.image = nil
      scheduleContentUpdate()
      return
    }

    // 复用旧图会短暂显示上一帖的图，直接清掉占位，避免错图。
    heroImageView.image = nil
    scheduleContentUpdate()

    let width = bounds.width > 0 ? Double(bounds.width) : 375
    let height = Double(Self.heroImageHeight)
    Task { @MainActor [weak self] in
      guard let self else { return }
      do {
        let fileUrlString = try await TiebaImageIO.shared.makeThumbnail(
          sourceUri: newUrl,
          width: width,
          height: height,
          cacheKey: newUrl,
          referer: self.tiebaReferer,
          targetWidth: 750
        )
        guard generation == self.heroLoadGeneration else { return }
        let image = await Self.decodeImage(fromFileURL: fileUrlString)
        guard generation == self.heroLoadGeneration, let image else { return }
        self.heroImageView.image = image
        self.setNeedsLayout()
      } catch {
        // 静默失败：Hero 图保持占位底色，不阻塞滚动。
      }
    }
  }

  /// 缩略图已是 750px 小图，解码放到后台队列避免主线程掉帧。
  private static func decodeImage(fromFileURL fileUrlString: String) async -> UIImage? {
    await Task.detached(priority: .utility) { () -> UIImage? in
      guard let url = URL(string: fileUrlString) else { return nil }
      return UIImage(contentsOfFile: url.path)
    }.value
  }

  // MARK: - 按压（spring 缩放 + Light 震动）

  private func setupPressGesture() {
    let press = UILongPressGestureRecognizer(target: self, action: #selector(handlePress(_:)))
    press.minimumPressDuration = 0
    press.allowableMovement = 24
    press.cancelsTouchesInView = false
    addGestureRecognizer(press)
  }

  @objc private func handlePress(_ gesture: UILongPressGestureRecognizer) {
    switch gesture.state {
    case .began:
      // 触摸即起跟踪（窗口坐标系，滚动时 cell 局部坐标会因内容跟手而抵消）。
      pressStartWindowPoint = gesture.location(in: nil)
      pressConfirmed = false
      pressCancelled = false
      hapticGenerator.prepare()
      schedulePressConfirm()
    case .changed:
      // 屏幕位移超过阈值 → 判定为滚动意图，撤销按压反馈。
      guard !pressCancelled else { break }
      let windowPoint = gesture.location(in: nil)
      let dx = windowPoint.x - pressStartWindowPoint.x
      let dy = windowPoint.y - pressStartWindowPoint.y
      if dx * dx + dy * dy > Self.pressMovementThreshold * Self.pressMovementThreshold {
        cancelPressForScroll()
      }
    case .ended:
      pressTimer?.invalidate()
      pressTimer = nil
      if pressCancelled {
        // 已被位移判定为滚动：不触发 onPress。
        restoreScaleIfNeeded()
        resetPressState()
        return
      }
      let point = gesture.location(in: self)
      restoreScaleIfNeeded()
      if bounds.contains(point) {
        firePress()
      }
      resetPressState()
    case .cancelled, .failed:
      pressTimer?.invalidate()
      pressTimer = nil
      restoreScaleIfNeeded()
      resetPressState()
    default:
      break
    }
  }

  /// 确认窗口：窗口内位移未超阈值才进入按压态（缩放 + 震动）。
  /// 用 .common run loop mode，保证拖拽 tracking 期间仍能按时触发。
  private func schedulePressConfirm() {
    pressTimer?.invalidate()
    let timer = Timer(timeInterval: Self.pressConfirmDelay, repeats: false) { [weak self] _ in
      self?.confirmPress()
    }
    RunLoop.main.add(timer, forMode: .common)
    pressTimer = timer
  }

  private func confirmPress() {
    pressTimer = nil
    guard !pressCancelled else { return }
    pressConfirmed = true
    hapticGenerator.impactOccurred()
    // 减少动态效果（无障碍）：保留震动与 onPress，跳过按压缩放（同旧 FeedCard onPressIn）。
    guard !UIAccessibility.isReduceMotionEnabled else { return }
    animateScale(0.97, duration: 0.14, damping: 0.55, velocity: 1.0)
  }

  /// 位移超阈值：撤销按压视觉、不再震动、后续 .ended 不触发 onPress。
  private func cancelPressForScroll() {
    pressCancelled = true
    pressTimer?.invalidate()
    pressTimer = nil
    restoreScaleIfNeeded()
  }

  private func restoreScaleIfNeeded() {
    guard pressConfirmed else { return }
    pressConfirmed = false
    // reduceMotion：从未进入按压缩放，无需复位动画。
    guard !UIAccessibility.isReduceMotionEnabled else { return }
    animateScale(1.0, duration: 0.22, damping: 0.55, velocity: 2.0)
  }

  private func resetPressState() {
    pressConfirmed = false
    pressCancelled = false
    pressTimer?.invalidate()
    pressTimer = nil
  }

  /// 阻尼感参考 PRESS_ENTER（damping 18 / stiffness 320 ≈ dampingRatio 0.55，轻回弹）。
  private func animateScale(_ scale: CGFloat, duration: TimeInterval, damping: CGFloat, velocity: CGFloat) {
    UIView.animate(
      withDuration: duration,
      delay: 0,
      usingSpringWithDamping: damping,
      initialSpringVelocity: velocity,
      options: [.allowUserInteraction, .beginFromCurrentState, .curveEaseOut],
      animations: { [weak self] in
        self?.transform = CGAffineTransform(scaleX: scale, y: scale)
      },
      completion: nil
    )
  }

  // MARK: - 无障碍（VoiceOver）

  /// 与手势 .ended 共用 onPress 触发路径：无障碍激活也走这里，无状态依赖。
  private func firePress() {
    onPress()
  }

  /// VoiceOver 双击激活 → 打开帖子（等同手势点按的 onPress 路径）。
  public override func accessibilityActivate() -> Bool {
    firePress()
    return true
  }

  // MARK: - 入场动画（防重复）

  /// 仅首次收到 props 时分配 stagger 序号：优先用 enterIndex，否则取内部递增计数器。
  private func claimStaggerIndex() {
    guard claimedIndex == 0 else { return }
    if enterIndex >= 0 {
      claimedIndex = enterIndex
    } else {
      Self.counterLock.lock()
      Self.globalCounter += 1
      claimedIndex = Self.globalCounter
      Self.counterLock.unlock()
    }
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      maybePlayEntryAnimation()
    }
  }

  /// 入场：fade + 8pt 上移 + 35ms stagger。
  /// entryPlayed 一旦置位永不复位——滚动复用时 props 重发只走 applyContent，
  /// 不会重放入场动画（性能红线）。
  private func maybePlayEntryAnimation() {
    guard !entryPlayed, hasReceivedProps, window != nil else { return }
    entryPlayed = true

    let index = claimedIndex > 0 ? claimedIndex : enterIndex
    let capped = min(max(index, 0), Self.staggerCap)
    let delay = Double(capped) * Self.staggerStep

    // 减少动态效果（无障碍）：保留淡入，去掉位移动画。
    let reduceMotion = UIAccessibility.isReduceMotionEnabled
    alpha = 0
    transform = CGAffineTransform(translationX: 0, y: reduceMotion ? 0 : 8)

    UIView.animate(
      withDuration: 0.22,
      delay: delay,
      options: [.curveEaseOut, .allowUserInteraction],
      animations: { [weak self] in
        self?.alpha = 1
        self?.transform = .identity
      },
      completion: nil
    )
  }
}
