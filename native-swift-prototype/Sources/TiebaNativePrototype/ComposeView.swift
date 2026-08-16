import Foundation
import PhotosUI
import SwiftUI
import UIKit

// MARK: - Compose mode

public enum ComposeMode: String, CaseIterable, Sendable {
    case thread
    case reply

    public var navigationTitle: String {
        switch self {
        case .thread:
            return "发帖"
        case .reply:
            return "回复"
        }
    }

    public var submitTitle: String {
        switch self {
        case .thread:
            return "发布帖子"
        case .reply:
            return "发布回复"
        }
    }
}

public struct ComposeReplyContext: Sendable {
    public let authorName: String
    public let content: String

    public init(authorName: String, content: String = "") {
        self.authorName = authorName
        self.content = content
    }
}

// MARK: - Compose view

public struct ComposeView: View {
    public static let titleLimit = 60
    public static let contentLimit = 5000

    private enum Field: Hashable {
        case title
        case content
    }

    public let mode: ComposeMode
    public let initialTitle: String
    public let initialContent: String
    public let replyTo: ComposeReplyContext?
    public let supportsOriginalImage: Bool
    public let supportsImageAttachment: Bool
    public let onSubmit: (String, String) async -> Void
    public let onClose: () -> Void

    @Environment(\.appTheme) private var theme
    @Environment(\.scenePhase) private var scenePhase
    @State private var title: String
    @State private var content: String
    @State private var isSubmitting = false
    @State private var isOriginal = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var attachedImageData: Data?
    @State private var lastClipboardChangeCount = UIPasteboard.general.changeCount
    @State private var clipboardLinkAlert: TiebaClipboardLink?
    @FocusState private var focusedField: Field?

