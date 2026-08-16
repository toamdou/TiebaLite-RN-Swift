import AVFoundation
import AVKit
import Foundation
import SwiftUI
import UIKit

// MARK: - PostContentView

public struct PostContentView: View {
    public let segments: [PostSegment]
    public let maxImageCount: Int
    public let voteIsMulti: Bool
    public let voteIsClosed: Bool
    public let voteDeadline: TimeInterval

    private let onImagePress: ([MediaItem], Int) -> Void
    private let onLinkPress: (URL) -> Void
    private let onUserPress: (String) -> Void
    private let onTopicPress: (String, String) -> Void
    private let onVote: (Int) -> Void
    private let onVoteMulti: ([Int]) -> Void

    @Environment(\.appTheme) private var theme

    public init(
        segments: [PostSegment],
        maxImageCount: Int = 9,
        onImagePress: @escaping ([MediaItem], Int) -> Void = { _, _ in },
        onLinkPress: @escaping (URL) -> Void = { _ in },
        onUserPress: @escaping (String) -> Void = { _ in },
        onTopicPress: @escaping (String, String) -> Void = { _, _ in },
        onVote: @escaping (Int) -> Void = { _ in },
        onVoteMulti: @escaping ([Int]) -> Void = { _ in },
        voteIsMulti: Bool = false,
        voteIsClosed: Bool = false,
        voteDeadline: TimeInterval = 0
    ) {
        self.segments = segments
        self.maxImageCount = max(1, maxImageCount)
        self.voteIsMulti = voteIsMulti
        self.voteIsClosed = voteIsClosed
        self.voteDeadline = voteDeadline
        self.onImagePress = onImagePress
        self.onLinkPress = onLinkPress
        self.onUserPress = onUserPress
        self.onTopicPress = onTopicPress
        self.onVote = onVote
        self.onVoteMulti = onVoteMulti
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !inlineSegments.isEmpty {
                PostContentBuilder.makeInlineText(segments: inlineSegments, theme: theme)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
                    .environment(\.openURL, OpenURLAction { url in
                        handleOpenURL(url)
                        return .handled
                    })
            }

            if !blockSegments.isEmpty {
                ForEach(blockSegments.indices, id: \.self) { index in
                    blockView(for: blockSegments[index])
                }
            }

            if !imageItems.isEmpty {
                MediaGrid(
                    images: imageItems,
                    maxCount: maxImageCount,
                    onPress: onImagePress
                )
            }

            if inlineSegments.isEmpty && blockSegments.isEmpty && imageItems.isEmpty {
                Text("[内容已删除]")
                    .font(.footnote)
                    .foregroundStyle(theme.textTertiary)
            }
        }
    }

    private var inlineSegments: [PostSegment] {
        PostContentBuilder.inlineSegments(from: segments)
    }

    private var blockSegments: [PostSegment] {
        PostContentBuilder.blockSegments(from: segments)
    }

    private var imageItems: [MediaItem] {
        PostContentBuilder.imageItems(from: segments)
    }

    @ViewBuilder
    private func blockView(for segment: PostSegment) -> some View {
        switch segment {
        case .video(let media):
            VideoSegmentView(media: media)
        case .audio(let url, let duration):
            AudioSegmentView(url: url, duration: duration)
        case .poll(let options):
            PollSegmentView(
                options: options,
                onVote: onVote,
                onVoteMulti: onVoteMulti,
                isMulti: voteIsMulti,
                isClosed: voteIsClosed,
                deadline: voteDeadline
            )
        default:
            EmptyView()
        }
    }

    private func handleOpenURL(_ url: URL) {
        guard url.scheme == "tblite" else {
            onLinkPress(url)
            return
        }

        switch url.host {
        case "user":
            onUserPress(url.lastPathComponent)
        case "topic":
            let id = url.lastPathComponent
            let name = queryValue("name", in: url)
            onTopicPress(id, name)
        default:
            onLinkPress(url)
        }
    }

    private func queryValue(_ key: String, in url: URL) -> String {
        URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first(where: { $0.name == key })?
            .value ?? ""
    }
}

// MARK: - PostContentBuilder

public struct PostContentBuilder {
    public static let emoticonBaseURL = "https://tb1.bdstatic.com/tb/editor/images/client/image_emoticon"

