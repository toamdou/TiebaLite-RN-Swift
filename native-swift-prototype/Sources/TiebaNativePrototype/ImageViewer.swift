import Foundation
import SwiftUI
import UIKit
import Photos

// MARK: - Full-screen image viewer

public struct ImageViewerView: View {
    public let images: [MediaItem]
    public let initialIndex: Int
    public let onClose: () -> Void
    public let watermarkSubtitle: String?

    @State private var currentIndex: Int
    @State private var controlsVisible = true
    @State private var dismissTranslation: CGSize = .zero
    @State private var sharePayload: SharePayload?
    @State private var viewerAlert: ViewerAlert?

    public init(
        images: [MediaItem],
        initialIndex: Int,
        onClose: @escaping () -> Void
    ) {
        self.init(
            images: images,
            initialIndex: initialIndex,
            watermarkSubtitle: nil,
            onClose: onClose
        )
    }

    public init(
        images: [MediaItem],
        initialIndex: Int,
        watermarkSubtitle: String?,
        onClose: @escaping () -> Void
    ) {
        self.images = images
        let clampedIndex = min(max(initialIndex, 0), max(images.count - 1, 0))
        self.initialIndex = clampedIndex
        self.onClose = onClose
        self.watermarkSubtitle = watermarkSubtitle
        _currentIndex = State(initialValue: clampedIndex)
    }

    public var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if images.isEmpty {
                emptyState
            } else {
                pager
            }

            if controlsVisible {
                VStack(spacing: 0) {
                    topBar
                    Spacer()
                    if images.count > 1 {
                        thumbnailBar
                    }
                }
                .transition(.opacity)
            }
        }
        .offset(y: dismissTranslation.height)
        .opacity(dismissOpacity)
        .sheet(item: $sharePayload) { payload in
            ActivityViewController(activityItems: payload.activityItems)
        }
        .alert(item: $viewerAlert) { alert in
            Alert(
                title: Text(alert.title),
                message: Text(alert.message),
                dismissButton: .default(Text("OK"))
            )
        }
    }

    // MARK: Paging

    private var pager: some View {
        TabView(selection: $currentIndex) {
            ForEach(images.indices, id: \.self) { index in
                ZoomableImagePage(
                    item: images[index],
                    shouldLoad: abs(index - currentIndex) <= 1,
                    watermarkSubtitle: watermarkSubtitle,
                    onSingleTap: {
                        withAnimation(.easeOut(duration: 0.18)) {
                            controlsVisible.toggle()
                        }
                    },
                    onDismissDragChanged: { translation in
                        dismissTranslation = translation
                    },
                    onDismissDragEnded: { translation, predicted in
                        handleDismissDragEnded(
                            translation: translation,
                            predictedEndTranslation: predicted
                        )
                    }
                )
                .tag(index)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .onChange(of: currentIndex) { _, _ in
            UISelectionFeedbackGenerator().selectionChanged()
            dismissTranslation = .zero
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "photo.on.rectangle.angled")
                .font(.system(size: 44, weight: .regular))
            Text("No images")
                .font(.headline)
        }
        .foregroundStyle(.white.opacity(0.7))
    }

    // MARK: Bars

    private var topBar: some View {
        HStack {
            ViewerBarButton(systemName: "xmark", accessibilityLabel: "Close image viewer") {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                onClose()
            }

            Spacer()

            Text("\(currentIndex + 1)/\(images.count)")
                .font(.subheadline.monospacedDigit().weight(.semibold))
                .foregroundStyle(.white)

            Spacer()

            ViewerBarButton(systemName: "square.and.arrow.down", accessibilityLabel: "Save image") {
                saveCurrentImage()
            }
            ViewerBarButton(systemName: "square.and.arrow.up", accessibilityLabel: "Share image") {
                shareCurrentImage()
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
    }

    private var thumbnailBar: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(images.indices, id: \.self) { index in
                        Button {
                            withAnimation(.easeOut(duration: 0.18)) {
                                currentIndex = index
                            }
                        } label: {
                            MediaThumbnailView(
                                item: images[index],
                                shouldLoad: abs(index - currentIndex) <= 3,
                                isSelected: index == currentIndex
                            )
                        }
                        .buttonStyle(.plain)
                        .id(index)
                        .accessibilityLabel("Thumbnail \(index + 1)")
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
            }
            .onChange(of: currentIndex) { _, newIndex in
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(newIndex, anchor: .center)
                }
            }
        }
        .background(.ultraThinMaterial)
    }

    // MARK: Drag to dismiss

    private var dismissOpacity: Double {
        1 - min(abs(dismissTranslation.height) / 600, 0.6)
    }

    private func handleDismissDragEnded(
        translation: CGSize,
        predictedEndTranslation: CGSize
    ) {
        if translation.height > 140 || predictedEndTranslation.height > 900 {
            withAnimation(.easeOut(duration: 0.22)) {
                dismissTranslation = CGSize(width: 0, height: 1000)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                onClose()
            }
        } else {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                dismissTranslation = .zero
            }
        }
    }

    // MARK: Save and share

    private var currentItem: MediaItem? {
        guard images.indices.contains(currentIndex) else { return nil }
        return images[currentIndex]
    }

    private func saveCurrentImage() {
        guard let item = currentItem else { return }

        prepareLocalFile(for: item) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let fileURL):
                    saveImageToPhotoLibrary(at: fileURL)
                case .failure(let error):
                    presentAlert(
                        title: "Download failed",
                        message: error.localizedDescription
                    )
                }
            }
        }
    }

    private func shareCurrentImage() {
        guard let item = currentItem else { return }

        prepareLocalFile(for: item) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let fileURL):
                    sharePayload = SharePayload(activityItems: [fileURL])
                case .failure(let error):
                    if let url = mediaDisplayURL(item) {
                        // Fallback to sharing the remote URL if the temp-file downloader fails.
                        sharePayload = SharePayload(activityItems: [url])
                    } else {
                        presentAlert(
                            title: "Cannot share",
                            message: error.localizedDescription
                        )
                    }
                }
            }
        }
    }

    /// Resolves a media item to a local file through the shared MediaDownloader.
    private func prepareLocalFile(
        for item: MediaItem,
        completion: @escaping (Result<URL, Error>) -> Void
    ) {
        guard let url = mediaDisplayURL(item) else {
            completion(.failure(TransferError.invalidURL))
            return
        }

        Task {
            do {
                let fileURL = try await MediaDownloader.shared.downloadMedia(
                    from: url,
                    referer: "https://tieba.baidu.com"
                )
                completion(.success(fileURL))
            } catch {
                completion(.failure(error))
            }
        }
    }

    private func saveImageToPhotoLibrary(at fileURL: URL) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            DispatchQueue.main.async {
                switch status {
                case .authorized, .limited:
                    PHPhotoLibrary.shared().performChanges {
                        _ = PHAssetChangeRequest.creationRequestForAssetFromImage(atFileURL: fileURL)
                    } completionHandler: { success, error in
                        DispatchQueue.main.async {
                            if success {
                                UINotificationFeedbackGenerator().notificationOccurred(.success)
                                presentAlert(
                                    title: "Saved",
                                    message: "The image was saved to Photos."
                                )
                            } else {
                                presentAlert(
                                    title: "Save failed",
                                    message: error?.localizedDescription ?? "Unknown error."
                                )
                            }
                        }
                    }
                default:
                    presentAlert(
                        title: "Photo permission needed",
                        message: "Enable photo library access in Settings to save images."
                    )
                }
            }
        }
    }

    private func presentAlert(title: String, message: String) {
        viewerAlert = ViewerAlert(title: title, message: message)
    }
}

