import Foundation
import Observation
import SwiftUI

// MARK: - User Profile Models

public struct UserPostInfo: Identifiable, Hashable, Sendable {
    public let id: String
    public var threadId: String
    public var title: String
    public var abstract: String
    public var forumName: String
    public var createTime: TimeInterval
    public var replyNum: Int
    public var post: PostInfo?

    public init(
        id: String,
        threadId: String = "",
        title: String = "",
        abstract: String = "",
        forumName: String = "",
        createTime: TimeInterval = 0,
        replyNum: Int = 0,
        post: PostInfo? = nil
    ) {
        self.id = id
        self.threadId = threadId
        self.title = title
        self.abstract = abstract
        self.forumName = forumName
        self.createTime = createTime
        self.replyNum = replyNum
        self.post = post
    }
}

public struct UserForumInfo: Identifiable, Hashable, Sendable {
    public let id: String
    public var forumName: String
    public var avatar: String
    public var levelName: String
    public var slogan: String
    public var memberCount: Int

    public init(
        id: String,
        forumName: String = "",
        avatar: String = "",
        levelName: String = "",
        slogan: String = "",
        memberCount: Int = 0
    ) {
        self.id = id
        self.forumName = forumName
        self.avatar = avatar
        self.levelName = levelName
        self.slogan = slogan
        self.memberCount = memberCount
    }
}

@Observable
public final class UserProfileViewModel {
    var selectedTab: UserProfileView.UserProfileTab = .posts
    var isBlocked: Bool
    var showsPermissionSettings = false
    var canMessage = true
    var canFollow = true
    var canReply = true

    init(isBlocked: Bool) {
        self.isBlocked = isBlocked
    }
}

// MARK: - User Profile Screen

public struct UserProfileView: View {
    public enum UserProfileTab: String, CaseIterable, Identifiable, Hashable {
        case posts = "帖子"
        case replies = "回复"
        case forums = "关注的吧"

        public var id: String { rawValue }
        public var title: String { rawValue }
    }

    public let uid: String
    public let name: String
    public let nameShow: String
    public let portrait: String
    public let levelId: Int
    public let fansNum: Int
    public let concernNum: Int
    public let postNum: Int
    public let intro: String
    public var gender: String?
    public var ipLocation: String?
    public var regTime: TimeInterval

    public let posts: [UserPostInfo]
    public let replies: [UserPostInfo]
    public let forums: [UserForumInfo]

    public var isFollowing: Bool
    public var isOwnProfile: Bool
    public var isLoggedIn: Bool
    // isBlocked 由 UserProfile.isBlocked 回读（ServiceContracts.swift 已定义字段）。
    public var isBlocked: Bool
    public var isLoading: Bool
    public var isLoadingMore: Bool
    public var hasMore: Bool
    public var errorMessage: String?

    public let onOpenPost: (PostInfo) -> Void
    public let onOpenThread: (String) -> Void
    public let onOpenForum: (String) -> Void
    public let onLoadMore: () -> Void
    public let onRefresh: () async -> Void
    public let onFollowUser: () -> Void
    public let onUnfollowUser: () -> Void
    public let onCopyUID: () -> Void
    public let onMessage: () -> Void
    public let onBlock: () -> Void
    public let onTabChange: (UserProfileTab) -> Void
    public let onRetry: () -> Void

    @Environment(\.appTheme) private var theme
    @State private var viewModel: UserProfileViewModel
    @State private var didRequestLoadMore = false