    public static let emoticonNameMap: [String: Int] = [
        "呵呵": 1, "哈哈": 2, "吐舌": 3, "啊": 4, "酷": 5, "怒": 6,
        "开心": 7, "汗": 8, "泪": 9, "黑线": 10, "鄙视": 11, "不高兴": 12,
        "真棒": 13, "钱": 14, "疑问": 15, "阴险": 16, "吐": 17, "咦": 18,
        "委屈": 19, "花心": 20, "呼~": 21, "笑眼": 22, "笑脸": 22, "冷": 23,
        "太开心": 24, "滑稽": 25, "勉强": 26, "狂汗": 27, "乖": 28,
        "睡觉": 29, "惊哭": 30, "生气": 31, "惊讶": 32, "喷": 33,
        "爱心": 34, "心碎": 35, "玫瑰": 36, "礼物": 37, "彩虹": 38,
        "星星月亮": 39, "太阳": 40, "钱币": 41, "灯泡": 42, "茶杯": 43,
        "蛋糕": 44, "音乐": 45, "haha": 46, "胜利": 47, "大拇指": 48,
        "弱": 49, "OK": 50,
    ]

    public static let bodyFontSize: CGFloat = 15

    public static func inlineSegments(from segments: [PostSegment]) -> [PostSegment] {
        segments.filter { isInline($0) }
    }

    public static func blockSegments(from segments: [PostSegment]) -> [PostSegment] {
        segments.filter { isBlock($0) }
    }

    public static func imageItems(from segments: [PostSegment]) -> [MediaItem] {
        segments.compactMap { segment in
            if case .image(let media) = segment {
                return media
            }
            return nil
        }
    }

    public static func emoticonURL(name: String, src: String) -> URL? {
        if !src.isEmpty, let url = URL(string: src) {
            return url
        }
        if let number = emoticonNameMap[name] {
            return URL(string: "\(emoticonBaseURL)\(number).png")
        }
        return nil
    }

    public static func cacheEmoticonImage(_ image: UIImage, for name: String) {
        EmoticonImageCache.shared.setImage(image, for: name)
    }

    public static func makeAttributedString(
        segments: [PostSegment],
        theme: AppPalette
    ) -> AttributedString {
        var result = AttributedString()
        for segment in segments {
            result.append(attributedString(for: segment, theme: theme))
        }
        return result
    }

    public static func attributedString(
        for segment: PostSegment,
        theme: AppPalette
    ) -> AttributedString {
        var base = AttributeContainer()
        base.font = .system(size: bodyFontSize)
        base.foregroundColor = theme.text

        switch segment {
        case .text(let text):
            var value = AttributedString(text)
            value.mergeAttributes(base)
            return value
        case .emoji(let text):
            var value = AttributedString(text)
            value.mergeAttributes(base)
            return value
        case .link(let text, let url):
            var value = AttributedString(text.isEmpty ? url : text)
            var attributes = base
            attributes.foregroundColor = theme.textLink
            attributes.link = URL(string: url)
            value.mergeAttributes(attributes)
            return value
        case .at(let uid, let name):
            var value = AttributedString("@\(name)")
            var attributes = base
            attributes.foregroundColor = theme.textLink
            attributes.link = userURL(uid: uid)
            value.mergeAttributes(attributes)
            return value
        case .topic(let id, let name):
            var value = AttributedString("#\(name)#")
            var attributes = base
            attributes.foregroundColor = theme.textLink
            attributes.link = topicURL(id: id, name: name)
            value.mergeAttributes(attributes)
            return value
        case .linebreak:
            return AttributedString("\n")
        case .emoticon, .image, .video, .audio, .poll:
            return AttributedString()
        }
    }

    public static func makeInlineText(
        segments: [PostSegment],
        theme: AppPalette
    ) -> Text {
        var result = Text("")
        for segment in segments {
            switch segment {
            case .emoticon(let name, _):
                result = result + emoticonImageText(name: name)
            case .text(let text):
                for token in parseEmoticonTokens(in: text) {
                    switch token {
                    case .text(let rawText):
                        result = result + Text(
                            attributedString(for: .text(rawText), theme: theme)
                        )
                    case .emoticon(let name):
                        result = result + emoticonImageText(name: name)
                    }
                }
            default:
                result = result + Text(attributedString(for: segment, theme: theme))
            }
        }
        return result
    }

