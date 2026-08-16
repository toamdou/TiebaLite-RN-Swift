import Foundation
import SwiftUI
import UIKit

// MARK: - Root navigation

public struct RootNavigationView: View {
    public let themeName: ThemeName
    public let isDark: Bool
    public let customPrimary: String?

    public init(
        themeName: ThemeName = .tieba,
        isDark: Bool = false,
        customPrimary: String? = nil
    ) {
        self.themeName = themeName
        self.isDark = isDark
        self.customPrimary = customPrimary
    }

    private var palette: AppPalette {
        AppPalette.palette(for: themeName, isDark: isDark, customPrimary: customPrimary)
    }

    public var body: some View {
        NavigationStack {
            TiebaAppView()
        }
        .environment(\.appTheme, palette)
        .tint(palette.primary)
        .preferredColorScheme(isDark ? .dark : .light)
        .reduceMotionEnvironment()
    }
}

// MARK: - Tab shell

public struct TiebaAppView: View {
    @State private var selectedThread: FeedThreadInfo?
    @State private var imageViewerRoute: ImageViewerRoute?
    @State private var selectedForum: ShellForumRoute?
    @State private var selectedUser: ShellUserRoute?
    @State private var selectedTopic: ShellTopicRoute?
    @State private var totalUnread = 5
    @State private var clipboardChangeCount = UIPasteboard.general.changeCount
    @State private var clipboardLink: DetectedClipboardLink?

    @Environment(\.appTheme) private var theme
    @Environment(\.scenePhase) private var scenePhase

    public init() {}

    public var body: some View {
        TabView {
            HomeTabView(actions: feedActions)
                .tabItem {
                    Label("首页", systemImage: "house")
                }

            DiscoverTabView(actions: feedActions)
                .tabItem {
                    Label("发现", systemImage: "safari")
                }

            NotificationsTabView()
                .tabItem {
                    Label("通知", systemImage: "bell")
                }
                .badge(totalUnread)

            ProfileTabView()
                .tabItem {
                    Label("我的", systemImage: "person")
                }
        }
        .tint(theme.primary)
        .navigationDestination(item: $selectedThread) { thread in
            ThreadDetailPlaceholderView(
                thread: thread,
                onImagePress: { media, index in
                    imageViewerRoute = ImageViewerRoute(images: media, initialIndex: index)
                }
            )
        }
        .navigationDestination(item: $imageViewerRoute) { route in
            ImageViewerPlaceholderView(route: route)
        }
        .navigationDestination(item: $selectedForum) { route in
            ForumSearchView(forumName: route.forum.forumName, forumId: route.forum.id)
        }
        .navigationDestination(item: $selectedUser) { route in
            UserProfileView(
                uid: route.user.id,
                name: route.user.name,
                nameShow: route.user.name,
                portrait: route.user.portrait
            )
        }
        .navigationDestination(item: $selectedTopic) { route in
            TopicDetailView(
                topic: route.topic,
                threads: ShellPreviewData.feedItems.compactMap(\.threadInfo)
            )
        }
        .onChange(of: scenePhase) { _, phase in
            handleScenePhase(phase)
        }
        .alert(item: $clipboardLink) { link in
            Alert(
                title: Text("检测到贴吧链接"),
                message: Text(link.url.absoluteString),
                primaryButton: .default(Text("打开")) {
                    openClipboardLink(link)
                },
                secondaryButton: .cancel(Text("忽略"))
            )
        }
    }

    private var feedActions: FeedActions {
        var actions = FeedActions()
        actions.onOpenThread = { selectedThread = $0 }
        actions.onOpenForum = { selectedForum = ShellForumRoute(forum: $0) }
        actions.onOpenUser = { selectedUser = ShellUserRoute(user: $0) }
        actions.onOpenTopic = { selectedTopic = ShellTopicRoute(topic: $0) }
        return actions
    }

    private func handleScenePhase(_ phase: ScenePhase) {
        guard phase == .active else { return }

        let currentChangeCount = UIPasteboard.general.changeCount
        guard currentChangeCount != clipboardChangeCount else { return }
        clipboardChangeCount = currentChangeCount

        guard let text = UIPasteboard.general.string,
              let url = validURL(text),
              isTiebaLink(url) else {
            return
        }
        clipboardLink = DetectedClipboardLink(url: url)
    }

