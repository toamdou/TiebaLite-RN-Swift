import SwiftUI

/// Snapshot of system accessibility settings used by prototype glass/toast components.
public struct AccessibilityEnvironment: Equatable, Sendable {
    public var reduceMotion: Bool
    public var reduceTransparency: Bool

    public init(reduceMotion: Bool = false, reduceTransparency: Bool = false) {
        self.reduceMotion = reduceMotion
        self.reduceTransparency = reduceTransparency
    }
}

private struct AccessibilityEnvironmentKey: EnvironmentKey {
    static let defaultValue = AccessibilityEnvironment()
}

public extension EnvironmentValues {
    var accessibilityEnvironment: AccessibilityEnvironment {
        get { self[AccessibilityEnvironmentKey.self] }
        set { self[AccessibilityEnvironmentKey.self] = newValue }
    }
}

public struct ReduceMotionEnvironment: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    public init() {}

    public func body(content: Content) -> some View {
        content.environment(
            \.accessibilityEnvironment,
            AccessibilityEnvironment(
                reduceMotion: reduceMotion,
                reduceTransparency: reduceTransparency
            )
        )
    }
}

public extension View {
    /// Injects the system reduce-motion/reduce-transparency settings into
    /// the prototype's accessibility environment.
    func reduceMotionEnvironment() -> some View {
        modifier(ReduceMotionEnvironment())
    }
}
