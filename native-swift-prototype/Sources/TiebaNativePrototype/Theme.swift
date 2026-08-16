import CoreGraphics
import SwiftUI

public enum ThemeName: String, Hashable, Sendable {
    case tieba
    case blue
    case black
    case pink
    case red
    case purple
    case dark
    case blueDark = "blue_dark"
    case greyDark = "grey_dark"
    case amoledDark = "amoled_dark"
    case translucent
    case custom
}

public struct AppPalette: Hashable, Sendable {
    public var primary: Color
    public var accent: Color
    public var primaryLight: Color
    public var background: Color
    public var windowBackground: Color
    public var surface: Color
    public var surfaceSecondary: Color
    public var surfaceTertiary: Color
    public var card: Color
    public var floorCard: Color
    public var cardElevated: Color
    public var text: Color
    public var textSecondary: Color
    public var textTertiary: Color
    public var textDisabled: Color
    public var textOnPrimary: Color
    public var textLink: Color
    public var chip: Color
    public var onChip: Color
    public var chipSelected: Color
    public var divider: Color
    public var separator: Color
    public var border: Color
    public var success: Color
    public var warning: Color
    public var error: Color
    public var info: Color
    public var indicator: Color
    public var isDark: Bool

    public init(
        primary: Color = Color(hex: 0x2563EB),
        accent: Color = Color(hex: 0x2563EB),
        primaryLight: Color = Color(hex: 0x2563EB).opacity(0.1),
        background: Color = Color(hex: 0xF2F2F7),
        windowBackground: Color = .white,
        surface: Color = .white,
        surfaceSecondary: Color = Color(hex: 0xF2F2F7),
        surfaceTertiary: Color = Color(hex: 0xE5E5EA),
        card: Color = .white,
        floorCard: Color = .white,
        cardElevated: Color = .white,
        text: Color = .black,
        textSecondary: Color = Color(hex: 0x3C3C43).opacity(0.6),
        textTertiary: Color = Color(hex: 0x3C3C43).opacity(0.3),
        textDisabled: Color = Color(hex: 0x3C3C43).opacity(0.2),
        textOnPrimary: Color = .white,
        textLink: Color = Color(hex: 0x2563EB),
        chip: Color = Color(hex: 0x2563EB).opacity(0.1),
        onChip: Color = Color(hex: 0x2563EB),
        chipSelected: Color = Color(hex: 0x2563EB),
        divider: Color = Color(hex: 0x3C3C43).opacity(0.12),
        separator: Color = Color(hex: 0x3C3C43).opacity(0.12),
        border: Color = Color(hex: 0x3C3C43).opacity(0.12),
        success: Color = Color(hex: 0x34C759),
        warning: Color = Color(hex: 0xFF9500),
        error: Color = Color(hex: 0xFF3B30),
        info: Color = Color(hex: 0x2563EB),
        indicator: Color = Color(hex: 0x2563EB),
        isDark: Bool = false
    ) {
        self.primary = primary
        self.accent = accent
        self.primaryLight = primaryLight
        self.background = background
        self.windowBackground = windowBackground
        self.surface = surface
        self.surfaceSecondary = surfaceSecondary
        self.surfaceTertiary = surfaceTertiary
        self.card = card
        self.floorCard = floorCard
        self.cardElevated = cardElevated
        self.text = text
        self.textSecondary = textSecondary
        self.textTertiary = textTertiary
        self.textDisabled = textDisabled
        self.textOnPrimary = textOnPrimary
        self.textLink = textLink
        self.chip = chip
        self.onChip = onChip
        self.chipSelected = chipSelected
        self.divider = divider
        self.separator = separator
        self.border = border
        self.success = success
        self.warning = warning
        self.error = error
        self.info = info
        self.indicator = indicator
        self.isDark = isDark
    }
}

