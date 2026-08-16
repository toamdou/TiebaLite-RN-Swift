import ExpoModulesCore
import UIKit

public final class TiebaRichTextView: ExpoView, UITextViewDelegate {
  private let textView = UITextView()
  private let emoticonCache = NSCache<NSString, UIImage>()
  /// 最近一次构建的富文本。表情图异步下载完成后重新赋值触发 TextKit
  /// 全量重排（attachment.image 变更 + setNeedsDisplay 不足以刷新布局缓存，
  /// 灰色占位会残留）。
  private var currentAttributed: NSAttributedString?
  /// props 逐个到达时合并为一次重建（参考 TiebaFeedCellView 的 dirty 模式）：
  /// runs/fontSize/lineHeight/textColor/linkColor 每次 didSet 都全量重建
  /// NSAttributedString，一次渲染最多触发 6~7 次。
  private var contentDirty = false

  var contentWidth: CGFloat = 0 {
    didSet { scheduleRebuild() }
  }

  var fontSize: CGFloat = 15 {
    didSet { scheduleRebuild() }
  }

  var lineHeight: CGFloat = 22 {
    didSet { scheduleRebuild() }
  }

  var textColor: UIColor = .label {
    didSet { scheduleRebuild() }
  }

  var linkColor: UIColor = .systemBlue {
    didSet { scheduleRebuild() }
  }

  var runs: [[String: Any]] = [] {
    didSet { scheduleRebuild() }
  }