    private func isTiebaLink(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        let allowedHosts: Set<String> = [
            "tieba.baidu.com",
            "wapp.baidu.com",
            "tiebac.baidu.com",
            "c.tieba.baidu.com",
            "static.tieba.baidu.com",
            "wappass.baidu.com",
            "passport.baidu.com",
        ]
        return allowedHosts.contains(host)
    }

    private func openClipboardLink(_ link: DetectedClipboardLink) {
        guard let components = URLComponents(url: link.url, resolvingAgainstBaseURL: false) else {
            return
        }

        let path = components.path
        if path.hasPrefix("/p/") {
            let threadID = String(path.dropFirst(3))
                .split(separator: "/")
                .first
                .map(String.init) ?? ""
            selectedThread = FeedThreadInfo(
                id: threadID,
                title: "剪贴板帖子",
                forumName: "贴吧",
                createTime: Date().timeIntervalSince1970
            )
            return
        }

        let queryItems = components.queryItems ?? []
        let keyword = queryItems.first(where: { $0.name == "kw" })?.value
            ?? queryItems.first(where: { $0.name == "word" })?.value
        if let keyword, !keyword.isEmpty {
            selectedForum = ShellForumRoute(
                forum: FeedForumInfo(id: keyword, forumName: keyword)
            )
        }
    }
}

// MARK: - Feed tabs

private struct HomeTabView: View {
    let actions: FeedActions

    var body: some View {
        FeedListView(
            items: PreviewData.feedItems,
            onOpenThread: actions.onOpenThread,
            onOpenForum: actions.onOpenForum,
            onOpenUser: actions.onOpenUser,
            onOpenTopic: actions.onOpenTopic,
            onDislike: actions.onDislike,
            onBlockAuthor: actions.onBlockAuthor,
            onShare: actions.onShare,
            onComment: actions.onComment,
            onLike: actions.onLike
        )
        .navigationTitle("首页")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink {
                    SearchView(
                        suggestions: ShellPreviewData.searchSuggestions,
                        history: ShellPreviewData.searchHistory,
                        threads: ShellPreviewData.feedItems.compactMap(\.threadInfo),
                        forums: [ShellPreviewData.forumItem],
                        users: [ShellPreviewData.userItem],
                        onOpenThread: actions.onOpenThread,
                        onOpenForum: actions.onOpenForum,
                        onOpenUser: actions.onOpenUser
                    )
                } label: {
                    Image(systemName: "magnifyingglass")
                }
                .accessibilityLabel("搜索")
            }
        }
    }
}

private struct DiscoverTabView: View {
    let actions: FeedActions

    @Environment(\.appTheme) private var theme
    @State private var segment = 0

    private var items: [FeedItem] {
        switch segment {
        case 1:
            return ShellPreviewData.concernItems
        case 2:
            return ShellPreviewData.hotItems
        default:
            return ShellPreviewData.discoverItems
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("内容类型", selection: $segment) {
                Text("推荐").tag(0)
                Text("关注").tag(1)
                Text("热榜").tag(2)
            }
            .pickerStyle(.segmented)
            .glassCard(material: .ultraThinMaterial, cornerRadius: 12, padding: 0)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            FeedListView(
                items: items,
                onOpenThread: actions.onOpenThread,
                onOpenForum: actions.onOpenForum,
                onOpenUser: actions.onOpenUser,
                onOpenTopic: actions.onOpenTopic,
                onDislike: actions.onDislike,
                onBlockAuthor: actions.onBlockAuthor,
                onShare: actions.onShare,
                onComment: actions.onComment,
                onLike: actions.onLike
            )
        }
        .background(theme.background)
        .navigationTitle("发现")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink {
                    TopicListView(
                        topics: ShellPreviewData.topicItems,
                        onOpenTopic: actions.onOpenTopic
                    )
                } label: {
                    Image(systemName: "number")
                }
                .accessibilityLabel("热门话题")
            }
        }
    }
}

// MARK: - Notification and profile placeholders

private struct NotificationsTabView: View {
    @Environment(\.appTheme) private var theme
    @State private var segment = 0

