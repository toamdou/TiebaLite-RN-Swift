import SwiftUI
import UIKit

/// A UIVisualEffectView blurred surface masked by a configurable linear gradient.
/// Falls back to a plain gradient when Reduce Transparency is enabled.
public struct GradientBlurView: View {
    public var colors: [Color]
    public var startPoint: UnitPoint
    public var endPoint: UnitPoint
    public var blurStyle: UIBlurEffect.Style

    @Environment(\.accessibilityEnvironment) private var accessibility
    @Environment(\.accessibilityReduceTransparency) private var systemReduceTransparency

    public init(
        colors: [Color],
        startPoint: UnitPoint = .top,
        endPoint: UnitPoint = .bottom,
        blurStyle: UIBlurEffect.Style = .systemMaterial
    ) {
        self.colors = colors
        self.startPoint = startPoint
        self.endPoint = endPoint
        self.blurStyle = blurStyle
    }

    public var body: some View {
        if reduceTransparency {
            LinearGradient(colors: colors, startPoint: startPoint, endPoint: endPoint)
        } else {
            VisualEffectView(
                blurStyle: blurStyle,
                colors: colors,
                startPoint: startPoint,
                endPoint: endPoint
            )
        }
    }

    private var reduceTransparency: Bool {
        accessibility.reduceTransparency || systemReduceTransparency
    }
}

private final class MaskedBlurContainer: UIVisualEffectView {
    var blurStyle: UIBlurEffect.Style = .systemMaterial {
        didSet {
            effect = UIBlurEffect(style: blurStyle)
            updateMask()
        }
    }

    var gradientColors: [UIColor] = [] {
        didSet { updateMask() }
    }

    var gradientStartPoint = CGPoint(x: 0.5, y: 0) {
        didSet { updateMask() }
    }

    var gradientEndPoint = CGPoint(x: 0.5, y: 1) {
        didSet { updateMask() }
    }

    override init(effect: UIVisualEffect?) {
        super.init(effect: effect)
        self.effect = UIBlurEffect(style: blurStyle)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        updateMask()
    }

    private func updateMask() {
        let gradient = CAGradientLayer()
        gradient.colors = gradientColors.map(\.cgColor)
        gradient.startPoint = gradientStartPoint
        gradient.endPoint = gradientEndPoint
        gradient.frame = bounds
        layer.mask = gradient
    }
}

private struct VisualEffectView: UIViewRepresentable {
    let blurStyle: UIBlurEffect.Style
    let colors: [Color]
    let startPoint: UnitPoint
    let endPoint: UnitPoint

    func makeUIView(context: Context) -> MaskedBlurContainer {
        let view = MaskedBlurContainer(effect: UIBlurEffect(style: blurStyle))
        apply(to: view)
        return view
    }

    func updateUIView(_ uiView: MaskedBlurContainer, context: Context) {
        apply(to: uiView)
    }

    private func apply(to view: MaskedBlurContainer) {
        view.blurStyle = blurStyle
        view.gradientColors = colors.map { UIColor($0) }
        view.gradientStartPoint = CGPoint(x: startPoint.x, y: startPoint.y)
        view.gradientEndPoint = CGPoint(x: endPoint.x, y: endPoint.y)
        view.setNeedsLayout()
    }
}

#Preview("Gradient Blur") {
    ZStack {
        Color.red
        Color.blue
        GradientBlurView(
            colors: [.clear, .black.opacity(0.85)],
            startPoint: .top,
            endPoint: .bottom
        )
    }
    .frame(height: 180)
}