    private static func emoticonImageText(name: String) -> Text {
        let image = EmoticonImageCache.shared.image(for: name)
            ?? placeholderEmoticonImage()
        return Text(Image(uiImage: image)).baselineOffset(-3)
    }

    private static func parseEmoticonTokens(in text: String) -> [InlineEmoticonToken] {
        let nsText = text as NSString
        let pattern = "#\\(([^()]+)\\)|\\(#([^()]+)\\)|\\[([^\\[\\]]+)\\]"
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            return [.text(text)]
        }

        let matches = regex.matches(
            in: text,
            options: [],
            range: NSRange(location: 0, length: nsText.length)
        )
        var tokens: [InlineEmoticonToken] = []
        var cursor = text.startIndex

        for match in matches {
            guard let range = Range(match.range, in: text) else { continue }
            if range.lowerBound > cursor {
                tokens.append(.text(String(text[cursor..<range.lowerBound])))
            }

            let name: String?
            if match.range(at: 1).location != NSNotFound {
                name = nsText.substring(with: match.range(at: 1))
            } else if match.range(at: 2).location != NSNotFound {
                name = String(nsText.substring(with: match.range(at: 2)).dropFirst())
            } else if match.range(at: 3).location != NSNotFound {
                name = nsText.substring(with: match.range(at: 3))
            } else {
                name = nil
            }

            if let name, emoticonURL(name: name, src: "") != nil {
                tokens.append(.emoticon(name: name))
            } else {
                tokens.append(.text(String(text[range])))
            }
            cursor = range.upperBound
        }

        if cursor < text.endIndex {
            tokens.append(.text(String(text[cursor...])))
        }
        return tokens.isEmpty ? [.text(text)] : tokens
    }

    public static func placeholderEmoticonImage(size: CGSize = CGSize(width: 20, height: 20)) -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { _ in
            let rect = CGRect(origin: .zero, size: size)
            UIColor.secondarySystemFill.setFill()
            UIBezierPath(roundedRect: rect, cornerRadius: 4).fill()

            if let symbol = UIImage(systemName: "face.smiling")?.withTintColor(.secondaryLabel, renderingMode: .alwaysTemplate) {
                symbol.draw(in: rect.insetBy(dx: 2, dy: 2))
            }
        }
    }

    private static func isInline(_ segment: PostSegment) -> Bool {
        switch segment {
        case .text, .emoji, .emoticon, .link, .at, .topic, .linebreak:
            return true
        case .image, .video, .audio, .poll:
            return false
        }
    }

    private static func isBlock(_ segment: PostSegment) -> Bool {
        switch segment {
        case .video, .audio, .poll:
            return true
        case .text, .emoji, .emoticon, .image, .link, .at, .topic, .linebreak:
            return false
        }
    }

    private static func userURL(uid: String) -> URL {
        URL(string: "tblite://user/\(uid)")!
    }

    private static func topicURL(id: String, name: String) -> URL {
        var components = URLComponents()
        components.scheme = "tblite"
        components.host = "topic"
        components.path = "/\(id)"
        if !name.isEmpty {
            components.queryItems = [URLQueryItem(name: "name", value: name)]
        }
        return components.url ?? URL(string: "tblite://topic/\(id)")!
    }
}

private enum InlineEmoticonToken {
    case text(String)
    case emoticon(name: String)
}

private final class EmoticonImageCache {
    static let shared = EmoticonImageCache()

    private let cache = NSCache<NSString, UIImage>()

    func image(for name: String) -> UIImage? {
        cache.object(forKey: name as NSString)
    }

    func setImage(_ image: UIImage, for name: String) {
        cache.setObject(image, forKey: name as NSString)
    }
}

// MARK: - Image Grid

private struct MediaGrid: View {
    let images: [MediaItem]
    let maxCount: Int
    let onPress: ([MediaItem], Int) -> Void

    @Environment(\.appTheme) private var theme

    private var displayImages: [MediaItem] {
        Array(images.prefix(maxCount))
    }

    private var remainingCount: Int {
        max(0, images.count - displayImages.count)
    }

    private var columns: [GridItem] {
        let count = displayImages.count
        let columnCount = count == 1 ? 1 : count == 2 ? 2 : 3
        return Array(repeating: GridItem(.flexible(), spacing: 6), count: columnCount)
    }

