import Combine
import Foundation

/// Swift 原型的本地主题偏好封装。
///
/// RN 项目的 ThemeContext 仍是 RN 应用的主题事实来源；此 store 仅服务于
/// Swift 原型设置页，并复用 RN 侧已有的 UserDefaults key。
@MainActor
public final class ThemeStore: ObservableObject {
    private enum StorageKey {
        static let themeName = "themeName"
        static let darkMode = "darkMode"
        static let customPrimaryColor = "customPrimaryColor"
        static let translucentAlpha = "translucentAlpha"
    }

    @Published public var themeName: ThemeName {
        didSet {
            defaults.set(themeName.rawValue, forKey: StorageKey.themeName)
        }
    }

    @Published public var isDark: Bool {
        didSet {
            defaults.set(isDark, forKey: StorageKey.darkMode)
        }
    }

    @Published public var customPrimaryColor: String {
        didSet {
            defaults.set(customPrimaryColor, forKey: StorageKey.customPrimaryColor)
        }
    }

    @Published public var translucentAlpha: Double {
        didSet {
            defaults.set(translucentAlpha, forKey: StorageKey.translucentAlpha)
        }
    }

    public static let shared = ThemeStore()

    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let storedTheme = defaults.string(forKey: StorageKey.themeName)
        self.themeName = ThemeName(rawValue: storedTheme ?? "") ?? .tieba
        self.isDark = defaults.object(forKey: StorageKey.darkMode) as? Bool ?? false
        self.customPrimaryColor = defaults.string(
            forKey: StorageKey.customPrimaryColor
        ) ?? "#2563EB"
        self.translucentAlpha = defaults.object(
            forKey: StorageKey.translucentAlpha
        ) as? Double ?? 0.72
    }

    public func setTheme(_ theme: ThemeName) {
        themeName = theme
    }

    public func setDarkMode(_ isDark: Bool) {
        self.isDark = isDark
    }

    public func setCustomPrimaryColor(_ hex: String) {
        let trimmed = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        customPrimaryColor = trimmed.hasPrefix("#") ? trimmed : "#" + trimmed
    }

    public func setTranslucentAlpha(_ alpha: Double) {
        translucentAlpha = min(max(alpha, 0), 1)
    }
}