    public init(
        mode: ComposeMode = .thread,
        initialTitle: String = "",
        initialContent: String = "",
        replyTo: ComposeReplyContext? = nil,
        supportsOriginalImage: Bool = false,
        supportsImageAttachment: Bool = false,
        onSubmit: @escaping (String, String) async -> Void = { _, _ in },
        onClose: @escaping () -> Void = {}
    ) {
        self.mode = mode
        self.initialTitle = initialTitle
        self.initialContent = initialContent
        self.replyTo = replyTo
        self.supportsOriginalImage = supportsOriginalImage
        self.supportsImageAttachment = supportsImageAttachment
        self.onSubmit = onSubmit
        self.onClose = onClose
        _title = State(
            initialValue: Self.clamped(
                Self.restoredInitial(initialTitle, mode: mode, field: .title),
                to: Self.titleLimit
            )
        )
        _content = State(
            initialValue: Self.clamped(
                Self.restoredInitial(initialContent, mode: mode, field: .content),
                to: Self.contentLimit
            )
        )
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if mode == .thread {
                            titleField
                        }

                        if mode == .reply, let replyTo {
                            replyPrefixBlock(replyTo)
                        }

                        if supportsImageAttachment {
                            imageAttachmentField
                        }

                        if supportsOriginalImage {
                            originalImageToggle
                        }

                        contentField
                    }
                    .padding(16)
                }
                .scrollDismissesKeyboard(.interactively)

                submitBar
            }
            .background(theme.background)
            .navigationTitle(mode.navigationTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel("关闭")
                }
            }
            .onAppear {
                focusedField = mode == .thread ? .title : .content
            }
            .onChange(of: title) { _, _ in
                persistDraft()
            }
            .onChange(of: content) { _, _ in
                persistDraft()
            }
            .onChange(of: scenePhase) { _, newPhase in
                guard newPhase == .active else { return }
                checkClipboardLink()
            }
            .alert(item: $clipboardLinkAlert) { link in
                Alert(
                    title: Text(
                        link.kind == .thread ? "检测到帖子链接" : "检测到贴吧链接"
                    ),
                    message: Text(link.url.absoluteString),
                    dismissButton: .default(Text("知道了"))
                )
            }
        }
    }

    private func replyPrefixBlock(_ replyTo: ComposeReplyContext) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Label("回复 @\(replyTo.authorName)", systemImage: "arrow.turn.up.left")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(theme.primary)
                .lineLimit(1)

            if !replyTo.content.isEmpty {
                Text("\"\(replyTo.content)\"")
                    .font(.footnote)
                    .foregroundStyle(theme.textTertiary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.surfaceSecondary, in: RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(theme.border, lineWidth: 0.5)
        }
    }

    private var imageAttachmentField: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                    Label(
                        attachedImageData == nil ? "选择图片" : "更换图片",
                        systemImage: "photo.on.rectangle.angled"
                    )
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(theme.textOnPrimary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(theme.primary, in: Capsule())
                }

                if attachedImageData != nil {
                    Button(role: .destructive) {
                        attachedImageData = nil
                        selectedPhotoItem = nil
                    } label: {
                        Label("移除", systemImage: "trash")
                            .font(.footnote)
                            .foregroundStyle(theme.error)
                    }
                    .buttonStyle(.plain)
                }

                Spacer(minLength: 0)
            }

            if let attachedImageData, let image = UIImage(data: attachedImageData) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 88, height: 88)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
        .padding(12)
        .background(theme.card, in: RoundedRectangle(cornerRadius: 8))
        .onChange(of: selectedPhotoItem?.itemIdentifier) { _, _ in
            guard let newItem = selectedPhotoItem else {
                attachedImageData = nil
                return
            }
            Task {
                if let data = try? await newItem.loadTransferable(type: Data.self) {
                    attachedImageData = data
                }
            }
        }
    }

    private var originalImageToggle: some View {
        Toggle(isOn: $isOriginal) {
            VStack(alignment: .leading, spacing: 2) {
                Text("原图")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(theme.text)
                Text("上传原图，不压缩")
                    .font(.caption)
                    .foregroundStyle(theme.textSecondary)
            }
        }
        .tint(theme.primary)
        .padding(12)
        .background(theme.card, in: RoundedRectangle(cornerRadius: 8))
    }

    private func checkClipboardLink() {
        let pasteboard = UIPasteboard.general
        guard pasteboard.changeCount != lastClipboardChangeCount else { return }
        lastClipboardChangeCount = pasteboard.changeCount
        guard let text = pasteboard.string else { return }
        guard let link = TiebaClipboardDetector.link(in: text) else { return }
        clipboardLinkAlert = link
    }

    private func persistDraft() {
        let defaults = UserDefaults.standard
        if title.isEmpty && content.isEmpty {
            defaults.removeObject(forKey: Self.draftKey(mode: mode, field: .title))
            defaults.removeObject(forKey: Self.draftKey(mode: mode, field: .content))
        } else {
            defaults.set(title, forKey: Self.draftKey(mode: mode, field: .title))
            defaults.set(content, forKey: Self.draftKey(mode: mode, field: .content))
        }
    }

    private var titleField: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("标题", text: $title)
                .font(.system(size: 17, weight: .semibold))
                .textInputAutocapitalization(.never)
                .focused($focusedField, equals: .title)
                .onSubmit {
                    focusedField = .content
                }

            HStack(spacing: 6) {
                Text("\(title.utf16.count)/\(Self.titleLimit)")
                    .font(.caption)
                    .foregroundStyle(titleIsOverLimit ? theme.error : theme.textTertiary)
                Spacer()
            }
        }
        .padding(12)
        .background(theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .onChange(of: title) { _, newValue in
            if newValue.utf16.count > Self.titleLimit {
                title = Self.clamped(newValue, to: Self.titleLimit)
            }
        }
    }

    private var contentField: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField(
                mode == .thread ? "输入帖子内容" : "输入回复内容",
                text: $content,
                axis: .vertical
            )
            .lineLimit(8)
            .font(.system(size: 16))
            .focused($focusedField, equals: .content)

            HStack(spacing: 6) {
                Text("\(content.utf16.count)/\(Self.contentLimit)")
                    .font(.caption)
                    .foregroundStyle(contentIsOverLimit ? theme.error : theme.textTertiary)
                Spacer()
            }
        }
        .padding(12)
        .background(theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .onChange(of: content) { _, newValue in
            if newValue.utf16.count > Self.contentLimit {
                content = Self.clamped(newValue, to: Self.contentLimit)
            }
        }
    }

    private var submitBar: some View {
        VStack(spacing: 0) {
            Divider()

            Button(action: submit) {
                Group {
                    if isSubmitting {
                        ProgressView()
                            .tint(theme.textOnPrimary)
                    } else {
                        Text(mode.submitTitle)
                            .font(.system(size: 16, weight: .semibold))
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 48)
            }
            .buttonStyle(.plain)
            .background(canSubmit ? theme.primary : theme.surfaceTertiary)
            .foregroundStyle(canSubmit ? theme.textOnPrimary : theme.textTertiary)
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .disabled(!canSubmit)
            .accessibilityLabel(mode.submitTitle)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(theme.card)
    }

    private var trimmedTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedContent: String {
        content.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var titleIsOverLimit: Bool {
        title.utf16.count > Self.titleLimit
    }

    private var contentIsOverLimit: Bool {
        content.utf16.count > Self.contentLimit
    }

    private var canSubmit: Bool {
        !isSubmitting
            && !titleIsOverLimit
            && !contentIsOverLimit
            && !trimmedContent.isEmpty
            && (mode == .reply || !trimmedTitle.isEmpty)
    }

    private func submit() {
        guard canSubmit else { return }
        isSubmitting = true
        Task {
            await onSubmit(trimmedTitle, trimmedContent)
            isSubmitting = false
            UserDefaults.standard.removeObject(forKey: Self.draftKey(mode: mode, field: .title))
            UserDefaults.standard.removeObject(forKey: Self.draftKey(mode: mode, field: .content))
        }
    }

    private static func restoredInitial(
        _ value: String,
        mode: ComposeMode,
        field: Field
    ) -> String {
        guard value.isEmpty else { return value }
        return UserDefaults.standard.string(
            forKey: draftKey(mode: mode, field: field)
        ) ?? ""
    }

    private static func draftKey(mode: ComposeMode, field: Field) -> String {
        let fieldName = field == .title ? "title" : "content"
        return "compose.draft.\(mode.rawValue).\(fieldName)"
    }

    private static func clamped(_ string: String, to limit: Int) -> String {
        var result = ""
        for character in string {
            let candidate = result + String(character)
            if candidate.utf16.count > limit {
                break
            }
            result = candidate
        }
        return result
    }
}

// MARK: - Copy view

public struct CopyView: View {
    public let text: String
    public let onCopyAll: () -> Void
    public let onClose: () -> Void

    @Environment(\.appTheme) private var theme
    @State private var showCopiedAlert = false

    public init(
        text: String,
        onCopyAll: @escaping () -> Void = {},
        onClose: @escaping () -> Void = {}
    ) {
        self.text = text
        self.onCopyAll = onCopyAll
        self.onClose = onClose
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                tipBar

                ScrollView {
                    Text(text)
                        .font(.system(size: 16))
                        .lineSpacing(6)
                        .foregroundStyle(theme.text)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 8)
                }

                actionBar
            }
            .background(theme.background)
            .navigationTitle("复制")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: onClose) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(theme.textTertiary)
                    }
                    .accessibilityLabel("关闭")
                }
            }
            .alert("已复制", isPresented: $showCopiedAlert) {
                Button("好", role: .cancel) {}
            } message: {
                Text("全部内容已复制到剪贴板")
            }
        }
    }

    private var tipBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "hand.point.up.left")
                .font(.system(size: 14))
                .foregroundStyle(theme.textSecondary)

            Text("长按文字可自由选择复制，或点击下方按钮复制全部")
                .font(.system(size: 13))
                .foregroundStyle(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(theme.surfaceSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }

    private var actionBar: some View {
        VStack(spacing: 0) {
            Divider()

            VStack(spacing: 10) {
                Button(action: copyAll) {
                    Label("复制全部", systemImage: "doc.on.doc")
                        .font(.system(size: 16, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                }
                .buttonStyle(.plain)
                .background(theme.primary)
                .foregroundStyle(theme.textOnPrimary)
                .clipShape(RoundedRectangle(cornerRadius: 12))

                Button(action: onClose) {
                    Text("关闭")
                        .font(.system(size: 16, weight: .medium))
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                }
                .buttonStyle(.plain)
                .background(theme.surfaceSecondary)
                .foregroundStyle(theme.text)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .padding(16)
        }
        .background(theme.card)
    }

    private func copyAll() {
        UIPasteboard.general.string = text
        onCopyAll()
        showCopiedAlert = true
    }
}

// MARK: - Previews

#Preview("发帖") {
    ComposeView(
        mode: .thread,
        supportsOriginalImage: true,
        supportsImageAttachment: true,
        onSubmit: { title, content in
            print("提交：\(title) - \(content)")
        },
        onClose: {
            print("关闭发帖")
        }
    )
    .environment(\.appTheme, AppPalette.lightPalette)
}

#Preview("回复") {
    ComposeView(
        mode: .reply,
        initialContent: "前排支持",
        replyTo: ComposeReplyContext(
            authorName: "果粉小明",
            content: "iOS 26 毛玻璃效果太强了"
        ),
        onSubmit: { _, content in
            print("提交回复：\(content)")
        },
        onClose: {
            print("关闭回复")
        }
    )
    .environment(\.appTheme, AppPalette.lightPalette)
}

#Preview("复制") {
    CopyView(
        text: "iOS 26 毛玻璃效果太强了\n\n新的 Liquid Glass 在贴吧里滚动非常流畅，帧率稳定。\n\n长按文字可以自由选择复制。",
        onCopyAll: {
            print("复制全部")
        },
        onClose: {
            print("关闭复制页")
        }
    )
    .environment(\.appTheme, AppPalette.lightPalette)
}