    var body: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 6) {
            ForEach(displayImages.indices, id: \.self) { index in
                MediaGridCell(
                    allImages: images,
                    media: displayImages[index],
                    index: index,
                    isSingle: displayImages.count == 1,
                    isLast: index == displayImages.count - 1,
                    remainingCount: remainingCount,
                    onPress: onPress
                )
            }
        }
    }
}

private struct MediaGridCell: View {
    let allImages: [MediaItem]
    let media: MediaItem
    let index: Int
    let isSingle: Bool
    let isLast: Bool
    let remainingCount: Int
    let onPress: ([MediaItem], Int) -> Void

    @Environment(\.appTheme) private var theme

    private var aspectRatio: CGFloat {
        guard media.width > 0, media.height > 0 else { return 1 }
        return media.width / media.height
    }

    var body: some View {
        AsyncImage(url: URL(string: media.src)) { phase in
            switch phase {
            case .success(let image):
                if isSingle {
                    image.resizable().scaledToFit()
                } else {
                    image.resizable().scaledToFill()
                }
            case .failure:
                placeholder
            case .empty:
                placeholder.overlay {
                    ProgressView()
                }
            @unknown default:
                placeholder
            }
        }
        .frame(maxWidth: .infinity, maxHeight: isSingle ? 300 : .infinity)
        .aspectRatio(aspectRatio, contentMode: isSingle ? .fit : .fill)
        .clipped()
        .contentShape(Rectangle())
        .background(theme.surfaceTertiary)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .onTapGesture {
            onPress(allImages, index)
        }
        .overlay(alignment: .bottomTrailing) {
            if isLast && remainingCount > 0 {
                Text("+\(remainingCount)")
                    .font(.footnote.bold())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(.black.opacity(0.62), in: Capsule())
                    .padding(6)
            }
        }
    }

    private var placeholder: some View {
        ZStack {
            Rectangle().fill(theme.surfaceTertiary)
            Image(systemName: "photo")
                .foregroundStyle(theme.textTertiary)
        }
    }
}

// MARK: - Video

private struct VideoSegmentView: View {
    let media: MediaItem

    @Environment(\.appTheme) private var theme
    @State private var player: AVPlayer?

    private var aspectRatio: CGFloat {
        guard media.width > 0, media.height > 0 else { return 16 / 9 }
        return media.width / media.height
    }