public extension AppPalette {
    static func palette(for themeName: ThemeName, isDark: Bool, customPrimary: String? = nil) -> AppPalette {
        let base = isDark ? darkPalette : lightPalette
        let primary: Color
        switch themeName {
        case .tieba:
            primary = isDark ? Color(hex: 0x60A5FA) : Color(hex: 0x2563EB)
        case .blue:
            primary = isDark ? Color(hex: 0x64A5FF) : Color(hex: 0x007AFF)
        case .black:
            primary = isDark ? Color(hex: 0x9AA3B2) : Color(hex: 0x3A3A3C)
        case .pink:
            primary = isDark ? Color(hex: 0xFF8FB5) : Color(hex: 0xFF2D55)
        case .red:
            primary = isDark ? Color(hex: 0xFF6B62) : Color(hex: 0xC51100)
        case .purple:
            primary = isDark ? Color(hex: 0xB39DDB) : Color(hex: 0x512DA8)
        case .dark:
            primary = Color(hex: 0x60A5FA)
        case .blueDark:
            primary = Color(hex: 0x64A5FF)
        case .greyDark:
            primary = Color(hex: 0x9AA3B2)
        case .amoledDark:
            primary = Color(hex: 0x5B9BFF)
        case .translucent:
            primary = isDark ? Color(hex: 0x60A5FA) : Color(hex: 0x2563EB)
        case .custom:
            primary = customPrimary.flatMap { Color(hexString: $0) } ?? (isDark ? Color(hex: 0x60A5FA) : Color(hex: 0x2563EB))
        }
        return base.withPrimary(primary)
    }

    func withPrimary(_ primary: Color) -> AppPalette {
        var copy = self
        copy.primary = primary
        copy.primaryLight = primary.opacity(0.1)
        copy.accent = primary
        copy.textLink = primary
        copy.onChip = primary
        copy.chipSelected = primary
        copy.indicator = primary
        return copy
    }

    static let lightPalette = AppPalette()
    static let darkPalette = AppPalette(
        primary: Color(hex: 0x60A5FA),
        primaryLight: Color(hex: 0x60A5FA).opacity(0.14),
        background: .black,
        windowBackground: .black,
        surface: Color(hex: 0x1C1C1E),
        surfaceSecondary: Color(hex: 0x1C1C1E),
        surfaceTertiary: Color(hex: 0x2C2C2E),
        card: Color(hex: 0x1C1C1E),
        floorCard: Color(hex: 0x1C1C1E),
        cardElevated: Color(hex: 0x2C2C2E),
        text: .white,
        textSecondary: Color(hex: 0xEBEBF5).opacity(0.6),
        textTertiary: Color(hex: 0xEBEBF5).opacity(0.3),
        textDisabled: Color(hex: 0xEBEBF5).opacity(0.2),
        textOnPrimary: .white,
        textLink: Color(hex: 0x60A5FA),
        chip: Color(hex: 0x60A5FA).opacity(0.14),
        onChip: Color(hex: 0x60A5FA),
        chipSelected: Color(hex: 0x60A5FA),
        divider: Color(hex: 0x545458).opacity(0.65),
        separator: Color(hex: 0x545458).opacity(0.65),
        border: Color(hex: 0x545458).opacity(0.65),
        success: Color(hex: 0x30D158),
        warning: Color(hex: 0xFF9F0A),
        error: Color(hex: 0xFF453A),
        info: Color(hex: 0x60A5FA),
        indicator: Color(hex: 0x60A5FA),
        isDark: true
    )
}

private struct ThemeKey: EnvironmentKey {
    static let defaultValue: AppPalette = .lightPalette
}

public extension EnvironmentValues {
    var appTheme: AppPalette {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}

public extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }

    init?(hexString: String) {
        var value = hexString.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("#") { value.removeFirst() }
        guard value.count == 6, let hex = UInt32(value, radix: 16) else { return nil }
        self.init(hex: hex)
    }
}

// MARK: - Shared helpers and constants

public enum AppMetrics {
    public static let cornerRadiusSmall: CGFloat = 8
    public static let cornerRadiusMedium: CGFloat = 12
    public static let cornerRadiusLarge: CGFloat = 18
    public static let minimumTouchTarget: CGFloat = 44
}

public extension Color {
    static let brandBlue = Color(hex: 0x2563EB)
    static let successGreen = Color(hex: 0x34C759)
    static let warningOrange = Color(hex: 0xFF9500)
    static let errorRed = Color(hex: 0xFF3B30)
}