// MARK: - Zoomable page

private struct ZoomableImagePage: View {
    private let item: MediaItem
    private let shouldLoad: Bool
    private let watermarkSubtitle: String?
    private let onSingleTap: () -> Void
    private let onDismissDragChanged: (CGSize) -> Void
    private let onDismissDragEnded: (CGSize, CGSize) -> Void

    @State private var zoomScale: CGFloat = 1
    @State private var savedScale: CGFloat = 1
    @State private var panOffset: CGSize = .zero
    @State private var isMagnifying = false

    init(
        item: MediaItem,
        shouldLoad: Bool,
        watermarkSubtitle: String?,
        onSingleTap: @escaping () -> Void,
        onDismissDragChanged: @escaping (CGSize) -> Void,
        onDismissDragEnded: @escaping (CGSize, CGSize) -> Void
    ) {
        self.item = item
        self.shouldLoad = shouldLoad
        self.watermarkSubtitle = watermarkSubtitle
        self.onSingleTap = onSingleTap
        self.onDismissDragChanged = onDismissDragChanged
        self.onDismissDragEnded = onDismissDragEnded
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if shouldLoad {
                AsyncImage(url: mediaDisplayURL(item)) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFit()
                    case .empty:
                        ProgressView()
                            .tint(.white)
                    case .failure:
                        Image(systemName: "photo")
                            .font(.system(size: 44, weight: .regular))
                            .foregroundStyle(.white.opacity(0.55))
                    @unknown default:
                        EmptyView()
                    }
                }
                .scaleEffect(zoomScale)
                .offset(panOffset)
            } else {
                Color.clear
            }

            if zoomScale <= 1.02 {
                WatermarkView(subtitle: watermarkSubtitle)
                    .transition(.opacity)
                    .allowsHitTesting(false)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .gesture(imageGesture)
        .onTapGesture(count: 2) {
            toggleZoom()
        }
        .onTapGesture(count: 1) {
            onSingleTap()
        }
    }

    private var imageGesture: some Gesture {
        MagnificationGesture()
            .simultaneously(with: DragGesture(minimumDistance: 12))
            .onChanged { value in
                if let magnification = value.first {
                    isMagnifying = true
                    let proposedScale = savedScale * magnification
                    zoomScale = min(max(proposedScale, 1), 5)
                }

                if let drag = value.second, !isMagnifying {
                    if zoomScale > 1.01 {
                        panOffset = drag.translation
                    } else {
                        onDismissDragChanged(drag.translation)
                    }
                }
            }
            .onEnded { value in
                if value.first != nil {
                    savedScale = zoomScale
                    isMagnifying = false
                    return
                }

                if let drag = value.second, !isMagnifying {
                    if zoomScale > 1.01 {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                            panOffset = .zero
                        }
                    } else {
                        onDismissDragEnded(drag.translation, drag.predictedEndTranslation)
                    }
                }
            }
    }

    private func toggleZoom() {
        withAnimation(.spring(response: 0.32, dampingFraction: 0.8)) {
            if zoomScale > 1.01 {
                zoomScale = 1
                savedScale = 1
            } else {
                zoomScale = 3
                savedScale = 3
            }
            panOffset = .zero
        }
    }
}

