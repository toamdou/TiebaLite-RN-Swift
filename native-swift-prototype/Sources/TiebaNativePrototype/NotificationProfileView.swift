import Foundation
import SwiftUI
import UIKit

// MARK: - Clipboard link detection

struct TiebaClipboardLink: Identifiable, Equatable {
    let id = UUID()
    let url: URL
    let kind: TiebaClipboardLinkKind
}

enum TiebaClipboardLinkKind: Equatable {
    case thread
    case forum
}

enum TiebaClipboardDetector {
    static func link(in text: String) -> TiebaClipboardLink? {
        let nsText = text as NSString
        let pattern = "(?:https?://)?(?:www\\.)?tieba\\.baidu\\.com[^\\s]*"
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            return nil
        }
        let matches = regex.matches(
            in: text,
            options: [],
            range: NSRange(location: 0, length: nsText.length)
        )

        for match in matches {
            var urlString = nsText.substring(with: match.range)
            if !urlString.lowercased().hasPrefix("http") {
                urlString = "https://" + urlString
            }
            guard let url = URL(string: urlString) else { continue }
            guard let kind = classify(url) else { continue }
            return TiebaClipboardLink(url: url, kind: kind)
        }
        return nil
    }

    private static func classify(_ url: URL) -> TiebaClipboardLinkKind? {
        let host = url.host?.lowercased() ?? ""
        guard host == "tieba.baidu.com" || host.hasSuffix(".tieba.baidu.com") else {
            return nil
        }
        if url.path.hasPrefix("/p/") {
            return .thread
        }
        if url.path == "/f" || url.path.hasPrefix("/f/") {
            let queryNames = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?
                .map { $0.name.lowercased() } ?? []
            if queryNames.contains("kw") {
                return .forum
            }
        }
        return nil
    }
}

// MARK: - Notification Models

public enum NotificationKind: String, CaseIterable, Identifiable, Hashable, Sendable {
    case reply
    case mention

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .reply:
            return "回复我的"
        case .mention:
            return "提到我的"
        }
    }
}

public struct NotificationUserInfo: Identifiable, Hashable, Sendable {
    public let id: String
    public var name: String
    public var nameShow: String
    public var portrait: String

    public init(
        id: String,
        name: String = "",
        nameShow: String = "",
        portrait: String = ""
    ) {
        self.id = id
        self.name = name
        self.nameShow = nameShow
        self.portrait = portrait
    }
}

public struct NotificationItem: Identifiable, Hashable, Sendable {
    public let id: String
    public var kind: NotificationKind
    public var user: NotificationUserInfo
    public var threadID: String
    public var postID: String?
    public var forumName: String
    public var content: String
    public var quote: String?
    public var createTime: TimeInterval
    public var isUnread: Bool

    public init(
        id: String,
        kind: NotificationKind = .reply,
        user: NotificationUserInfo = NotificationUserInfo(id: ""),
        threadID: String = "",
        postID: String? = nil,
        forumName: String = "",
        content: String = "",
        quote: String? = nil,
        createTime: TimeInterval = 0,
        isUnread: Bool = false
    ) {
        self.id = id
        self.kind = kind
        self.user = user
        self.threadID = threadID
        self.postID = postID
        self.forumName = forumName
        self.content = content
        self.quote = quote
        self.createTime = createTime
        self.isUnread = isUnread
    }
}

// MARK: - Notification Screen

public struct NotificationView: View {
    public let items: [NotificationItem]
    public let isLoading: Bool
    public let isLoadingMore: Bool
    public let hasMore: Bool
    public let errorMessage: String?

    public let onOpenThread: (NotificationItem) -> Void
    public let onOpenAuthor: (NotificationUserInfo) -> Void
    public let onLoadMore: () -> Void
    public let onRefresh: () async -> Void

    @Environment(\.appTheme) private var theme
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedKind: NotificationKind
    @State private var didTriggerInitialLoad = false
    @State private var lastRequestedItemID: String?
    @State private var lastClipboardChangeCount = UIPasteboard.general.changeCount
    @State private var clipboardLinkAlert: TiebaClipboardLink?