  let onLinkPress = EventDispatcher()
  let onUserPress = EventDispatcher()
  let onTopicPress = EventDispatcher()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    textView.isEditable = false
    textView.isScrollEnabled = false
    textView.isSelectable = true
    textView.backgroundColor = .clear
    textView.textContainerInset = .zero
    textView.textContainer.lineFragmentPadding = 0
    textView.textContainer.widthTracksTextView = true
    textView.delegate = self
    textView.translatesAutoresizingMaskIntoConstraints = false
    addSubview(textView)
    NSLayoutConstraint.activate([
      textView.leadingAnchor.constraint(equalTo: leadingAnchor),
      textView.trailingAnchor.constraint(equalTo: trailingAnchor),
      textView.topAnchor.constraint(equalTo: topAnchor),
      textView.bottomAnchor.constraint(equalTo: bottomAnchor)
    ])
  }

  public override var intrinsicContentSize: CGSize {
    let width = contentWidth > 0 ? contentWidth : bounds.width
    return textView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    textView.frame = bounds
    if contentDirty {
      contentDirty = false
      rebuild()
    } else {
      invalidateIntrinsicContentSize()
    }
  }

  /// 合并重建请求：一批 props 变更只做一次 attributed 构建。
  private func scheduleRebuild() {
    contentDirty = true
    setNeedsLayout()
    invalidateIntrinsicContentSize()
  }

  public func textView(
    _ textView: UITextView,
    shouldInteractWith url: URL,
    in characterRange: NSRange,
    interaction: UITextItemInteraction
  ) -> Bool {
    handle(url)
    return false
  }

  private func handle(_ url: URL) {
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
    let queryItem = { (name: String) -> String in
      components.queryItems?.first(where: { $0.name == name })?.value ?? ""
    }
    switch components.host {
    case "link":
      onLinkPress(["url": queryItem("url")])
    case "user":
      onUserPress(["uid": queryItem("uid")])
    case "topic":
      onTopicPress(["topicId": queryItem("id"), "topicName": queryItem("name")])
    default:
      // 真实外链（host 为实际域名）：原实现 break 导致帖子内链接全部不可点，
      // 交回 JS 统一处理（utils/linkOpener 决定站内跳转或开 WebView）。
      onLinkPress(["url": url.absoluteString])
    }
  }

  private func rebuild() {
    let attributed = NSMutableAttributedString()
    let baseFont = UIFont.systemFont(ofSize: fontSize)
    let paragraph = NSMutableParagraphStyle()
    paragraph.minimumLineHeight = lineHeight
    paragraph.maximumLineHeight = lineHeight
    let base: [NSAttributedString.Key: Any] = [
      .font: baseFont,
      .foregroundColor: textColor,
      .paragraphStyle: paragraph
    ]

    for run in runs {
      let kind = run["kind"] as? String ?? "text"
      let weight = fontWeight(from: run["fontWeight"] as? String)
      let attrs = attributes(base: base, weight: weight)
      switch kind {
      case "linebreak":
        attributed.append(NSAttributedString(string: "\n", attributes: attrs))
      case "emoji":
        attributed.append(NSAttributedString(string: run["text"] as? String ?? "", attributes: attrs))
      case "emoticon":
        appendEmoticon(
          attributed,
          text: run["text"] as? String ?? "",
          src: run["src"] as? String ?? "",
          base: base
        )
      case "link":
        let text = run["text"] as? String ?? ""
        let urlString = run["url"] as? String ?? ""
        appendLink(attributed, text: text, urlString: urlString, attributes: attrs)
      case "at":
        let text = run["text"] as? String ?? ""
        let uid = run["uid"] as? String ?? ""
        appendLink(attributed, text: "@\(text)", urlString: "tieba-native://user?uid=\(uid)", attributes: attrs)
      case "topic":
        let text = run["text"] as? String ?? ""
        let topicId = run["topicId"] as? String ?? ""
        let encoded = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        appendLink(attributed, text: "#\(text)#", urlString: "tieba-native://topic?id=\(topicId)&name=\(encoded)", attributes: attrs)
      default:
        attributed.append(NSAttributedString(string: run["text"] as? String ?? "", attributes: attrs))
      }
    }

    textView.attributedText = attributed
    currentAttributed = attributed
    invalidateIntrinsicContentSize()
  }

  /// Map the optional `fontWeight` run key (e.g. "500" / "bold") to a
  /// UIFont.Weight. Missing or unknown values fall back to .regular so
  /// existing callers (contentToRichTextRuns, subposts) render unchanged.
  private func fontWeight(from value: String?) -> UIFont.Weight {
    switch value {
    case "300": return .light
    case "400": return .regular
    case "500": return .medium
    case "600": return .semibold
    case "700", "bold": return .bold
    case "800": return .heavy
    default: return .regular
    }
  }

  /// The base attribute set with the given font weight swapped in, keeping
  /// point size, color and paragraph style intact.
  private func attributes(
    base: [NSAttributedString.Key: Any],
    weight: UIFont.Weight
  ) -> [NSAttributedString.Key: Any] {
    var attrs = base
    let currentFont = (base[.font] as? UIFont) ?? UIFont.systemFont(ofSize: fontSize)
    attrs[.font] = UIFont.systemFont(ofSize: currentFont.pointSize, weight: weight)
    return attrs
  }

  private func appendLink(
    _ attributed: NSMutableAttributedString,
    text: String,
    urlString: String,
    attributes: [NSAttributedString.Key: Any]
  ) {
    var attrs = attributes
    attrs[.foregroundColor] = linkColor
    attrs[.underlineStyle] = NSUnderlineStyle.single.rawValue
    if let url = makeLinkURL(from: urlString) {
      attrs[.link] = url
    }
    attributed.append(NSAttributedString(string: text, attributes: attrs))
  }

  /// URL(string:) rejects raw non-ASCII characters (e.g. Chinese text in a
  /// post's external link), so those runs never got a `.link` attribute and
  /// taps did nothing. Percent-encode the string as a fallback so the run
  /// becomes tappable; the host-dispatch logic in `handle` is unchanged.
  private func makeLinkURL(from urlString: String) -> URL? {
    if let url = URL(string: urlString) {
      return url
    }
    guard
      let encoded = urlString.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)
    else {
      return nil
    }
    return URL(string: encoded)
  }

  private func appendEmoticon(
    _ attributed: NSMutableAttributedString,
    text: String,
    src: String,
    base: [NSAttributedString.Key: Any]
  ) {
    let attachment = NSTextAttachment()
    attachment.bounds = CGRect(x: 0, y: -3, width: emoticonSize, height: emoticonSize)
    if let cached = emoticonCache.object(forKey: src as NSString) {
      attachment.image = cached
    } else {
      attachment.image = placeholderImage()
      loadEmoticon(src, attachment: attachment)
    }
    attributed.append(NSAttributedString(attachment: attachment))
    attributed.append(NSAttributedString(string: " ", attributes: base))
    _ = text
  }

  private var emoticonSize: CGFloat {
    min(fontSize + 3, max(16, lineHeight - 4))
  }

  private func placeholderImage() -> UIImage {
    let size = CGSize(width: emoticonSize, height: emoticonSize)
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { context in
      UIColor.systemGray5.setFill()
      context.fill(CGRect(origin: .zero, size: size))
    }
  }

  private func loadEmoticon(_ src: String, attachment: NSTextAttachment) {
    guard let url = URL(string: src) else { return }
    var request = URLRequest(url: url)
    request.setValue("https://tieba.baidu.com/", forHTTPHeaderField: "Referer")
    URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
      guard
        let self,
        let data,
        let image = UIImage(data: data)
      else {
        return
      }
      DispatchQueue.main.async {
        self.emoticonCache.setObject(image, forKey: src as NSString)
        attachment.image = image
        // 重新赋值 attributedText 强制 TextKit 全量重排：
        // attachment.image 变更 + setNeedsDisplay 不会使布局缓存失效，
        // 灰色占位将永远残留（表情"不显示"的根因）。
        if let attributed = self.currentAttributed {
          self.textView.attributedText = attributed
        } else {
          self.textView.setNeedsDisplay()
        }
      }
    }.resume()
  }
}