// MARK: - Watermark

private struct WatermarkView: View {
    let subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("TiebaLite")
                .font(.caption2.weight(.semibold))
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.caption2)
                    .lineLimit(1)
            }
        }
        .foregroundStyle(.white.opacity(0.7))
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(.black.opacity(0.3), in: RoundedRectangle(cornerRadius: 6))
        .padding(12)
    }
}

// MARK: - Thumbnail

private struct MediaThumbnailView: View {
    let item: MediaItem
    let shouldLoad: Bool
    let isSelected: Bool

    var body: some View {
        ZStack {
            Color(white: 0.18)

            if shouldLoad {
                AsyncImage(url: mediaDisplayURL(item)) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .empty:
                        ProgressView()
                            .tint(.white)
                    case .failure:
                        Image(systemName: item.type == "video" ? "play.rectangle" : "photo")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(.white.opacity(0.55))
                    @unknown default:
                        EmptyView()
                    }
                }
            } else {
                Color.clear
            }
        }
        .frame(width: 56, height: 56)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .stroke(
                    isSelected ? Color.white : Color.white.opacity(0.22),
                    lineWidth: isSelected ? 2 : 1
                )
        )
        .contentShape(Rectangle())
    }
}

// MARK: - System UI bridges

private struct ViewerBarButton: View {
    private let systemName: String
    private let accessibilityLabel: String
    private let action: () -> Void

    init(systemName: String, accessibilityLabel: String, action: @escaping () -> Void) {
        self.systemName = systemName
        self.accessibilityLabel = accessibilityLabel
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
    }
}

private struct ActivityViewController: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(
            activityItems: activityItems,
            applicationActivities: nil
        )
        configurePopover(controller)
        return controller
    }

    func updateUIViewController(
        _ uiViewController: UIActivityViewController,
        context: Context
    ) {}

    private func configurePopover(_ controller: UIActivityViewController) {
        guard let popover = controller.popoverPresentationController else { return }
        let scene = UIApplication.shared.connectedScenes.first(where: {
            $0.activationState == .foregroundActive
        }) as? UIWindowScene
        guard let window = scene?.windows.first(where: { $0.isKeyWindow }) else { return }
        popover.sourceView = window
        popover.sourceRect = CGRect(x: window.bounds.midX, y: window.bounds.maxY, width: 0, height: 0)
        popover.permittedArrowDirections = []
    }
}

// MARK: - Helpers

private func mediaDisplayURL(_ item: MediaItem) -> URL? {
    let urlString: String
    if item.type == "image" {
        urlString = item.originSrc.isEmpty ? item.src : item.originSrc
    } else if let poster = item.poster, !poster.isEmpty {
        urlString = poster
    } else {
        urlString = item.src
    }
    guard !urlString.isEmpty else { return nil }
    return URL(string: urlString)
}

private enum TransferError: LocalizedError {
    case invalidURL

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "The media item has no valid URL."
        }
    }
}

private struct SharePayload: Identifiable {
    let id = UUID()
    let activityItems: [Any]
}

private struct ViewerAlert: Identifiable {
    let id = UUID()
    let title: String
    let message: String
}

// MARK: - Preview

#Preview("ImageViewer") {
    ImageViewerView(
        images: [
            MediaItem(src: "https://example.com/1.jpg", width: 1200, height: 800),
            MediaItem(src: "https://example.com/2.jpg", width: 900, height: 1200),
            MediaItem(
                src: "https://example.com/3.mp4",
                poster: "https://example.com/3-poster.jpg",
                type: "video",
                width: 1280,
                height: 720
            )
        ],
        initialIndex: 1,
        onClose: {}
    )
    .environment(\.appTheme, .darkPalette)
    .preferredColorScheme(.dark)
}