    public init(
        items: [NotificationItem] = [],
        initialKind: NotificationKind = .reply,
        isLoading: Bool = false,
        isLoadingMore: Bool = false,
        hasMore: Bool = true,
        errorMessage: String? = nil,
        onOpenThread: @escaping (NotificationItem) -> Void = { _ in },
        onOpenAuthor: @escaping (NotificationUserInfo) -> Void = { _ in },
        onLoadMore: @escaping () -> Void = {},
        onRefresh: @escaping () async -> Void = {}
    ) {
        self.items = items
        self.isLoading = isLoading
        self.isLoadingMore = isLoadingMore
        self.hasMore = hasMore
        self.errorMessage = errorMessage
        self.onOpenThread = onOpenThread
        self.onOpenAuthor = onOpenAuthor
        self.onLoadMore = onLoadMore
        self.onRefresh = onRefresh
        _selectedKind = State(initialValue: initialKind)
    }

    public var body: some View {
        VStack(spacing: 0) {
            Picker("消息类型", selection: $selectedKind) {
                ForEach(NotificationKind.allCases) { kind in
                    Text(kind.title)
                        .tag(kind)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(theme.windowBackground)

            content
        }
        .background(theme.background)
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
        .navigationTitle("通知")
        .navigationBarTitleDisplayMode(.large)
    }

    private var content: some View {
        List {
            if currentItems.isEmpty {
                if let errorMessage, !errorMessage.isEmpty {
                    NotificationErrorRow(message: errorMessage, onRetry: onLoadMore)
                } else if isLoading {
                    NotificationLoadingRow()
                } else {
                    NotificationEmptyRow()
                }
            } else {
                ForEach(currentItems) { item in
                    NotificationRow(
                        item: item,
                        onOpenThread: onOpenThread,
                        onOpenAuthor: onOpenAuthor
                    )
                    .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                    .listRowSeparator(.hidden)
                    .listRowBackground(theme.background)
                    .onAppear {
                        requestLoadMoreIfNeeded(for: item)
                    }
                }

                NotificationLoadMoreFooterView(
                    isLoadingMore: isLoadingMore,
                    hasMore: hasMore,
                    onLoadMore: onLoadMore
                )
                .listRowInsets(EdgeInsets())
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .refreshable {
            await onRefresh()
        }
        .onChange(of: selectedKind) { _, _ in
            lastRequestedItemID = nil
            didTriggerInitialLoad = false
            if canAutoLoadInitial {
                didTriggerInitialLoad = true
                onLoadMore()
            }
        }
        .onAppear {
            guard canAutoLoadInitial, !didTriggerInitialLoad else { return }
            didTriggerInitialLoad = true
            onLoadMore()
        }
    }

    private var currentItems: [NotificationItem] {
        items.filter { $0.kind == selectedKind }
    }

    private var canAutoLoadInitial: Bool {
        currentItems.isEmpty
            && hasMore
            && !isLoadingMore
            && !isLoading
            && (errorMessage?.isEmpty ?? true)
    }

    private func requestLoadMoreIfNeeded(for item: NotificationItem) {
        guard item.id == currentItems.last?.id else { return }
        requestLoadMoreForLastItem()
    }

    private func requestLoadMoreForLastItem() {
        guard let lastID = currentItems.last?.id, lastID != lastRequestedItemID else { return }
        lastRequestedItemID = lastID
        guard hasMore, !isLoadingMore else { return }
        onLoadMore()
    }

    private func checkClipboardLink() {
        let pasteboard = UIPasteboard.general
        guard pasteboard.changeCount != lastClipboardChangeCount else { return }
        lastClipboardChangeCount = pasteboard.changeCount
        guard let text = pasteboard.string else { return }
        guard let link = TiebaClipboardDetector.link(in: text) else { return }
        clipboardLinkAlert = link
    }
}

// MARK: - Notification Rows

private struct NotificationRow: View {
    let item: NotificationItem
    let onOpenThread: (NotificationItem) -> Void
    let onOpenAuthor: (NotificationUserInfo) -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            contentButton
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.card, in: RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(theme.border, lineWidth: 0.5)
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 10) {
            Button {
                onOpenAuthor(item.user)
            } label: {
                PrototypeAvatarView(
                    portrait: item.user.portrait,
                    fallbackText: displayName,
                    size: 40
                )
            }
            .buttonStyle(.plain)

            Button {
                onOpenAuthor(item.user)
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(displayName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(theme.text)
                        .lineLimit(1)
                    Text(relativeTime(item.createTime))
                        .font(.caption)
                        .foregroundStyle(theme.textTertiary)
                }
            }
            .buttonStyle(.plain)

            Spacer(minLength: 4)

            Text(item.kind.title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(theme.onChip)
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(theme.chip, in: Capsule())

            if item.isUnread {
                Circle()
                    .fill(theme.primary)
                    .frame(width: 8, height: 8)
            }
        }
    }

    private var contentButton: some View {
        Button {
            onOpenThread(item)
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                Text(item.content.isEmpty ? "查看消息" : item.content)
                    .font(.subheadline)
                    .foregroundStyle(theme.text)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if let quote = item.quote, !quote.isEmpty {
                    Text(quote)
                        .font(.footnote)
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(theme.surfaceSecondary, in: RoundedRectangle(cornerRadius: 6))
                }

                HStack(spacing: 6) {
                    if !item.forumName.isEmpty {
                        Text(item.forumName)
                            .font(.caption)
                            .foregroundStyle(theme.textSecondary)
                    }

                    Spacer(minLength: 0)

                    Label("打开帖子", systemImage: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(theme.textTertiary)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var displayName: String {
        item.user.nameShow.isEmpty ? item.user.name : item.user.nameShow
    }
}

private struct NotificationErrorRow: View {
    let message: String
    let onRetry: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        ContentUnavailableView {
            Label("加载失败", systemImage: "wifi.exclamationmark")
        } description: {
            Text(message)
        } actions: {
            Button("重试", action: onRetry)
                .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
        .listRowInsets(EdgeInsets())
        .listRowSeparator(.hidden)
        .listRowBackground(theme.background)
    }
}

private struct NotificationLoadingRow: View {
    @Environment(\.appTheme) private var theme

    var body: some View {
        ProgressView("加载中")
            .frame(maxWidth: .infinity)
            .padding(.vertical, 64)
            .listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
            .listRowBackground(theme.background)
    }
}

private struct NotificationEmptyRow: View {
    @Environment(\.appTheme) private var theme

    var body: some View {
        ContentUnavailableView("暂无消息", systemImage: "bell.slash")
            .frame(maxWidth: .infinity)
            .padding(.vertical, 48)
            .listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
            .listRowBackground(theme.background)
    }
}

private struct NotificationLoadMoreFooterView: View {
    let isLoadingMore: Bool
    let hasMore: Bool
    let onLoadMore: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(spacing: 8) {
            Spacer()

            if isLoadingMore {
                ProgressView()
                    .controlSize(.small)
                Text("加载中")
                    .font(.footnote)
            } else if hasMore {
                Button("加载更多", action: onLoadMore)
                    .font(.footnote)
            } else {
                Text("没有更多了")
                    .font(.footnote)
            }

            Spacer()
        }
        .foregroundStyle(theme.textTertiary)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Profile Models

public enum ProfileMenuAction: String, CaseIterable, Identifiable, Hashable, Sendable {
    case accountManagement
    case blockSettings
    case oneTapSign
    case moreSettings
    case experimentalFeatures
    case about

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .accountManagement:
            return "账号管理"
        case .blockSettings:
            return "屏蔽设置"
        case .oneTapSign:
            return "一键签到"
        case .moreSettings:
            return "更多设置"
        case .experimentalFeatures:
            return "实验功能"
        case .about:
            return "关于"
        }
    }

    public var systemImage: String {
        switch self {
        case .accountManagement:
            return "person.2"
        case .blockSettings:
            return "hand.raised"
        case .oneTapSign:
            return "checkmark.circle"
        case .moreSettings:
            return "ellipsis.circle"
        case .experimentalFeatures:
            return "flask"
        case .about:
            return "info.circle"
        }
    }
}

public struct ProfileAccount: Identifiable, Hashable, Sendable {
    public let id: String
    public var name: String
    public var nameShow: String
    public var portrait: String
    public var intro: String
    public var levelId: Int

    public init(
        id: String,
        name: String = "",
        nameShow: String = "",
        portrait: String = "",
        intro: String = "",
        levelId: Int = 0
    ) {
        self.id = id
        self.name = name
        self.nameShow = nameShow
        self.portrait = portrait
        self.intro = intro
        self.levelId = levelId
    }
}

public struct ProfileStats: Hashable, Sendable {
    public var concernNum: Int
    public var fansNum: Int
    public var postNum: Int

    public init(concernNum: Int = 0, fansNum: Int = 0, postNum: Int = 0) {
        self.concernNum = concernNum
        self.fansNum = fansNum
        self.postNum = postNum
    }
}

// MARK: - Profile Screen

public struct ProfileView: View {
    public let account: ProfileAccount?
    public let stats: ProfileStats
    public let isLoading: Bool
    public let onLogin: () -> Void
    public let onOpenSettings: (ProfileMenuAction) -> Void

    @Environment(\.appTheme) private var theme

    public init(
        account: ProfileAccount? = nil,
        stats: ProfileStats = ProfileStats(),
        isLoading: Bool = false,
        onLogin: @escaping () -> Void = {},
        onOpenSettings: @escaping (ProfileMenuAction) -> Void = { _ in }
    ) {
        self.account = account
        self.stats = stats
        self.isLoading = isLoading
        self.onLogin = onLogin
        self.onOpenSettings = onOpenSettings
    }

    public var body: some View {
        List {
            accountSection

            if account != nil {
                settingsSection
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .navigationTitle("我的")
        .navigationBarTitleDisplayMode(.large)
    }

    @ViewBuilder
    private var accountSection: some View {
        if let account {
            Section {
                ProfileAccountCard(account: account, stats: stats)
                    .listRowInsets(EdgeInsets(top: 12, leading: 12, bottom: 12, trailing: 12))
                    .listRowSeparator(.hidden)
            }
        } else {
            Section {
                if isLoading {
                    HStack {
                        Spacer()
                        ProgressView("加载账号")
                        Spacer()
                    }
                    .padding(.vertical, 32)
                } else {
                    ProfileLoggedOutCard(onLogin: onLogin)
                }
            }
        }
    }

    private var settingsSection: some View {
        Section("设置") {
            ForEach(ProfileMenuAction.allCases) { action in
                Button {
                    onOpenSettings(action)
                } label: {
                    HStack {
                        Label(action.title, systemImage: action.systemImage)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(theme.textTertiary)
                    }
                }
                .foregroundStyle(theme.text)
            }
        }
    }
}

// MARK: - Profile Cards

private struct ProfileLoggedOutCard: View {
    let onLogin: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "person.crop.circle.badge.questionmark")
                .font(.system(size: 44))
                .foregroundStyle(theme.textSecondary)

            VStack(spacing: 4) {
                Text("未登录")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(theme.text)

                Text("登录后同步关注、消息与历史")
                    .font(.subheadline)
                    .foregroundStyle(theme.textSecondary)
                    .multilineTextAlignment(.center)
            }

            Button(action: onLogin) {
                Text("登录百度账号")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(theme.textOnPrimary)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 9)
                    .background(theme.primary, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
    }
}

private struct ProfileAccountCard: View {
    let account: ProfileAccount
    let stats: ProfileStats

    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                PrototypeAvatarView(
                    portrait: account.portrait,
                    fallbackText: displayName,
                    size: 64
                )

                VStack(alignment: .leading, spacing: 5) {
                    Text(displayName)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(theme.text)
                        .lineLimit(1)

                    if account.levelId > 0 {
                        Text("Lv.\(account.levelId)")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(theme.onChip)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(theme.chip, in: Capsule())
                    }

                    if !account.intro.isEmpty {
                        Text(account.intro)
                            .font(.caption)
                            .foregroundStyle(theme.textSecondary)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                }

                Spacer(minLength: 0)
            }

            HStack(spacing: 0) {
                stat(value: compactCount(stats.concernNum), title: "关注")
                statDivider
                stat(value: compactCount(stats.fansNum), title: "粉丝")
                statDivider
                stat(value: compactCount(stats.postNum), title: "帖子")
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(theme.surfaceSecondary, in: RoundedRectangle(cornerRadius: 10))
        }
        .padding(4)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func stat(value: String, title: String) -> some View {
        VStack(spacing: 3) {
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(theme.text)
            Text(title)
                .font(.caption)
                .foregroundStyle(theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
    }

    private var statDivider: some View {
        Rectangle()
            .fill(theme.divider)
            .frame(width: 0.5, height: 24)
    }

    private var displayName: String {
        account.nameShow.isEmpty ? account.name : account.nameShow
    }
}

// MARK: - Shared Avatar

private struct PrototypeAvatarView: View {
    let portrait: String
    let fallbackText: String
    let size: CGFloat

    @Environment(\.appTheme) private var theme

    var body: some View {
        Group {
            if let url = URL(string: portrait), !portrait.isEmpty {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure:
                        fallback
                    case .empty:
                        ProgressView()
                            .controlSize(.small)
                    @unknown default:
                        fallback
                    }
                }
            } else {
                fallback
            }
        }
        .frame(width: size, height: size)
        .background(theme.surfaceTertiary)
        .clipShape(Circle())
        .overlay {
            Circle()
                .stroke(theme.border, lineWidth: 0.5)
        }
    }

    private var fallback: some View {
        ZStack {
            theme.surfaceTertiary
            Text(initial)
                .font(.system(size: size * 0.4, weight: .semibold))
                .foregroundStyle(theme.textSecondary)
        }
    }

    private var initial: String {
        let text = fallbackText.trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? "?" : String(text.prefix(1)).uppercased()
    }
}

// MARK: - Formatting

private func compactCount(_ count: Int) -> String {
    if count >= 100_000_000 {
        return String(format: "%.1f亿", Double(count) / 100_000_000)
    }
    if count >= 10_000 {
        return String(format: "%.1f万", Double(count) / 10_000)
    }
    return "\(count)"
}

private func relativeTime(_ timestamp: TimeInterval) -> String {
    guard timestamp > 0 else { return "刚刚" }
    let date = Date(timeIntervalSince1970: timestamp)
    let seconds = max(0, Date().timeIntervalSince(date))
    if seconds < 60 {
        return "刚刚"
    }
    if seconds < 3_600 {
        return "\(Int(seconds / 60))分钟前"
    }
    if seconds < 86_400 {
        return "\(Int(seconds / 3_600))小时前"
    }
    if seconds < 604_800 {
        return "\(Int(seconds / 86_400))天前"
    }
    let formatter = DateFormatter()
    formatter.dateFormat = "MM-dd"
    return formatter.string(from: date)
}

// MARK: - Preview Data

private enum NotificationPreviewData {
    static let all: [NotificationItem] = [
        NotificationItem(
            id: "n1",
            kind: .reply,
            user: NotificationUserInfo(id: "1002", name: "digi_user", nameShow: "数码爱好者"),
            threadID: "1",
            postID: "p2",
            forumName: "苹果",
            content: "确实很流畅，续航也没有明显变差。",
            quote: "iOS 26 毛玻璃效果太强了",
            createTime: Date().timeIntervalSince1970 - 120,
            isUnread: true
        ),
        NotificationItem(
            id: "n2",
            kind: .reply,
            user: NotificationUserInfo(id: "1001", name: "apple_fan", nameShow: "果粉小明"),
            threadID: "1",
            postID: "p1",
            forumName: "苹果",
            content: "新系统的毛玻璃效果确实强。",
            quote: "iOS 26 毛玻璃效果太强了",
            createTime: Date().timeIntervalSince1970 - 3_600,
            isUnread: false
        ),
        NotificationItem(
            id: "n3",
            kind: .mention,
            user: NotificationUserInfo(id: "1001", name: "apple_fan", nameShow: "果粉小明"),
            threadID: "2",
            postID: nil,
            forumName: "数码",
            content: "@你 看一下这个新系统。",
            quote: "求推荐一个好用的浏览器",
            createTime: Date().timeIntervalSince1970 - 86_400,
            isUnread: true
        ),
        NotificationItem(
            id: "n4",
            kind: .mention,
            user: NotificationUserInfo(id: "1000", name: "tieba_admin", nameShow: "贴吧管理员"),
            threadID: "1",
            postID: nil,
            forumName: "苹果",
            content: "你的帖子进入了推荐流。",
            quote: nil,
            createTime: Date().timeIntervalSince1970 - 259_200,
            isUnread: false
        ),
    ]
}

private enum ProfilePreviewData {
    static let account = ProfileAccount(
        id: "1001",
        name: "apple_fan",
        nameShow: "果粉小明",
        portrait: "",
        intro: "喜欢研究新系统，偶尔分享数码与生活。",
        levelId: 12
    )

    static let stats = ProfileStats(
        concernNum: 86,
        fansNum: 12_800,
        postNum: 42
    )
}

// MARK: - Previews

#Preview("通知") {
    NavigationStack {
        NotificationView(
            items: NotificationPreviewData.all,
            hasMore: true
        )
    }
    .environment(\.appTheme, .lightPalette)
}

#Preview("我的-登录") {
    NavigationStack {
        ProfileView(
            account: ProfilePreviewData.account,
            stats: ProfilePreviewData.stats
        )
    }
    .environment(\.appTheme, .lightPalette)
}

#Preview("我的-未登录") {
    NavigationStack {
        ProfileView()
    }
    .environment(\.appTheme, .lightPalette)
}
