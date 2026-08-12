import Foundation
import SwiftUI
import UIKit

public struct ToastMessage: Identifiable, Equatable, Sendable {
    public let id: UUID
    public var title: String
    public var message: String?
    public var systemImage: String

    public init(
        id: UUID = UUID(),
        title: String,
        message: String? = nil,
        systemImage: String = "checkmark.circle.fill"
    ) {
        self.id = id
        self.title = title
        self.message = message
        self.systemImage = systemImage
    }
}

public struct ToastView: View {
    public let title: String
    public let message: String?
    public let systemImage: String

    @Environment(\.accessibilityEnvironment) private var accessibility
    @Environment(\.accessibilityReduceTransparency) private var systemReduceTransparency

    public init(
        title: String,
        message: String? = nil,
        systemImage: String = "checkmark.circle.fill"
    ) {
        self.title = title
        self.message = message
        self.systemImage = systemImage
    }

    public var body: some View {
        HStack(alignment: .center, spacing: 12) {
            if !systemImage.isEmpty {
                Image(systemName: systemImage)
                    .font(.body.weight(.semibold))
                    .frame(width: 28, height: 28)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)

                if let message, !message.isEmpty {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background {
            if reduceTransparency {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Color(.systemBackground))
            } else {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(.ultraThinMaterial)
            }
        }
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Color.primary.opacity(0.1), lineWidth: 0.5)
        }
        .shadow(color: .black.opacity(0.12), radius: 16, y: 6)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isStaticText)
    }

    private var reduceTransparency: Bool {
        accessibility.reduceTransparency || systemReduceTransparency
    }
}

public struct ToastOverlay: View {
    public let toast: ToastMessage?
    public let duration: Duration
    public let onDismiss: () -> Void

    @Environment(\.accessibilityEnvironment) private var accessibility
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @State private var dismissTask: Task<Void, Never>?

    public init(
        toast: ToastMessage?,
        duration: Duration = .seconds(2.5),
        onDismiss: @escaping () -> Void = {}
    ) {
        self.toast = toast
        self.duration = duration
        self.onDismiss = onDismiss
    }

    public var body: some View {
        VStack {
            Spacer()

            if let toast {
                ToastView(
                    title: toast.title,
                    message: toast.message,
                    systemImage: toast.systemImage
                )
                .padding(.horizontal, 24)
                .padding(.bottom, 28)
                .transition(transition)
                .id(toast.id)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .allowsHitTesting(false)
        .onChange(of: toast) { _, newValue in
            scheduleDismiss(for: newValue)
        }
        .onDisappear {
            dismissTask?.cancel()
            dismissTask = nil
        }
    }

    private var transition: AnyTransition {
        if reduceMotion {
            return .opacity
        }
        return .move(edge: .bottom).combined(with: .opacity)
    }

    private var reduceMotion: Bool {
        accessibility.reduceMotion || systemReduceMotion
    }

    private func scheduleDismiss(for toast: ToastMessage?) {
        dismissTask?.cancel()
        dismissTask = nil

        guard toast != nil else { return }

        dismissTask = Task { @MainActor in
            do {
                try await Task.sleep(for: duration)
            } catch {
                return
            }
            guard !Task.isCancelled else { return }
            onDismiss()
        }
    }
}

public extension View {
    func toastOverlay(
        toast: ToastMessage?,
        duration: Duration = .seconds(2.5),
        onDismiss: @escaping () -> Void = {}
    ) -> some View {
        overlay {
            ToastOverlay(toast: toast, duration: duration, onDismiss: onDismiss)
        }
    }
}

#Preview("Toast") {
    ZStack {
        Color(.systemGroupedBackground)
        ToastView(title: "已复制", message: "链接已复制到剪贴板")
    }
}
