import SwiftUI
import UIKit

public struct GlassCardView<Content: View>: View {
    private let content: Content
    private let material: Material
    private let cornerRadius: CGFloat
    private let padding: CGFloat
    private let strokeColor: Color

    @Environment(\.accessibilityEnvironment) private var accessibility
    @Environment(\.accessibilityReduceTransparency) private var systemReduceTransparency

    public init(
        material: Material = .regularMaterial,
        cornerRadius: CGFloat = 8,
        padding: CGFloat = 16,
        strokeColor: Color = Color.primary.opacity(0.08),
        @ViewBuilder content: () -> Content
    ) {
        self.material = material
        self.cornerRadius = cornerRadius
        self.padding = padding
        self.strokeColor = strokeColor
        self.content = content()
    }

    public var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                if reduceTransparency {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(Color(.systemBackground))
                } else {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(material)
                }
            }
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(strokeColor, lineWidth: 0.5)
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }

    private var reduceTransparency: Bool {
        accessibility.reduceTransparency || systemReduceTransparency
    }
}

public struct GlassNavigationBar<Content: View>: View {
    private let content: Content
    private let material: Material
    private let cornerRadius: CGFloat

    @Environment(\.accessibilityEnvironment) private var accessibility
    @Environment(\.accessibilityReduceTransparency) private var systemReduceTransparency

    public init(
        material: Material = .ultraThinMaterial,
        cornerRadius: CGFloat = 18,
        @ViewBuilder content: () -> Content
    ) {
        self.material = material
        self.cornerRadius = cornerRadius
        self.content = content()
    }

    public var body: some View {
        content
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                if reduceTransparency {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(Color(.systemBackground))
                } else {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(material)
                }
            }
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Color.primary.opacity(0.08), lineWidth: 0.5)
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }

    private var reduceTransparency: Bool {
        accessibility.reduceTransparency || systemReduceTransparency
    }
}

public extension View {
    func glassCard(
        material: Material = .regularMaterial,
        cornerRadius: CGFloat = 8,
        padding: CGFloat = 16
    ) -> some View {
        GlassCardView(
            material: material,
            cornerRadius: cornerRadius,
            padding: padding
        ) {
            self
        }
    }

    func glassNavigationBar(
        material: Material = .ultraThinMaterial,
        cornerRadius: CGFloat = 18
    ) -> some View {
        GlassNavigationBar(
            material: material,
            cornerRadius: cornerRadius
        ) {
            self
        }
    }
}

#Preview("Glass Components") {
    VStack(spacing: 16) {
        GlassCardView {
            Label("Glass Card", systemImage: "square.3.layers.3d")
        }

        GlassNavigationBar {
            HStack {
                Image(systemName: "chevron.left")
                Text("Glass Navigation")
                    .font(.headline)
                Spacer()
                Image(systemName: "ellipsis")
            }
        }
    }
    .padding()
    .background(Color(.systemGroupedBackground))
}