    public init(
        uid: String,
        name: String = "",
        nameShow: String = "",
        portrait: String = "",
        levelId: Int = 0,
        fansNum: Int = 0,
        concernNum: Int = 0,
        postNum: Int = 0,
        intro: String = "",
        gender: String? = nil,
        ipLocation: String? = nil,
        regTime: TimeInterval = 0,
        posts: [UserPostInfo] = [],
        replies: [UserPostInfo] = [],
        forums: [UserForumInfo] = [],
        isFollowing: Bool = false,
        isOwnProfile: Bool = false,
        isLoggedIn: Bool = true,
        isBlocked: Bool = false,
        isLoading: Bool = false,
        isLoadingMore: Bool = false,
        hasMore: Bool = true,
        errorMessage: String? = nil,
        onOpenPost: @escaping (PostInfo) -> Void = { _ in },
        onOpenThread: @escaping (String) -> Void = { _ in },
        onOpenForum: @escaping (String) -> Void = { _ in },
        onLoadMore: @escaping () -> Void = {},
        onRefresh: @escaping () async -> Void = {},
        onFollowUser: @escaping () -> Void = {},
        onUnfollowUser: @escaping () -> Void = {},
        onCopyUID: @escaping () -> Void = {},
        onMessage: @escaping () -> Void = {},
        onBlock: @escaping () -> Void = {},
        onTabChange: @escaping (UserProfileTab) -> Void = { _ in },
        onRetry: @escaping () -> Void = {}
    ) {
        self.uid = uid
        self.name = name
        self.nameShow = nameShow
        self.portrait = portrait
        self.levelId = levelId
        self.fansNum = fansNum
        self.concernNum = concernNum
        self.postNum = postNum
        self.intro = intro
        self.gender = gender
        self.ipLocation = ipLocation
        self.regTime = regTime
        self.posts = posts
        self.replies = replies
        self.forums = forums
        self.isFollowing = isFollowing
        self.isOwnProfile = isOwnProfile
        self.isLoggedIn = isLoggedIn
        self.isBlocked = isBlocked
        self.isLoading = isLoading
        self.isLoadingMore = isLoadingMore
        self.hasMore = hasMore
        self.errorMessage = errorMessage
        self.onOpenPost = onOpenPost
        self.onOpenThread = onOpenThread
        self.onOpenForum = onOpenForum
        self.onLoadMore = onLoadMore
        self.onRefresh = onRefresh
        self.onFollowUser = onFollowUser
        self.onUnfollowUser = onUnfollowUser
        self.onCopyUID = onCopyUID
        self.onMessage = onMessage
        self.onBlock = onBlock
        self.onTabChange = onTabChange
        self.onRetry = onRetry
        _viewModel = State(initialValue: UserProfileViewModel(isBlocked: isBlocked))
    }