    var body: some View {
        Group {
            if let player = player {
                VideoPlayer(player: player)
                    .aspectRatio(aspectRatio, contentMode: .fit)
                    .onAppear {
                        player.play()
                    }
            } else {
                Button(action: startPlayback) {
                    posterView
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(aspectRatio, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .background(theme.surfaceTertiary)
        .onDisappear {
            player?.pause()
            player = nil
        }
    }

    private var posterView: some View {
        ZStack {
            if let poster = media.poster, let url = URL(string: poster) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        placeholderBackground
                    }
                }
            } else {
                placeholderBackground
            }

            Image(systemName: "play.circle.fill")
                .font(.system(size: 46))
                .foregroundStyle(.white)
                .shadow(radius: 6)

            Text("视频")
                .font(.caption2.bold())
                .foregroundStyle(.white)
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(.black.opacity(0.55), in: Capsule())
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                .padding(8)
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(aspectRatio, contentMode: .fit)
        .clipped()
    }

    private var placeholderBackground: some View {
        ZStack {
            Rectangle().fill(theme.surfaceTertiary)
            Image(systemName: "video")
                .font(.title2)
                .foregroundStyle(theme.textTertiary)
        }
    }

    private func startPlayback() {
        guard let url = URL(string: media.src) else { return }
        // TODO: 接入统一网络层后，用 AVURLAsset(url:options:) 注入请求头，
        // 并通过 AVAssetResourceLoaderDelegate 处理带
        // Referer: https://tieba.baidu.com/ 的资源请求；当前原型用
        // AVPlayer(url:) 直接播放，不实现 Cookie/签名鉴权。
        let newPlayer = AVPlayer(url: url)
        newPlayer.play()
        player = newPlayer
    }
}

// MARK: - Audio

private struct AudioSegmentView: View {
    let url: String
    let duration: TimeInterval

    @Environment(\.appTheme) private var theme
    @State private var streamPlayer: AVPlayer?
    @State private var audioPlayer: AVAudioPlayer?
    @State private var isPlaying = false

    private static let waveformBars: [CGFloat] = [
        12, 18, 8, 22, 14, 20, 10, 24, 16, 6, 19, 13, 21, 9, 17,
    ]

    private var currentTime: TimeInterval {
        if let audioPlayer = audioPlayer {
            return audioPlayer.currentTime
        }
        return streamPlayer?.currentTime().seconds ?? 0
    }

    private var totalTime: TimeInterval {
        if let audioPlayer = audioPlayer, audioPlayer.duration > 0 {
            return audioPlayer.duration
        }
        let value = streamPlayer?.currentItem?.duration.seconds ?? 0
        return value.isFinite && value > 0 ? value : duration
    }

    var body: some View {
        Group {
            if streamPlayer != nil || audioPlayer != nil {
                activeRow
            } else {
                inactiveRow
            }
        }
        .padding(12)
        .background(theme.surfaceSecondary, in: RoundedRectangle(cornerRadius: 8))
        .onDisappear {
            streamPlayer?.pause()
            streamPlayer = nil
            audioPlayer?.stop()
            audioPlayer = nil
            isPlaying = false
        }
    }

    private var inactiveRow: some View {
        Button(action: startPlayback) {
            HStack(spacing: 10) {
                Image(systemName: "play.fill")
                    .font(.body.bold())
                    .foregroundStyle(theme.primary)

                waveform

                Text(formatDuration(duration))
                    .font(.caption)
                    .foregroundStyle(theme.textSecondary)
            }
        }
        .buttonStyle(.plain)
    }

    private var activeRow: some View {
        HStack(spacing: 10) {
            Button(action: togglePlayback) {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.body.bold())
                    .foregroundStyle(theme.primary)
            }
            .buttonStyle(.plain)

            ProgressView(value: currentTime, total: max(totalTime, 1))
                .tint(theme.primary)

            Text("\(formatDuration(currentTime)) / \(formatDuration(totalTime))")
                .font(.caption)
                .foregroundStyle(theme.textSecondary)
        }
    }

    private var waveform: some View {
        HStack(spacing: 2) {
            ForEach(Self.waveformBars.indices, id: \.self) { index in
                RoundedRectangle(cornerRadius: 1)
                    .fill(theme.textSecondary.opacity(isPlaying ? 1 : 0.5))
                    .frame(width: 3, height: Self.waveformBars[index])
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func startPlayback() {
        guard let url = URL(string: url) else { return }
        if url.isFileURL, let player = try? AVAudioPlayer(contentsOf: url) {
            player.prepareToPlay()
            player.play()
            audioPlayer = player
            isPlaying = true
            return
        }

        // TODO: 接入统一网络层后，用 AVURLAsset 的 options 注入 Referer:
        // https://tieba.baidu.com/，并通过 AVAssetResourceLoaderDelegate
        // 处理鉴权请求；当前原型保留 AVPlayer 直接播放，不实现真实网络层。
        let newPlayer = AVPlayer(url: url)
        newPlayer.play()
        streamPlayer = newPlayer
        isPlaying = true
    }

    private func togglePlayback() {
        if isPlaying {
            streamPlayer?.pause()
            audioPlayer?.pause()
            isPlaying = false
        } else {
            streamPlayer?.play()
            audioPlayer?.play()
            isPlaying = true
        }
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let total = Int(seconds.rounded())
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

// MARK: - Poll

private struct PollSegmentView: View {
    let options: [PollOption]
    let onVote: (Int) -> Void
    let onVoteMulti: ([Int]) -> Void
    let isMulti: Bool
    let isClosed: Bool
    let deadline: TimeInterval

    @Environment(\.appTheme) private var theme
    @State private var submitted: Bool
    @State private var selectedIndices: Set<Int>

    init(
        options: [PollOption],
        onVote: @escaping (Int) -> Void = { _ in },
        onVoteMulti: @escaping ([Int]) -> Void = { _ in },
        isMulti: Bool = false,
        isClosed: Bool = false,
        deadline: TimeInterval = 0
    ) {
        self.options = options
        self.onVote = onVote
        self.onVoteMulti = onVoteMulti
        self.isMulti = isMulti
        self.isClosed = isClosed
        self.deadline = deadline
        _submitted = State(
            initialValue: options.contains(where: \.isSelected)
                || isClosed
                || Self.isExpired(deadline: deadline)
        )
        _selectedIndices = State(
            initialValue: Set(options.indices.filter { options[$0].isSelected })
        )
    }

    private var totalVotes: Int {
        options.reduce(0) { $0 + $1.count }
    }

    private var hasExpired: Bool {
        Self.isExpired(deadline: deadline)
    }

    private var canVote: Bool {
        !submitted && !isClosed && !hasExpired
    }

    private static func isExpired(deadline: TimeInterval) -> Bool {
        deadline > 0 && Date().timeIntervalSince1970 >= deadline
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if isClosed || hasExpired {
                statusRow
            }

            ForEach(options.indices, id: \.self) { index in
                optionRow(index)
            }

            if isMulti && canVote {
                submitButton
            }

            Text("\(totalVotes)人参与投票")
                .font(.footnote)
                .foregroundStyle(theme.textTertiary)
        }
        .padding(12)
        .background(theme.surfaceSecondary, in: RoundedRectangle(cornerRadius: 8))
    }

    private var statusRow: some View {
        Label(isClosed ? "投票已结束" : "投票已截止", systemImage: "clock.badge.checkmark")
            .font(.caption.weight(.semibold))
            .foregroundStyle(theme.textSecondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(theme.chip, in: Capsule())
    }

    private var submitButton: some View {
        Button(action: submitMulti) {
            Label(
                selectedIndices.isEmpty ? "提交投票" : "提交投票 (\(selectedIndices.count))",
                systemImage: "checkmark.circle.fill"
            )
                .font(.footnote.weight(.semibold))
                .frame(maxWidth: .infinity)
                .frame(height: 40)
        }
        .buttonStyle(.plain)
        .background(
            selectedIndices.isEmpty ? theme.surfaceTertiary : theme.primary,
            in: RoundedRectangle(cornerRadius: 20)
        )
        .foregroundStyle(
            selectedIndices.isEmpty ? theme.textTertiary : theme.textOnPrimary
        )
        .disabled(selectedIndices.isEmpty)
        .accessibilityLabel("提交投票")
        .accessibilityHint(
            selectedIndices.isEmpty
                ? "请先选择投票选项"
                : "提交选中的 \(selectedIndices.count) 个选项"
        )
    }

    private func optionRow(_ index: Int) -> some View {
        let option = options[index]
        let isSelected = selectedIndices.contains(index)
        let percentage = totalVotes > 0
            ? Int((Double(option.count) / Double(totalVotes) * 100).rounded())
            : 0

        return Button {
            guard canVote else { return }
            if isMulti {
                if isSelected {
                    selectedIndices.remove(index)
                } else {
                    selectedIndices.insert(index)
                }
                return
            }

            selectedIndices = [index]
            withAnimation(.easeOut(duration: 0.3)) {
                submitted = true
            }
            onVote(index)
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Image(
                        systemName: isMulti
                            ? (isSelected ? "checkmark.square.fill" : "square")
                            : (submitted && isSelected ? "checkmark.circle.fill" : "circle")
                    )
                        .foregroundStyle(isSelected ? theme.primary : theme.textTertiary)

                    Text(option.text)
                        .font(.subheadline)
                        .foregroundStyle(isSelected ? theme.primary : theme.text)
                        .multilineTextAlignment(.leading)

                    Spacer(minLength: 8)

                    if submitted || isClosed || hasExpired {
                        Text("\(percentage)%")
                            .font(.caption.bold())
                            .foregroundStyle(isSelected ? theme.primary : theme.textSecondary)
                    }
                }

                if submitted || isClosed || hasExpired {
                    ProgressView(value: Double(option.count), total: Double(max(totalVotes, 1)))
                        .tint(isSelected ? theme.primary : theme.textSecondary)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func submitMulti() {
        guard canVote, !selectedIndices.isEmpty else { return }
        let indices = Array(selectedIndices).sorted()
        withAnimation(.easeOut(duration: 0.3)) {
            submitted = true
        }
        onVoteMulti(indices)
    }
}

// MARK: - Preview

#Preview("Post Content") {
    PostContentView(segments: PreviewData.posts[0].content)
        .padding()
        .environment(\.appTheme, .lightPalette)
        .background(AppPalette.lightPalette.background)
}