    var body: some View {
        VStack(spacing: 0) {
            Picker("消息类型", selection: $segment) {
                Text("回复我的").tag(0)
                Text("提到我的").tag(1)
            }
            .pickerStyle(.segmented)
            .glassCard(material: .ultraThinMaterial, cornerRadius: 12, padding: 0)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            List {
                Section {
                    if segment == 0 {
                        ForEach(ShellPreviewData.replyNotifications) { item in
                            NotificationRow(item: item)
                        }
                    } else {
                        ForEach(ShellPreviewData.mentionNotifications) { item in
                            NotificationRow(item: item)
                        }
                    }
                } footer: {
                    Text("仅展示 UI 占位，消息数据接入后替换。")
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(theme.background)
        }
        .navigationTitle("通知")
        .navigationBarTitleDisplayMode(.large)
    }
}

private struct NotificationPlaceholderItem: Identifiable {
    let id: String
    let title: String
    let detail: String
    let time: String
    let systemImage: String
}

private struct NotificationRow: View {
    let item: NotificationPlaceholderItem

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: item.systemImage)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(theme.primary)
                .frame(width: 40, height: 40)
                .background(theme.primary.opacity(0.1), in: Circle())

            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(theme.text)
                    .lineLimit(1)
                Text(item.detail)
                    .font(.subheadline)
                    .foregroundStyle(theme.textSecondary)
                    .lineLimit(2)
                Text(item.time)
                    .font(.caption)
                    .foregroundStyle(theme.textTertiary)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct ProfileTabView: View {
    @Environment(\.appTheme) private var theme

    var body: some View {
        List {
            Section {
                HStack(spacing: 12) {
                    Image(systemName: "person.crop.circle.fill")
                        .font(.system(size: 46))
                        .foregroundStyle(theme.primary)
                        .frame(width: 56, height: 56)
                        .background(theme.primary.opacity(0.1), in: Circle())

                    VStack(alignment: .leading, spacing: 4) {
                        Text("未登录")
                            .font(.headline)
                            .foregroundStyle(theme.text)
                        Text("登录后同步关注、消息与历史")
                            .font(.caption)
                            .foregroundStyle(theme.textSecondary)
                    }
                }
                .padding(.vertical, 4)
            }

            Section("我的内容") {
                Label("我的帖子", systemImage: "doc.text")
                Label("浏览历史", systemImage: "clock")
                Label("我的收藏", systemImage: "star")
            }

            Section("设置") {
                Label("设置", systemImage: "gearshape")
                Label("账号管理", systemImage: "person.2")
                Label("关于 TiebaLite", systemImage: "info.circle")
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .navigationTitle("我的")
        .navigationBarTitleDisplayMode(.large)
    }
}

// MARK: - Navigation destinations

private struct ThreadDetailPlaceholderView: View {
    let thread: FeedThreadInfo
    let onImagePress: ([MediaItem], Int) -> Void

    var body: some View {
        ThreadDetailView(
            thread: makeThreadDetail(from: thread),
            posts: placeholderPosts(for: thread),
            onImagePress: onImagePress
        )
    }
}

private struct ImageViewerPlaceholderView: View {
    let route: ImageViewerRoute

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ImageViewerView(images: route.images, initialIndex: route.initialIndex) {
            dismiss()
        }
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
    }
}

private struct ImageViewerRoute: Identifiable, Hashable {
    let id = UUID()
    let images: [MediaItem]
    let initialIndex: Int
}

private struct ShellForumRoute: Identifiable, Hashable {
    let id = UUID()
    let forum: FeedForumInfo
}

private struct ShellUserRoute: Identifiable, Hashable {
    let id = UUID()
    let user: FeedUserInfo
}

private struct ShellTopicRoute: Identifiable, Hashable {
    let id = UUID()
    let topic: FeedTopicInfo
}

private struct DetectedClipboardLink: Identifiable {
    let id = UUID()
    let url: URL
}

// MARK: - Placeholder data

private enum ShellPreviewData {
    static let searchSuggestions = ["iOS 26", "SwiftUI", "iPhone"]
    static let searchHistory = ["毛玻璃", "浏览器"]

    static let topicItems = [
        FeedTopicInfo(
            id: "t1",
            topicName: "iOS 26",
            topicDesc: "新系统讨论",
            discussNum: 35_000,
            isHot: true
        ),
        FeedTopicInfo(
            id: "t2",
            topicName: "SwiftUI",
            topicDesc: "开发分享",
            discussNum: 18_000,
            isHot: false
        ),
    ]

    static let forumItem = FeedItem(
        type: .forum,
        stableKey: "shell-forum-1",
        forumInfo: FeedForumInfo(
            id: "f1",
            forumName: "iOS 开发",
            memberCount: 186_000,
            threadCount: 2_400_000
        )
    )

    static let topicItem = FeedItem(
        type: .topic,
        stableKey: "shell-topic-1",
        topicInfo: FeedTopicInfo(
            id: "t1",
            topicName: "iOS 26",
            topicDesc: "新系统讨论",
            discussNum: 35_000,
            isHot: true
        )
    )

    static let userItem = FeedItem(
        type: .user,
        stableKey: "shell-user-1",
        userInfo: FeedUserInfo(id: "u1", name: "贴吧管理员")
    )

    static let discoverItems: [FeedItem] = [
        PreviewData.feedItems[0],
        forumItem,
        topicItem,
        PreviewData.feedItems[1],
        userItem,
    ]

    static let concernItems: [FeedItem] = [
        PreviewData.feedItems[1],
        forumItem,
    ]

    static let hotItems: [FeedItem] = [
        topicItem,
        PreviewData.feedItems[0],
        PreviewData.feedItems[1],
    ]

    static let replyNotifications = [
        NotificationPlaceholderItem(
            id: "n1",
            title: "数码爱好者 回复了你",
            detail: "确实很流畅，续航也没有明显变差。",
            time: "2 分钟前",
            systemImage: "bubble.left.and.bubble.right.fill"
        ),
        NotificationPlaceholderItem(
            id: "n2",
            title: "果粉小明 回复了你",
            detail: "新系统的毛玻璃效果确实强。",
            time: "1 小时前",
            systemImage: "bubble.left.and.bubble.right.fill"
        ),
    ]

    static let mentionNotifications = [
        NotificationPlaceholderItem(
            id: "n3",
            title: "果粉小明 提到了你",
            detail: "@你 看一下这个新系统。",
            time: "昨天",
            systemImage: "at"
        ),
        NotificationPlaceholderItem(
            id: "n4",
            title: "贴吧管理员 提到了你",
            detail: "你的帖子进入了推荐流。",
            time: "3 天前",
            systemImage: "at"
        ),
    ]
}

// MARK: - Helpers

private func makeThreadDetail(from thread: FeedThreadInfo) -> ThreadDetail {
    ThreadDetail(
        id: thread.id,
        title: thread.title,
        forumName: thread.forumName,
        forumId: thread.forumId,
        authorId: thread.authorId,
        authorName: thread.authorName,
        authorNameShow: thread.authorNameShow,
        authorPortrait: thread.authorPortrait,
        createTime: thread.createTime,
        replyNum: thread.replyNum,
        hasMore: false
    )
}

private func placeholderPosts(for thread: FeedThreadInfo) -> [PostInfo] {
    if PreviewData.posts.contains(where: { $0.threadId == thread.id }) {
        return PreviewData.posts
    }

    return [
        PostInfo(
            id: "\(thread.id)-p1",
            threadId: thread.id,
            floor: 1,
            authorId: thread.authorId,
            authorName: thread.authorName,
            authorNameShow: thread.authorNameShow,
            authorPortrait: thread.authorPortrait,
            createTime: thread.createTime,
            content: [
                .text(thread.abstract.isEmpty ? "帖子正文占位，等待网络层接入后显示真实楼层。" : thread.abstract),
            ],
            agreeNum: thread.zanNum
        ),
    ]
}

private struct FeedActions {
    var onOpenThread: (FeedThreadInfo) -> Void = { _ in }
    var onOpenForum: (FeedForumInfo) -> Void = { _ in }
    var onOpenUser: (FeedUserInfo) -> Void = { _ in }
    var onOpenTopic: (FeedTopicInfo) -> Void = { _ in }
    var onDislike: (FeedItem) -> Void = { _ in }
    var onBlockAuthor: (FeedItem) -> Void = { _ in }
    var onShare: (FeedItem) -> Void = { _ in }
    var onComment: (FeedItem) -> Void = { _ in }
    var onLike: (FeedItem) -> Void = { _ in }
}

// MARK: - Previews

#Preview("App Shell") {
    RootNavigationView(themeName: .tieba, isDark: false)
}

#Preview("App Shell Dark") {
    RootNavigationView(themeName: .blueDark, isDark: true)
}
