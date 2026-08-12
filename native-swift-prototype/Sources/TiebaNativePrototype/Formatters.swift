import CoreGraphics
import Foundation
import UIKit

public func relativeTime(_ timestamp: TimeInterval) -> String {
    guard timestamp > 0 else { return "" }

    let formatter = RelativeDateTimeFormatter()
    formatter.locale = Locale(identifier: "zh_CN")
    formatter.unitsStyle = .short
    return formatter.localizedString(
        for: Date(timeIntervalSince1970: timestamp),
        relativeTo: Date()
    )
}

public func formatCount(_ count: Int) -> String {
    if count >= 100_000_000 {
        return String(format: "%.1f亿", Double(count) / 100_000_000)
    }
    if count >= 10_000 {
        return String(format: "%.1f万", Double(count) / 10_000)
    }
    return "\(count)"
}

public func hsvComponents(
    for color: UIColor
) -> (hue: CGFloat, saturation: CGFloat, brightness: CGFloat, alpha: CGFloat)? {
    var hue: CGFloat = 0
    var saturation: CGFloat = 0
    var brightness: CGFloat = 0
    var alpha: CGFloat = 0

    guard color.getHue(&hue, saturation: &saturation, brightness: &brightness, alpha: &alpha) else {
        return nil
    }
    return (hue, saturation, brightness, alpha)
}

public func greifyColor(_ color: UIColor, desaturation: CGFloat = 0.2) -> UIColor {
    guard let hsv = hsvComponents(for: color) else { return color }

    let saturation = max(0, hsv.saturation - desaturation)
    let brightness = max(0, hsv.brightness - desaturation / 3)
    return UIColor(
        hue: hsv.hue,
        saturation: saturation,
        brightness: brightness,
        alpha: hsv.alpha
    )
}

public func greifyHexColor(_ hex: UInt32, desaturation: CGFloat = 0.2) -> UIColor {
    let red = CGFloat((hex >> 16) & 0xFF) / 255
    let green = CGFloat((hex >> 8) & 0xFF) / 255
    let blue = CGFloat(hex & 0xFF) / 255
    return greifyColor(
        UIColor(red: red, green: green, blue: blue, alpha: 1),
        desaturation: desaturation
    )
}

public func validURL(_ string: String) -> URL? {
    let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let components = URLComponents(string: trimmed),
          let scheme = components.scheme?.lowercased(),
          scheme == "http" || scheme == "https",
          let host = components.host,
          !host.isEmpty,
          let url = components.url else {
        return nil
    }
    return url
}

public final class Debouncer: @unchecked Sendable {
    private let delay: TimeInterval
    private let queue: DispatchQueue
    private var workItem: DispatchWorkItem?

    public init(delay: TimeInterval = 0.4, queue: DispatchQueue = .main) {
        self.delay = delay
        self.queue = queue
    }

    public func schedule(_ action: @escaping () -> Void) {
        workItem?.cancel()

        let item = DispatchWorkItem { [weak self] in
            action()
            self?.workItem = nil
        }
        workItem = item
        queue.asyncAfter(deadline: .now() + delay, execute: item)
    }

    public func cancel() {
        workItem?.cancel()
        workItem = nil
    }
}

public func makeDebouncer(delay: TimeInterval = 0.4) -> Debouncer {
    Debouncer(delay: delay)
}

public func debounce<T>(
    delay: TimeInterval = 0.4,
    action: @escaping (T) -> Void
) -> (T) -> Void {
    let debouncer = Debouncer(delay: delay)
    return { value in
        debouncer.schedule {
            action(value)
        }
    }
}