    public var body: some View {
        @Bindable var viewModel = viewModel

        VStack(spacing: 0) {
            Picker("内容", selection: $viewModel.selectedTab) {
                ForEach(availableTabs) { tab in
                    Text(tab.title)
                        .tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(theme.windowBackground)
            .onChange(of: viewModel.selectedTab) { _, newValue in
                didRequestLoadMore = false
                onTabChange(newValue)
            }

            content
        }
        .background(theme.background)
        .navigationTitle(displayName)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $viewModel.showsPermissionSettings) {
            @Bindable var viewModel = viewModel
            NavigationStack {
                List {
                    Section("权限设置") {
                        Toggle("允许私信", isOn: $viewModel.canMessage)
                        Toggle("允许关注", isOn: $viewModel.canFollow)
                        Toggle("允许回复", isOn: $viewModel.canReply)
                    } footer: {
                        Text("原型占位，仅保留当前界面状态")
                    }
                }
                .navigationTitle("权限设置")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("完成") {
                            viewModel.showsPermissionSettings = false
                        }
                    }
                }
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
            }
        }
    }

    private var availableTabs: [UserProfileTab] {
        // 对齐 Kotlin：非本人主页不显示“回复”tab
        isOwnProfile ? UserProfileTab.allCases : UserProfileTab.allCases.filter { $0 != .replies }
    }

    private var content: some View {
        // 三个 tab 各自持有独立 List，保留滚动位置；opacity/hit-test 仅做切换。
        ZStack {
            profileList(for: .posts)
                .opacity(viewModel.selectedTab == .posts ? 1 : 0)
                .allowsHitTesting(viewModel.selectedTab == .posts)
            profileList(for: .replies)
                .opacity(viewModel.selectedTab == .replies ? 1 : 0)
                .allowsHitTesting(viewModel.selectedTab == .replies)
            profileList(for: .forums)
                .opacity(viewModel.selectedTab == .forums ? 1 : 0)
                .allowsHitTesting(viewModel.selectedTab == .forums)
        }
        .background(theme.background)
    }

    private func profileList(for tab: UserProfileTab) -> some View {
        List {
            Section {
                UserProfileHeaderCard(
                    name: name,
                    nameShow: nameShow,
                    portrait: portrait,
                    levelId: levelId,
                    fansNum: fansNum,
                    concernNum: concernNum,
                    postNum: postNum,
                    intro: intro,
                    gender: gender,
                    ipLocation: ipLocation,
                    regTime: regTime,
                    uid: uid,
                    isFollowing: isFollowing,
                    isOwnProfile: isOwnProfile,
                    isLoggedIn: isLoggedIn,
                    isBlocked: viewModel.isBlocked,
                    onFollowUser: onFollowUser,
                    onUnfollowUser: onUnfollowUser,
                    onCopyUID: onCopyUID,
                    onMessage: {
                        onMessage()
                        viewModel.showsPermissionSettings = true
                    },
                    onBlock: {
                        viewModel.isBlocked.toggle()
                        onBlock()
                    }
                )
                .listRowInsets(EdgeInsets(top: 12, leading: 12, bottom: 6, trailing: 12))
                .listRowSeparator(.hidden)
                .listRowBackground(theme.background)
            }

            Section {
                if let errorMessage, !errorMessage.isEmpty, currentItemsEmpty(for: tab) {
                    errorRow(message: errorMessage)
                } else if isLoading && currentItemsEmpty(for: tab) {
                    loadingRow
                } else if currentItemsEmpty(for: tab) {
                    emptyRow
                } else {
                    tabRows(for: tab)

                    loadMoreFooter(for: tab)
                        .listRowInsets(EdgeInsets())
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .refreshable {
            await onRefresh()
        }
    }

    @ViewBuilder
    private func tabRows(for tab: UserProfileTab) -> some View {
        switch tab {
        case .posts:
            ForEach(posts) { post in
                UserPostRow(
                    post: post,
                    onOpenPost: onOpenPost,
                    onOpenThread: onOpenThread
                )
                .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
                .listRowSeparator(.hidden)
                .listRowBackground(theme.background)
            }
        case .replies:
            ForEach(replies) { post in
                UserPostRow(
                    post: post,
                    onOpenPost: onOpenPost,
                    onOpenThread: onOpenThread
                )
                .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
                .listRowSeparator(.hidden)
                .listRowBackground(theme.background)
            }
        case .forums:
            ForEach(forums) { forum in
                UserForumRow(
                    forum: forum,
                    onOpenForum: onOpenForum
                )
                .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
                .listRowSeparator(.hidden)
                .listRowBackground(theme.background)
            }
        }
    }

    private func loadMoreFooter(for tab: UserProfileTab) -> some View {
        UserLoadMoreFooterView(
            isLoadingMore: isLoadingMore,
            hasMore: hasMore,
            onLoadMore: onLoadMore
        )
        .onAppear {
            guard viewModel.selectedTab == tab,
                  hasMore,
                  !isLoadingMore,
                  !didRequestLoadMore else { return }
            didRequestLoadMore = true
            onLoadMore()
        }
    }

    private func errorRow(message: String) -> some View {
        ContentUnavailableView {
            Label("加载失败", systemImage: "wifi.exclamationmark")
        } description: {
            Text(message)
        } actions: {
            Button("重试") {
                onRetry()
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
        .listRowInsets(EdgeInsets())
        .listRowSeparator(.hidden)
        .listRowBackground(theme.background)
    }

    private var loadingRow: some View {
        ProgressView("加载中")
            .frame(maxWidth: .infinity)
            .padding(.vertical, 64)
            .listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
            .listRowBackground(theme.background)
    }

    private var emptyRow: some View {
        ContentUnavailableView("暂无内容", systemImage: "tray")
            .frame(maxWidth: .infinity)
            .padding(.vertical, 48)
            .listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
            .listRowBackground(theme.background)
    }

    private func currentItemsEmpty(for tab: UserProfileTab) -> Bool {
        switch tab {
        case .posts:
            return posts.isEmpty
        case .replies:
            return replies.isEmpty
        case .forums:
            return forums.isEmpty
        }
    }

    private var displayName: String {
        nameShow.isEmpty ? name : nameShow
    }
}

// MARK: - Post Row

public struct UserPostRow: View {
    public let post: UserPostInfo
    public let onOpenPost: (PostInfo) -> Void
    public let onOpenThread: (String) -> Void

    @Environment(\.appTheme) private var theme

    public init(
        post: UserPostInfo,
        onOpenPost: @escaping (PostInfo) -> Void = { _ in },
        onOpenThread: @escaping (String) -> Void = { _ in }
    ) {
        self.post = post
        self.onOpenPost = onOpenPost
        self.onOpenThread = onOpenThread
    }

    public var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 6) {
                Text(post.title.isEmpty ? "无标题" : post.title)
                    .font(.headline)
                    .foregroundStyle(theme.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                if !post.abstract.isEmpty {
                    Text(post.abstract)
                        .font(.subheadline)
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }

                HStack(spacing: 8) {
                    if !post.forumName.isEmpty {
                        Text(forumDisplayName)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(theme.onChip)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(theme.chip, in: Capsule())
                    }

                    Text(relativeTime(post.createTime))
                        .font(.caption)
                        .foregroundStyle(theme.textTertiary)

                    Spacer(minLength: 4)

                    Label(formatCount(post.replyNum), systemImage: "bubble.right")
                        .font(.caption)
                        .foregroundStyle(theme.textTertiary)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(theme.card, in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }

    private func open() {
        if let postInfo = post.post {
            onOpenPost(postInfo)
        } else {
            onOpenThread(post.threadId)
        }
    }

    private var forumDisplayName: String {
        post.forumName.hasSuffix("吧") ? post.forumName : "\(post.forumName)吧"
    }
}

// MARK: - Followed Forum Row

public struct UserForumRow: View {
    public let forum: UserForumInfo
    public let onOpenForum: (String) -> Void

    @Environment(\.appTheme) private var theme

    public init(
        forum: UserForumInfo,
        onOpenForum: @escaping (String) -> Void = { _ in }
    ) {
        self.forum = forum
        self.onOpenForum = onOpenForum
    }

    public var body: some View {
        Button {
            onOpenForum(forum.forumName.isEmpty ? forum.id : forum.forumName)
        } label: {
            HStack(spacing: 12) {
                UserAvatarView(
                    urlString: forum.avatar,
                    fallbackText: forum.forumName,
                    size: 36,
                    levelId: 0
                )

                VStack(alignment: .leading, spacing: 3) {
                    Text(forumDisplayName)
                        .font(.headline)
                        .foregroundStyle(theme.text)
                        .lineLimit(1)

                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 8)

                if forum.memberCount > 0 {
                    Text("\(formatCount(forum.memberCount)) 人关注")
                        .font(.caption2)
                        .foregroundStyle(theme.textTertiary)
                }

                Image(systemName: "chevron.right")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(theme.textTertiary)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(theme.card, in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }

    private var forumDisplayName: String {
        forum.forumName.hasSuffix("吧") ? forum.forumName : "\(forum.forumName)吧"
    }

    private var subtitle: String {
        if !forum.levelName.isEmpty {
            return forum.levelName
        }
        if !forum.slogan.isEmpty {
            return forum.slogan
        }
        return "已关注"
    }
}

// MARK: - Profile Header Card

private struct UserProfileHeaderCard: View {
    let name: String
    let nameShow: String
    let portrait: String
    let levelId: Int
    let fansNum: Int
    let concernNum: Int
    let postNum: Int
    let intro: String
    let gender: String?
    let ipLocation: String?
    let regTime: TimeInterval
    let uid: String
    let isFollowing: Bool
    let isOwnProfile: Bool
    let isLoggedIn: Bool
    let isBlocked: Bool
    let onFollowUser: () -> Void
    let onUnfollowUser: () -> Void
    let onCopyUID: () -> Void
    let onMessage: () -> Void
    let onBlock: () -> Void

    @Environment(\.appTheme) private var theme
    @State private var showsAvatarPreview = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header
            statsRow
            introText
            chips

            if isLoggedIn {
                actionButtons
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.card, in: RoundedRectangle(cornerRadius: 12))
        .sheet(isPresented: $showsAvatarPreview) {
            ImageViewerView(
                images: [MediaItem(src: portrait)],
                initialIndex: 0,
                watermarkSubtitle: displayName,
                onClose: {
                    showsAvatarPreview = false
                }
            )
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 14) {
            if validURL(portrait) != nil {
                Button {
                    showsAvatarPreview = true
                } label: {
                    UserAvatarView(
                        urlString: portrait,
                        fallbackText: displayName,
                        size: 80,
                        levelId: levelId
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel("查看头像大图")
            } else {
                UserAvatarView(
                    urlString: portrait,
                    fallbackText: displayName,
                    size: 80,
                    levelId: levelId
                )
            }

            VStack(alignment: .leading, spacing: 5) {
                Text(displayName)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(theme.text)
                    .lineLimit(1)

                Text(levelText)
                    .font(.caption)
                    .foregroundStyle(theme.textSecondary)
            }

            Spacer(minLength: 0)
        }
    }

    private var statsRow: some View {
        HStack(spacing: 0) {
            stat(value: formatCount(concernNum), title: "关注")
            statDivider
            stat(value: formatCount(fansNum), title: "粉丝")
            statDivider
            stat(value: formatCount(postNum), title: "帖子")
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(theme.surfaceSecondary, in: RoundedRectangle(cornerRadius: 10))
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

    private var introText: some View {
        Text(intro.isEmpty ? "这个人很懒，什么都没留下" : intro)
            .font(.subheadline)
            .foregroundStyle(theme.textSecondary)
            .lineLimit(3)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var chips: some View {
        let items = buildChips()
        if !items.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(items.indices, id: \.self) { index in
                        let chip = items[index]
                        switch chip {
                        case .uid(let value):
                            Button(action: onCopyUID) {
                                chipLabel(systemImage: "doc.on.doc", text: value)
                            }
                            .buttonStyle(.plain)
                        case .text(let icon, let text, let color):
                            chipLabel(systemImage: icon, text: text, color: color)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var actionButtons: some View {
        VStack(alignment: .leading, spacing: 8) {
            if isOwnProfile {
                HStack(spacing: 8) {
                    messageButton
                }
            } else {
                HStack(spacing: 8) {
                    followButton
                    blockButton
                    messageButton
                }
            }

            if isBlocked {
                Label("已拉黑，无法发送私信", systemImage: "lock.fill")
                    .font(.caption)
                    .foregroundStyle(theme.textTertiary)
            }
        }
    }

    private var followButton: some View {
        Button {
            if isFollowing {
                onUnfollowUser()
            } else {
                onFollowUser()
            }
        } label: {
            Text(isFollowing ? "已关注" : "关注")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(isFollowing ? theme.textSecondary : theme.textOnPrimary)
                .padding(.horizontal, 16)
                .padding(.vertical, 7)
                .frame(maxWidth: .infinity)
                .background(isFollowing ? theme.surfaceTertiary : theme.primary, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private var blockButton: some View {
        Button(action: onBlock) {
            Text(isBlocked ? "已拉黑" : "拉黑")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(isBlocked ? theme.textTertiary : theme.textSecondary)
                .padding(.horizontal, 16)
                .padding(.vertical, 7)
                .frame(maxWidth: .infinity)
                .background(theme.surfaceSecondary, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private var messageButton: some View {
        Button(action: onMessage) {
            Label("私信", systemImage: isBlocked ? "lock.fill" : "bubble.left.and.bubble.right")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(theme.textSecondary)
                .padding(.horizontal, 16)
                .padding(.vertical, 7)
                .frame(maxWidth: .infinity)
                .background(theme.surfaceSecondary, in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isBlocked)
        .opacity(isBlocked ? 0.55 : 1)
        .accessibilityHint(isBlocked ? "对方已拉黑，无法发送私信" : "发送私信")
    }

    private func chipLabel(systemImage: String, text: String, color: Color = .primary) -> some View {
        HStack(spacing: 4) {
            Image(systemName: systemImage)
                .font(.caption2)
            Text(text)
                .font(.caption)
                .lineLimit(1)
        }
        .foregroundStyle(color)
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(theme.chip, in: Capsule())
        .fixedSize()
    }

    private func buildChips() -> [ProfileChip] {
        var result: [ProfileChip] = [.uid(uid)]

        if let gender {
            let icon: String
            let color: Color
            switch gender {
            case "男":
                icon = "figure.stand"
                color = Color(hex: 0x0A84FF)
            case "女":
                icon = "figure.stand.dress"
                color = Color(hex: 0xFF375F)
            default:
                icon = "person.fill"
                color = theme.textSecondary
            }
            result.append(.text(icon: icon, text: gender, color: color))
        }

        if let ipLocation, !ipLocation.isEmpty {
            result.append(.text(icon: "location.fill", text: ipLocation, color: theme.textSecondary))
        }

        if let age = forumAge {
            result.append(.text(icon: "calendar", text: age, color: theme.textSecondary))
        }

        return result
    }

    private var forumAge: String? {
        guard regTime > 0 else { return nil }
        let years = Int(max(0, Date().timeIntervalSince1970 - regTime) / 31_536_000)
        return years >= 1 ? "\(years)年吧龄" : "1年内"
    }

    private var displayName: String {
        nameShow.isEmpty ? name : nameShow
    }

    private var levelText: String {
        levelId > 0 ? "Lv.\(levelId)" : "未设置等级"
    }

    private enum ProfileChip {
        case uid(String)
        case text(icon: String, text: String, color: Color)
    }
}

// MARK: - Shared Avatar

private struct UserAvatarView: View {
    let urlString: String
    let fallbackText: String
    let size: CGFloat
    let levelId: Int

    @Environment(\.appTheme) private var theme

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Group {
                if let url = validURL(urlString) {
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

            if levelId > 0 {
                Text("Lv.\(levelId)")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(theme.primary, in: Capsule())
                    .overlay {
                        Capsule()
                            .stroke(theme.card, lineWidth: 1)
                    }
                    .offset(x: 3, y: 3)
            }
        }
        .frame(width: size, height: size)
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

// MARK: - Load More Footer

private struct UserLoadMoreFooterView: View {
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

// MARK: - Preview

private enum UserPreviewData {
    static let posts: [UserPostInfo] = [
        UserPostInfo(
            id: "u-post-1",
            threadId: "1",
            title: "iOS 26 毛玻璃效果太强了",
            abstract: "新的 Liquid Glass 在贴吧里滚动非常流畅，帧率稳定。",
            forumName: "苹果",
            createTime: Date().timeIntervalSince1970 - 3_600,
            replyNum: 128,
            post: PreviewData.posts[0]
        ),
        UserPostInfo(
            id: "u-post-2",
            threadId: "2",
            title: "求推荐一个好用的浏览器",
            abstract: "想要轻量、隐私好一点的，最好支持扩展。",
            forumName: "数码",
            createTime: Date().timeIntervalSince1970 - 86_400,
            replyNum: 42,
            post: PreviewData.posts[1]
        ),
    ]

    static let replies: [UserPostInfo] = [
        UserPostInfo(
            id: "u-reply-1",
            threadId: "1",
            title: "回复：iOS 26 毛玻璃效果太强了",
            abstract: "确实很流畅，续航也没有明显变差。",
            forumName: "苹果",
            createTime: Date().timeIntervalSince1970 - 3_600,
            replyNum: 8,
            post: PreviewData.posts[1]
        ),
    ]

    static let forums: [UserForumInfo] = [
        UserForumInfo(
            id: "f1",
            forumName: "苹果",
            avatar: "https://example.com/forum1.png",
            levelName: "Lv.9",
            slogan: "iOS 与 macOS 交流",
            memberCount: 1_200_000
        ),
        UserForumInfo(
            id: "f2",
            forumName: "数码",
            avatar: "https://example.com/forum2.png",
            levelName: "Lv.7",
            slogan: "数码产品讨论",
            memberCount: 860_000
        ),
    ]
}

#Preview("用户主页") {
    NavigationStack {
        UserProfileView(
            uid: "1001",
            name: "apple_fan",
            nameShow: "果粉小明",
            portrait: "https://example.com/avatar.jpg",
            levelId: 12,
            fansNum: 12_800,
            concernNum: 86,
            postNum: 42,
            intro: "喜欢研究新系统，偶尔分享数码与生活。",
            gender: "男",
            ipLocation: "北京",
            regTime: Date().timeIntervalSince1970 - 252_288_000,
            posts: UserPreviewData.posts,
            replies: UserPreviewData.replies,
            forums: UserPreviewData.forums,
            isFollowing: true
        )
    }
    .environment(\.appTheme, .lightPalette)
}
