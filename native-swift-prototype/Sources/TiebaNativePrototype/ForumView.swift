import Foundation
import SwiftUI

// MARK: - Forum List

public enum ForumSegment: String, CaseIterable, Identifiable, Hashable, Sendable {
    case hot
    case latest
    case good

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .hot: return "热门"
        case .latest: return "最新"
        case .good: return "精品"
        }
    }
}

public struct ForumClassifyOption: Identifiable, Hashable, Sendable {
    public let id: String
    public var name: String

    public init(id: String, name: String = "") {
        self.id = id
        self.name = name
    }
}

public struct ForumListView: View {
    public let forumName: String
    public let forumAvatar: String
    public let forumId: String
    public let threads: [FeedThreadInfo]
    public let forumMemberCount: Int
    public let forumThreadCount: Int
    public let isFollowing: Bool
    public let isSignedIn: Bool
    public let signInDays: Int
    public let goodClassifies: [ForumClassifyOption]
    public let selectedClassifyID: String?
    public let isLoadingMore: Bool
    public let hasMore: Bool

    public let onRefresh: () async -> Void
    public let onLoadMore: () -> Void
    public let onOpenThread: (FeedThreadInfo) -> Void
    public let onOpenUser: (FeedThreadInfo) -> Void
    public let onOpenForumDetail: () -> Void
    public let onLike: (FeedThreadInfo) -> Void
    public let onReply: (FeedThreadInfo) -> Void
    public let onShare: (FeedThreadInfo) -> Void
    public let onSearch: () -> Void
    public let onSignIn: () async -> Void
    public let onFollow: () -> Void
    public let onUnfollow: () -> Void
    public let onCompose: () -> Void
    public let onShareForum: () -> Void
    public let onCopyForumLink: () -> Void
    public let onSegmentChange: (ForumSegment) -> Void
    public let onClassifyChange: (String?) -> Void

    @Environment(\.appTheme) private var theme
    @State private var selectedSegment: ForumSegment
    @State private var showsClassifyPicker = false
    @State private var lastRequestedThreadID: String?
    @State private var didTriggerInitialLoad = false

    public init(
        forumName: String,
        forumAvatar: String,
        forumId: String,
        threads: [FeedThreadInfo] = [],
        forumMemberCount: Int = 0,
        forumThreadCount: Int = 0,
        isFollowing: Bool = false,
        isSignedIn: Bool = false,
        signInDays: Int = 0,
        goodClassifies: [ForumClassifyOption] = [],
        selectedClassifyID: String? = nil,
        isLoadingMore: Bool = false,
        hasMore: Bool = true,
        initialSegment: ForumSegment = .hot,
        onRefresh: @escaping () async -> Void = {},
        onLoadMore: @escaping () -> Void = {},
        onOpenThread: @escaping (FeedThreadInfo) -> Void = { _ in },
        onOpenUser: @escaping (FeedThreadInfo) -> Void = { _ in },
        onOpenForumDetail: @escaping () -> Void = {},
        onLike: @escaping (FeedThreadInfo) -> Void = { _ in },
        onReply: @escaping (FeedThreadInfo) -> Void = { _ in },
        onShare: @escaping (FeedThreadInfo) -> Void = { _ in },
        onSearch: @escaping () -> Void = {},
        onSignIn: @escaping () async -> Void = {},
        onFollow: @escaping () -> Void = {},
        onUnfollow: @escaping () -> Void = {},
        onCompose: @escaping () -> Void = {},
        onShareForum: @escaping () -> Void = {},
        onCopyForumLink: @escaping () -> Void = {},
        onSegmentChange: @escaping (ForumSegment) -> Void = { _ in },
        onClassifyChange: @escaping (String?) -> Void = { _ in }
    ) {
        self.forumName = forumName
        self.forumAvatar = forumAvatar
        self.forumId = forumId
        self.threads = threads
        self.forumMemberCount = forumMemberCount
        self.forumThreadCount = forumThreadCount
        self.isFollowing = isFollowing
        self.isSignedIn = isSignedIn
        self.signInDays = signInDays
        self.goodClassifies = goodClassifies
        self.selectedClassifyID = selectedClassifyID
        self.isLoadingMore = isLoadingMore
        self.hasMore = hasMore
        self.onRefresh = onRefresh
        self.onLoadMore = onLoadMore
        self.onOpenThread = onOpenThread
        self.onOpenUser = onOpenUser
        self.onOpenForumDetail = onOpenForumDetail
        self.onLike = onLike
        self.onReply = onReply
        self.onShare = onShare
        self.onSearch = onSearch
        self.onSignIn = onSignIn
        self.onFollow = onFollow
        self.onUnfollow = onUnfollow
        self.onCompose = onCompose
        self.onShareForum = onShareForum
        self.onCopyForumLink = onCopyForumLink
        self.onSegmentChange = onSegmentChange
        self.onClassifyChange = onClassifyChange
        _selectedSegment = State(initialValue: initialSegment)
    }

    public var body: some View {
        List {
            Section {
                ForumHeaderCard(
                    forumName: forumName,
                    forumAvatar: forumAvatar,
                    forumId: forumId,
                    memberCount: forumMemberCount,
                    threadCount: forumThreadCount,
                    isFollowing: isFollowing,
                    isSignedIn: isSignedIn,
                    signInDays: signInDays,
                    onOpenDetail: onOpenForumDetail,
                    onSearch: onSearch,
                    onSignIn: onSignIn,
                    onFollow: onFollow,
                    onUnfollow: onUnfollow,
                    onShareForum: onShareForum,
                    onCopyForumLink: onCopyForumLink
                )
                .listRowInsets(EdgeInsets(top: 10, leading: 12, bottom: 8, trailing: 12))
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            }

            Section {
                Picker("帖子排序", selection: $selectedSegment) {
                    ForEach(ForumSegment.allCases) { segment in
                        Text(segment.title)
                            .tag(segment)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .padding(.vertical, 8)

                if selectedSegment == .good {
                    classifyRow
                }
            }
            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 8, trailing: 16))
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)

            if threads.isEmpty {
                Section {
                    ContentUnavailableView("暂无帖子", systemImage: "tray")
                        .frame(maxWidth: .infinity)
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
            } else {
                Section {
                    ForEach(threads) { thread in
                        ForumThreadRow(
                            thread: thread,
                            onOpenThread: { onOpenThread(thread) },
                            onOpenUser: { onOpenUser(thread) },
                            onOpenForum: onOpenForumDetail,
                            onLike: { onLike(thread) },
                            onReply: { onReply(thread) },
                            onShare: { onShare(thread) }
                        )
                        .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .onAppear {
                            requestLoadMoreIfNeeded(for: thread)
                        }
                    }

                    if hasMore {
                        HStack(spacing: 8) {
                            ProgressView()
                                .controlSize(.small)
                            Text(isLoadingMore ? "加载中" : "上拉加载更多")
                                .font(.footnote)
                                .foregroundStyle(theme.textSecondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .onAppear {
                            requestLoadMoreForLastThread()
                        }
                    } else {
                        Text("没有更多了")
                            .font(.footnote)
                            .foregroundStyle(theme.textTertiary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .refreshable {
            await onRefresh()
        }
        .onAppear {
            guard threads.isEmpty, hasMore, !isLoadingMore, !didTriggerInitialLoad else { return }
            didTriggerInitialLoad = true
            onLoadMore()
        }
        .onChange(of: selectedSegment) { _, newValue in
            onSegmentChange(newValue)
        }
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button(action: onCompose) {
                    Image(systemName: "square.and.pencil")
                }
                Button(action: onSearch) {
                    Image(systemName: "magnifyingglass")
                }
            }
        }
        .navigationTitle(forumName)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showsClassifyPicker) {
            ForumClassifyPickerSheet(
                options: goodClassifies,
                selectedID: selectedClassifyID,
                onSelect: { id in
                    onClassifyChange(id)
                    showsClassifyPicker = false
                },
                onCancel: {
                    showsClassifyPicker = false
                }
            )
        }
    }

    private var classifyRow: some View {
        HStack(spacing: 10) {
            if let selectedClassifyID,
               let option = goodClassifies.first(where: { $0.id == selectedClassifyID }) {
                Button {
                    onClassifyChange(nil)
                } label: {
                    Label(option.name, systemImage: "xmark.circle.fill")
                        .font(.footnote.weight(.medium))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(theme.chip)
                        .foregroundStyle(theme.onChip)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }

            Button {
                showsClassifyPicker = true
            } label: {
                Label("分类", systemImage: "line.3.horizontal.decrease.circle")
                    .font(.footnote.weight(.medium))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(theme.surfaceSecondary)
                    .foregroundStyle(theme.textSecondary)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)

            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
    }

    private func requestLoadMoreIfNeeded(for thread: FeedThreadInfo) {
        guard thread.id == threads.last?.id else { return }
        requestLoadMoreForLastThread()
    }

    private func requestLoadMoreForLastThread() {
        guard let lastID = threads.last?.id, lastID != lastRequestedThreadID else { return }
        lastRequestedThreadID = lastID
        guard hasMore, !isLoadingMore else { return }
        onLoadMore()
    }
}

private struct ForumHeaderCard: View {
    let forumName: String
    let forumAvatar: String
    let forumId: String
    let memberCount: Int
    let threadCount: Int
    let isFollowing: Bool
    let isSignedIn: Bool
    let signInDays: Int
    let onOpenDetail: () -> Void
    let onSearch: () -> Void
    let onSignIn: () async -> Void
    let onFollow: () -> Void
    let onUnfollow: () -> Void
    let onShareForum: () -> Void
    let onCopyForumLink: () -> Void

    @Environment(\.appTheme) private var theme
    @State private var showsUnfollowConfirmation = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Button(action: onOpenDetail) {
                    ForumAvatarView(urlString: forumAvatar, fallbackText: forumName, size: 64)
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: 4) {
                    Button(action: onOpenDetail) {
                        Text("\(forumName)吧")
                            .font(.title3.weight(.bold))
                            .foregroundStyle(theme.text)
                            .lineLimit(1)
                    }
                    .buttonStyle(.plain)

                    Text("吧ID \(forumId)")
                        .font(.caption)
                        .foregroundStyle(theme.textTertiary)
                        .lineLimit(1)

                    Text("\(forumCompactCount(memberCount)) 关注 · \(forumCompactCount(threadCount)) 主题")
                        .font(.caption)
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 4)

                Menu {
                    Button {
                        onShareForum()
                    } label: {
                        Label("分享", systemImage: "square.and.arrow.up")
                    }

                    Button {
                        onCopyForumLink()
                    } label: {
                        Label("复制链接", systemImage: "doc.on.doc")
                    }

                    if isFollowing {
                        Button(role: .destructive) {
                            showsUnfollowConfirmation = true
                        } label: {
                            Label("取消关注", systemImage: "heart.slash")
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(theme.textSecondary)
                        .frame(width: 34, height: 34)
                        .contentShape(Rectangle())
                }
            }

            HStack(spacing: 8) {
                Button {
                    if isFollowing {
                        Task { await onSignIn() }
                    } else {
                        onFollow()
                    }
                } label: {
                    Label(primaryActionTitle, systemImage: primaryActionIcon)
                        .font(.footnote.weight(.semibold))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .tint(isFollowing ? theme.primary : theme.accent)

                Button(action: onSearch) {
                    Image(systemName: "magnifyingglass")
                        .font(.footnote.weight(.semibold))
                        .frame(width: 34, height: 34)
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.circle)
                .tint(theme.primary)
            }
        }
        .padding(14)
        .background(theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(theme.border, lineWidth: 0.5)
        }
        .confirmationDialog(
            "取消关注",
            isPresented: $showsUnfollowConfirmation,
            titleVisibility: .visible
        ) {
            Button("取消关注", role: .destructive) {
                onUnfollow()
            }
            Button("取消", role: .cancel) {}
        } message: {
            Text("取消关注后将不再显示该吧内容")
        }
    }

    private var primaryActionTitle: String {
        if !isFollowing {
            return "关注"
        }
        if isSignedIn {
            return signInDays > 0 ? "已签到 \(signInDays) 天" : "已签到"
        }
        return "签到"
    }

    private var primaryActionIcon: String {
        if !isFollowing {
            return "plus"
        }
        return isSignedIn ? "checkmark.seal.fill" : "checkmark.seal"
    }
}

private struct ForumThreadRow: View {
    let thread: FeedThreadInfo
    let onOpenThread: (FeedThreadInfo) -> Void
    let onOpenUser: (FeedThreadInfo) -> Void
    let onOpenForum: () -> Void
    let onLike: (FeedThreadInfo) -> Void
    let onReply: (FeedThreadInfo) -> Void
    let onShare: (FeedThreadInfo) -> Void

    var body: some View {
        FeedCardView(
            item: FeedItem(
                type: .thread,
                stableKey: thread.id,
                threadInfo: thread
            ),
            onOpenThread: { _ in onOpenThread(thread) },
            onOpenForum: { _ in onOpenForum() },
            onOpenUser: { _ in onOpenUser(thread) },
            onShare: { _ in onShare(thread) },
            onComment: { _ in onReply(thread) },
            onLike: { _ in onLike(thread) }
        )
    }
}

private struct ForumClassifyPickerSheet: View {
    let options: [ForumClassifyOption]
    let selectedID: String?
    let onSelect: (String?) -> Void
    let onCancel: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        NavigationStack {
            List {
                Section("精品分类") {
                    Button {
                        onSelect(nil)
                    } label: {
                        HStack {
                            Text("全部")
                                .foregroundStyle(theme.text)
                            Spacer()
                            if selectedID == nil {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(theme.primary)
                            }
                        }
                    }

                    ForEach(options) { option in
                        Button {
                            onSelect(option.id)
                        } label: {
                            HStack {
                                Text(option.name)
                                    .foregroundStyle(theme.text)
                                Spacer()
                                if selectedID == option.id {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(theme.primary)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("精品分类")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("取消", action: onCancel)
                }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }
}

// MARK: - Forum Detail, Members, Bawu, Rules

public struct ForumDetailInfo: Identifiable, Hashable, Sendable {
    public let id: String
    public var forumName: String
    public var avatar: String
    public var slogan: String
    public var intro: String
    public var memberCount: Int
    public var threadCount: Int
    public var postCount: Int?
    public var isFollowing: Bool
    public var hotText: String
    public var recomReason: String

    public init(
        id: String,
        forumName: String = "",
        avatar: String = "",
        slogan: String = "",
        intro: String = "",
        memberCount: Int = 0,
        threadCount: Int = 0,
        postCount: Int? = nil,
        isFollowing: Bool = false,
        hotText: String = "",
        recomReason: String = ""
    ) {
        self.id = id
        self.forumName = forumName
        self.avatar = avatar
        self.slogan = slogan
        self.intro = intro
        self.memberCount = memberCount
        self.threadCount = threadCount
        self.postCount = postCount
        self.isFollowing = isFollowing
        self.hotText = hotText
        self.recomReason = recomReason
    }
}

public struct ForumMember: Identifiable, Hashable, Sendable {
    public let id: String
    public var name: String
    public var nameShow: String
    public var portrait: String
    public var level: Int
    public var levelName: String

    public init(
        id: String,
        name: String = "",
        nameShow: String = "",
        portrait: String = "",
        level: Int = 0,
        levelName: String = ""
    ) {
        self.id = id
        self.name = name
        self.nameShow = nameShow
        self.portrait = portrait
        self.level = level
        self.levelName = levelName
    }
}

public struct ForumMemberGroup: Identifiable, Hashable, Sendable {
    public let id: String
    public var type: String
    public var count: Int
    public var members: [ForumMember]

    public init(
        id: String = UUID().uuidString,
        type: String = "",
        count: Int = 0,
        members: [ForumMember] = []
    ) {
        self.id = id
        self.type = type
        self.count = count
        self.members = members
    }
}

public struct ForumBawuUser: Identifiable, Hashable, Sendable {
    public let id: String
    public var name: String
    public var nameShow: String
    public var portrait: String
    public var level: Int
    public var levelName: String
    public var roleName: String

    public init(
        id: String,
        name: String = "",
        nameShow: String = "",
        portrait: String = "",
        level: Int = 0,
        levelName: String = "",
        roleName: String = ""
    ) {
        self.id = id
        self.name = name
        self.nameShow = nameShow
        self.portrait = portrait
        self.level = level
        self.levelName = levelName
        self.roleName = roleName
    }
}

public struct ForumBawuTeam: Identifiable, Hashable, Sendable {
    public let id: String
    public var roleName: String
    public var members: [ForumBawuUser]

    public init(
        id: String = UUID().uuidString,
        roleName: String = "",
        members: [ForumBawuUser] = []
    ) {
        self.id = id
        self.roleName = roleName
        self.members = members
    }
}

public struct ForumRuleSection: Identifiable, Hashable, Sendable {
    public var title: String
    public var paragraphs: [String]
    public var content: [PbContent]

    public init(title: String = "", paragraphs: [String] = [], content: [PbContent] = []) {
        self.title = title
        self.paragraphs = paragraphs
        self.content = content
    }

    public var id: String { title }
}

public struct ForumRule: Hashable, Sendable {
    public var title: String
    public var publishTime: String
    public var preface: String
    public var authorName: String
    public var authorPortrait: String
    public var authorId: String
    public var sections: [ForumRuleSection]

    public init(
        title: String = "",
        publishTime: String = "",
        preface: String = "",
        authorName: String = "",
        authorPortrait: String = "",
        authorId: String = "",
        sections: [ForumRuleSection] = []
    ) {
        self.title = title
        self.publishTime = publishTime
        self.preface = preface
        self.authorName = authorName
        self.authorPortrait = authorPortrait
        self.authorId = authorId
        self.sections = sections
    }
}

public struct ForumDetailView: View {
    public let forum: ForumDetailInfo
    public let memberGroups: [ForumMemberGroup]
    public let bawuTeams: [ForumBawuTeam]
    public let rules: ForumRule
    public let onRefresh: () async -> Void
    public let onOpenUser: (String) -> Void
    public let onOpenInBrowser: () -> Void

    @Environment(\.appTheme) private var theme

    public init(
        forum: ForumDetailInfo,
        memberGroups: [ForumMemberGroup] = [],
        bawuTeams: [ForumBawuTeam] = [],
        rules: ForumRule = ForumRule(),
        onRefresh: @escaping () async -> Void = {},
        onOpenUser: @escaping (String) -> Void = { _ in },
        onOpenInBrowser: @escaping () -> Void = {}
    ) {
        self.forum = forum
        self.memberGroups = memberGroups
        self.bawuTeams = bawuTeams
        self.rules = rules
        self.onRefresh = onRefresh
        self.onOpenUser = onOpenUser
        self.onOpenInBrowser = onOpenInBrowser
    }

    public var body: some View {
        List {
            Section {
                ForumDetailHeaderCard(forum: forum)
            } header: {
                Text("吧详情")
            }

            Section("吧数据") {
                ForumStatsRow(forum: forum)
            }

            if !forum.intro.isEmpty {
                Section("简介") {
                    Text(forum.intro)
                        .font(.subheadline)
                        .foregroundStyle(theme.textSecondary)
                        .textSelection(.enabled)
                }
            }

            if !forum.hotText.isEmpty || !forum.recomReason.isEmpty {
                Section("吧数据中心") {
                    if !forum.recomReason.isEmpty {
                        Label(forum.recomReason, systemImage: "sparkles")
                            .font(.subheadline)
                            .foregroundStyle(theme.textSecondary)
                            .textSelection(.enabled)
                    }
                    if !forum.hotText.isEmpty {
                        Label(forum.hotText, systemImage: "flame.fill")
                            .font(.subheadline)
                            .foregroundStyle(theme.textSecondary)
                            .textSelection(.enabled)
                    }
                }
            }

            if !memberGroups.isEmpty {
                Section("吧成员") {
                    ForEach(memberGroups) { group in
                        ForumMemberGroupView(group: group, onOpenUser: onOpenUser)
                    }
                }
            }

            if !bawuTeams.isEmpty {
                Section("吧务团队") {
                    ForEach(bawuTeams) { team in
                        ForumBawuTeamView(team: team, onOpenUser: onOpenUser)
                    }
                }
            }

            if !rules.sections.isEmpty {
                Section("吧规") {
                    ForumRulesContentView(rules: rules)
                }
            }

            Section("吧信息") {
                HStack {
                    Text("吧名称")
                        .foregroundStyle(theme.textSecondary)
                    Spacer()
                    Text(forum.forumName)
                        .foregroundStyle(theme.text)
                        .lineLimit(1)
                }

                HStack {
                    Text("吧ID")
                        .foregroundStyle(theme.textSecondary)
                    Spacer()
                    Text(forum.id)
                        .foregroundStyle(theme.text)
                        .textSelection(.enabled)
                        .lineLimit(1)
                }

                Button(action: onOpenInBrowser) {
                    HStack {
                        Text("在浏览器中打开")
                            .foregroundStyle(theme.text)
                        Spacer()
                        Image(systemName: "safari")
                            .foregroundStyle(theme.primary)
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(theme.textTertiary)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .refreshable {
            await onRefresh()
        }
        .navigationTitle("吧信息")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct ForumDetailHeaderCard: View {
    let forum: ForumDetailInfo

    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(spacing: 10) {
            ForumAvatarView(urlString: forum.avatar, fallbackText: forum.forumName, size: 76)

            Text("\(forum.forumName)吧")
                .font(.title3.weight(.bold))
                .foregroundStyle(theme.text)
                .lineLimit(1)

            if !forum.slogan.isEmpty {
                Text(forum.slogan)
                    .font(.subheadline)
                    .foregroundStyle(theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }

            if forum.isFollowing {
                Label("已关注", systemImage: "checkmark.seal.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(theme.primary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(theme.chip, in: Capsule())
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
    }
}

private struct ForumStatsRow: View {
    let forum: ForumDetailInfo

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(spacing: 0) {
            stat("关注", forum.memberCount)
            Divider()
                .frame(height: 28)
            stat("主题", forum.threadCount)
            if let postCount = forum.postCount {
                Divider()
                    .frame(height: 28)
                stat("回贴", postCount)
            }
        }
        .padding(.vertical, 8)
    }

    private func stat(_ label: String, _ value: Int) -> some View {
        VStack(spacing: 3) {
            Text(forumCompactCount(value))
                .font(.headline.monospacedDigit())
                .foregroundStyle(theme.text)
            Text(label)
                .font(.caption)
                .foregroundStyle(theme.textTertiary)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct ForumMemberGroupView: View {
    let group: ForumMemberGroup
    let onOpenUser: (String) -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Circle()
                    .fill(theme.primary)
                    .frame(width: 4, height: 14)
                Text(forumMemberGroupTitle(group.type))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(theme.text)
                Spacer()
                if group.count > 0 {
                    Text("\(group.count)人")
                        .font(.caption)
                        .foregroundStyle(theme.textTertiary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(theme.surfaceSecondary, in: Capsule())
                }
            }

            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 96), spacing: 12)],
                spacing: 12
            ) {
                ForEach(group.members) { member in
                    ForumMemberCell(member: member) {
                        onOpenUser(member.id)
                    }
                }
            }
        }
        .padding(.vertical, 6)
    }
}

private struct ForumMemberCell: View {
    let member: ForumMember
    let onOpenUser: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        Button(action: onOpenUser) {
            VStack(spacing: 6) {
                ForumAvatarView(
                    urlString: member.portrait,
                    fallbackText: displayName,
                    size: 58
                )
                Text(displayName)
                    .font(.caption)
                    .foregroundStyle(theme.text)
                    .lineLimit(1)
                if member.level > 0 {
                    ForumLevelBadge(level: member.level)
                } else if !member.levelName.isEmpty {
                    Text(member.levelName)
                        .font(.caption2)
                        .foregroundStyle(theme.textTertiary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private var displayName: String {
        member.nameShow.isEmpty ? member.name : member.nameShow
    }
}

private struct ForumBawuTeamView: View {
    let team: ForumBawuTeam
    let onOpenUser: (String) -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Circle()
                    .fill(theme.primary)
                    .frame(width: 4, height: 14)
                Text(team.roleName.isEmpty ? "吧务" : team.roleName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(theme.text)
                Spacer()
                Text("\(team.members.count)人")
                    .font(.caption)
                    .foregroundStyle(theme.textTertiary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(theme.surfaceSecondary, in: Capsule())
            }

            ForEach(team.members) { user in
                Button {
                    onOpenUser(user.id)
                } label: {
                    HStack(spacing: 12) {
                        ForumAvatarView(
                            urlString: user.portrait,
                            fallbackText: displayName(user),
                            size: 44
                        )
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(displayName(user))
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(theme.text)
                                    .lineLimit(1)
                                if user.level > 0 {
                                    ForumLevelBadge(level: user.level)
                                }
                            }
                            Text(subtitle(user))
                                .font(.caption)
                                .foregroundStyle(theme.textTertiary)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 8)
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(theme.textTertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 6)
    }

    private func displayName(_ user: ForumBawuUser) -> String {
        user.nameShow.isEmpty ? user.name : user.nameShow
    }

    private func subtitle(_ user: ForumBawuUser) -> String {
        let role = user.roleName.isEmpty ? team.roleName : user.roleName
        if user.levelName.isEmpty {
            return role
        }
        return "\(role) · \(user.levelName)"
    }
}

private struct ForumRulesContentView: View {
    let rules: ForumRule

    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if !rules.title.isEmpty {
                Text(rules.title)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(theme.text)
                    .textSelection(.enabled)
            }

            if !rules.authorName.isEmpty || !rules.publishTime.isEmpty {
                HStack(spacing: 10) {
                    ForumAvatarView(
                        urlString: rules.authorPortrait,
                        fallbackText: rules.authorName.isEmpty ? "吧" : rules.authorName,
                        size: 40
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(rules.authorName.isEmpty ? "吧务团队" : rules.authorName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(theme.text)
                            .lineLimit(1)
                        if !rules.publishTime.isEmpty {
                            Text(rules.publishTime)
                                .font(.caption)
                                .foregroundStyle(theme.textTertiary)
                                .lineLimit(1)
                        }
                    }
                }
            }

            if !rules.preface.isEmpty {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "text.quote")
                        .font(.subheadline)
                        .foregroundStyle(theme.primary)
                    Text(rules.preface)
                        .font(.subheadline)
                        .foregroundStyle(theme.textSecondary)
                        .textSelection(.enabled)
                }
                .padding(12)
                .background(theme.chip, in: RoundedRectangle(cornerRadius: 8))
            }

            ForEach(Array(rules.sections.enumerated()), id: \.offset) { item in
                let index = item.offset
                let section = item.element
                VStack(alignment: .leading, spacing: 6) {
                    if !section.title.isEmpty {
                        HStack(alignment: .top, spacing: 8) {
                            Text("\(index + 1)")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(theme.primary)
                                .frame(width: 22, height: 22)
                                .background(theme.chip, in: RoundedRectangle(cornerRadius: 6))
                            Text(section.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(theme.text)
                                .textSelection(.enabled)
                        }
                    }

                    if section.content.isEmpty {
                        ForEach(section.paragraphs, id: \.self) { paragraph in
                            Text(paragraph)
                                .font(.subheadline)
                                .foregroundStyle(theme.textSecondary)
                                .textSelection(.enabled)
                        }
                    } else {
                        RuleContentRenderer(contents: section.content)
                    }
                }
            }

            Text("以上内容来自吧务团队发布的管理规范")
                .font(.caption)
                .foregroundStyle(theme.textTertiary)
        }
        .padding(.vertical, 8)
    }
}

private struct RuleContentRenderer: View {
    let contents: [PbContent]

    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(contents) { content in
                ruleBlock(content)
            }
        }
    }

    @ViewBuilder
    private func ruleBlock(_ content: PbContent) -> some View {
        if content.isLineBreak || content.type == "linebreak" {
            Divider()
                .overlay(theme.divider)
        } else if let image = content.image, !image.src.isEmpty {
            ruleImage(image.src, fallbackURL: content.url)
        } else if content.type == "image", !content.url.isEmpty {
            ruleImage(content.url, fallbackURL: "")
        } else if !content.quote.isEmpty || content.type == "quote" {
            HStack(alignment: .top, spacing: 8) {
                Rectangle()
                    .fill(theme.primary)
                    .frame(width: 3)
                Text(content.quote.isEmpty ? content.text : content.quote)
                    .font(.subheadline)
                    .foregroundStyle(theme.textSecondary)
                    .textSelection(.enabled)
            }
            .padding(10)
            .background(theme.surfaceSecondary, in: RoundedRectangle(cornerRadius: 8))
        } else if !content.link.isEmpty || content.type == "link" {
            let linkText = content.text.isEmpty
                ? (content.link.isEmpty ? content.url : content.link)
                : content.text
            let target = validURL(content.link.isEmpty ? content.url : content.link)
            if let target = target {
                Link(destination: target) {
                    Text(linkText)
                        .font(content.bold ? .subheadline.bold() : .subheadline)
                        .foregroundStyle(ruleColor(content.color) ?? theme.textLink)
                        .underline()
                }
            } else {
                Text(linkText)
                    .font(content.bold ? .subheadline.bold() : .subheadline)
                    .foregroundStyle(ruleColor(content.color) ?? theme.textLink)
                    .textSelection(.enabled)
            }
        } else if !content.text.isEmpty {
            Text(content.text)
                .font(content.bold ? .subheadline.bold() : .subheadline)
                .foregroundStyle(ruleColor(content.color) ?? theme.textSecondary)
                .textSelection(.enabled)
        }
    }

    @ViewBuilder
    private func ruleImage(_ source: String, fallbackURL: String) -> some View {
        let url = validURL(source) ?? validURL(fallbackURL)
        if let url = url {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFit()
                case .failure:
                    placeholder
                case .empty:
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: 80)
                @unknown default:
                    placeholder
                }
            }
            .frame(maxWidth: .infinity)
            .frame(minHeight: 80)
            .background(theme.surfaceSecondary, in: RoundedRectangle(cornerRadius: 8))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    private var placeholder: some View {
        Label("图片", systemImage: "photo")
            .font(.caption)
            .foregroundStyle(theme.textTertiary)
            .frame(maxWidth: .infinity, minHeight: 80)
            .background(theme.surfaceSecondary)
    }

    private func ruleColor(_ raw: String?) -> Color? {
        guard let raw, !raw.isEmpty else { return nil }
        if let color = Color(hexString: raw) {
            return color
        }
        switch raw.lowercased() {
        case "red", "红色":
            return theme.error
        case "green", "绿色":
            return theme.success
        case "blue", "蓝色":
            return theme.info
        case "orange", "橙色":
            return theme.warning
        default:
            return nil
        }
    }
}

// MARK: - Forum Search

public enum ForumSearchSort: String, CaseIterable, Identifiable, Hashable, Sendable {
    case time
    case relevance

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .time: return "按时间"
        case .relevance: return "按相关性"
        }
    }
}

public enum ForumSearchFilter: String, CaseIterable, Identifiable, Hashable, Sendable {
    case all
    case threadOnly

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .all: return "全部"
        case .threadOnly: return "仅主题贴"
        }
    }
}

public struct ForumSearchResult: Identifiable, Hashable, Sendable {
    // TODO(04 #30): 模型尚无 postInfo/floor 字段，楼中楼跳转暂不伪造，等待字段补齐。
    public let id: String
    public var title: String
    public var preview: String
    public var authorName: String
    public var replyCount: Int
    public var createTime: TimeInterval

    public init(
        id: String,
        title: String = "",
        preview: String = "",
        authorName: String = "",
        replyCount: Int = 0,
        createTime: TimeInterval = 0
    ) {
        self.id = id
        self.title = title
        self.preview = preview
        self.authorName = authorName
        self.replyCount = replyCount
        self.createTime = createTime
    }
}

// TODO(05 #36/#37): 与 Kotlin 的字节级 API 对齐（/mo/q/search/thread、ct=2、fname）
// 仍属高风险网络层改动，超出当前 Swift 原型范围。
public struct ForumSearchView: View {
    public let forumName: String
    public let forumId: String
    public let results: [ForumSearchResult]
    public let history: [String]
    public let isLoading: Bool
    public let isLoadingMore: Bool
    public let hasMore: Bool
    public let searched: Bool
    public let error: String?

    public let onSearch: (String) -> Void
    public let onLoadMore: () -> Void
    public let onRefresh: () async -> Void
    public let onOpenResult: (ForumSearchResult) -> Void
    public let onDeleteHistory: (String) -> Void
    public let onClearHistory: () -> Void

    @Environment(\.appTheme) private var theme
    @State private var query: String
    @State private var sort: ForumSearchSort = .time
    @State private var filter: ForumSearchFilter = .all
    @State private var lastRequestedResultID: String?
    @StateObject private var historyStore: SearchHistoryStore

    public init(
        forumName: String,
        forumId: String,
        results: [ForumSearchResult] = [],
        history: [String] = [],
        isLoading: Bool = false,
        isLoadingMore: Bool = false,
        hasMore: Bool = false,
        searched: Bool = false,
        error: String? = nil,
        initialQuery: String = "",
        onSearch: @escaping (String) -> Void = { _ in },
        onLoadMore: @escaping () -> Void = {},
        onRefresh: @escaping () async -> Void = {},
        onOpenResult: @escaping (ForumSearchResult) -> Void = { _ in },
        onDeleteHistory: @escaping (String) -> Void = { _ in },
        onClearHistory: @escaping () -> Void = {}
    ) {
        self.forumName = forumName
        self.forumId = forumId
        self.results = results
        self.history = history
        self.isLoading = isLoading
        self.isLoadingMore = isLoadingMore
        self.hasMore = hasMore
        self.searched = searched
        self.error = error
        self.onSearch = onSearch
        self.onLoadMore = onLoadMore
        self.onRefresh = onRefresh
        self.onOpenResult = onOpenResult
        self.onDeleteHistory = onDeleteHistory
        self.onClearHistory = onClearHistory
        _query = State(initialValue: initialQuery)
        let store = SearchHistoryStore(scope: .forum(forumId))
        store.seedIfEmpty(history)
        _historyStore = StateObject(wrappedValue: store)
    }

    public var body: some View {
        VStack(spacing: 0) {
            searchControls

            if results.isEmpty {
                searchPlaceholder
            } else {
                resultList
            }
        }
        .background(theme.background)
        .navigationTitle("\(forumName)吧搜索")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(
            text: $query,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: "搜索吧内帖子"
        )
        .onSubmit(of: .search) {
            submitSearch()
        }
        .onChange(of: sort) { _, _ in
            reSearchIfNeeded()
        }
        .onChange(of: filter) { _, _ in
            reSearchIfNeeded()
        }
    }

    private var searchControls: some View {
        VStack(spacing: 10) {
            // 排序/筛选变化通过 body 的 onChange 触发 reSearchIfNeeded()。
            HStack(spacing: 12) {
                Picker("排序", selection: $sort) {
                    ForEach(ForumSearchSort.allCases) { sort in
                        Text(sort.title)
                            .tag(sort)
                    }
                }
                .pickerStyle(.menu)
                .frame(maxWidth: .infinity, alignment: .leading)

                Picker("筛选", selection: $filter) {
                    ForEach(ForumSearchFilter.allCases) { filter in
                        Text(filter.title)
                            .tag(filter)
                    }
                }
                .pickerStyle(.menu)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(16)
        .background(theme.surface)
    }

    @ViewBuilder
    private var searchPlaceholder: some View {
        if isLoading {
            VStack(spacing: 10) {
                ProgressView()
                Text("搜索中...")
                    .font(.footnote)
                    .foregroundStyle(theme.textSecondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let error, !error.isEmpty {
            VStack(spacing: 14) {
                ContentUnavailableView(
                    "搜索失败",
                    systemImage: "exclamationmark.triangle",
                    description: Text(error)
                )
                Button("重试") {
                    submitSearch()
                }
                .buttonStyle(.borderedProminent)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if !searched {
            if historyStore.entries.isEmpty {
                ContentUnavailableView(
                    "搜索吧内帖子",
                    systemImage: "magnifyingglass",
                    description: Text("输入关键词查找\(forumName)吧内容")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                historySection
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
        } else {
            ContentUnavailableView(
                "未找到相关内容",
                systemImage: "doc.text.magnifyingglass",
                description: Text("换个关键词试试吧")
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("搜索历史")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(theme.textSecondary)
                Spacer()
                Button {
                    historyStore.clear()
                    onClearHistory()
                } label: {
                    Image(systemName: "trash")
                        .foregroundStyle(theme.textTertiary)
                }
                .accessibilityLabel("清空搜索历史")
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(historyStore.entries) { entry in
                        HStack(spacing: 6) {
                            Button {
                                query = entry.keyword
                                historyStore.add(entry.keyword)
                                onSearch(entry.keyword)
                            } label: {
                                HStack(spacing: 6) {
                                    Text(entry.keyword)
                                        .lineLimit(1)
                                    if entry.timestamp > 0 {
                                        Text(relativeTime(entry.timestamp))
                                            .font(.caption2)
                                            .foregroundStyle(theme.textTertiary)
                                            .lineLimit(1)
                                    }
                                }
                            }
                            .buttonStyle(.plain)

                            Button {
                                historyStore.remove(entry.keyword)
                                onDeleteHistory(entry.keyword)
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.caption)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("删除搜索历史：\(entry.keyword)")
                        }
                        .padding(.leading, 12)
                        .padding(.trailing, 8)
                        .padding(.vertical, 7)
                        .background(theme.surfaceSecondary, in: Capsule())
                        .foregroundStyle(theme.textSecondary)
                        .contextMenu {
                            Button(role: .destructive) {
                                historyStore.remove(entry.keyword)
                                onDeleteHistory(entry.keyword)
                            } label: {
                                Label("删除", systemImage: "trash")
                            }
                        }
                    }
                }
                .padding(.horizontal, 1)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    private var resultList: some View {
        List {
            // TODO(04 #30): 搜索结果无 postInfo/floor，UI 暂不提供楼中楼跳转。
            ForEach(results) { result in
                Button {
                    onOpenResult(result)
                } label: {
                    ForumSearchResultRow(result: result)
                }
                .buttonStyle(.plain)
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
                .onAppear {
                    requestLoadMoreIfNeeded(for: result)
                }
            }

            if hasMore {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text(isLoadingMore ? "加载中" : "上拉加载更多")
                        .font(.footnote)
                        .foregroundStyle(theme.textSecondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            } else {
                Text("没有更多了")
                    .font(.footnote)
                    .foregroundStyle(theme.textTertiary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .refreshable {
            await onRefresh()
        }
    }

    private func submitSearch() {
        let keyword = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !keyword.isEmpty else { return }
        historyStore.add(keyword)
        onSearch(keyword)
    }

    private func reSearchIfNeeded() {
        let keyword = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !keyword.isEmpty, searched else { return }
        onSearch(keyword)
    }

    private func requestLoadMoreIfNeeded(for result: ForumSearchResult) {
        guard result.id == results.last?.id, result.id != lastRequestedResultID else { return }
        lastRequestedResultID = result.id
        guard hasMore, !isLoadingMore else { return }
        onLoadMore()
    }
}

private struct ForumSearchResultRow: View {
    let result: ForumSearchResult

    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(result.title.isEmpty ? "无标题" : result.title)
                .font(.headline)
                .foregroundStyle(theme.text)
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            if !result.preview.isEmpty {
                Text(result.preview)
                    .font(.subheadline)
                    .foregroundStyle(theme.textSecondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }

            HStack(spacing: 10) {
                Text(result.authorName)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Label {
                    Text("\(forumCompactCount(result.replyCount)) 回复")
                } icon: {
                    Image(systemName: "bubble.right")
                }
                Text(forumShortTime(result.createTime))
            }
            .font(.caption)
            .foregroundStyle(theme.textTertiary)
        }
        .padding(14)
        .background(theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(theme.border, lineWidth: 0.5)
        }
        .contentShape(Rectangle())
    }
}

// MARK: - Shared Forum Components

private struct ForumAvatarView: View {
    let urlString: String
    let fallbackText: String
    var size: CGFloat = 32

    @Environment(\.appTheme) private var theme

    var body: some View {
        Group {
            if let url = URL(string: urlString), !urlString.isEmpty {
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
                .font(.system(size: size * 0.42, weight: .semibold))
                .foregroundStyle(theme.textSecondary)
        }
    }

    private var initial: String {
        let text = fallbackText.trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? "?" : String(text.prefix(1)).uppercased()
    }
}

private struct ForumLevelBadge: View {
    let level: Int

    var body: some View {
        Text("Lv.\(level)")
            .font(.caption2.weight(.bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(forumLevelColor(level), in: RoundedRectangle(cornerRadius: 4))
    }
}

private func forumLevelColor(_ level: Int) -> Color {
    switch level {
    case 1...4:
        return Color(hex: 0x8E8E93)
    case 5...8:
        return Color(hex: 0x34C759)
    case 9...12:
        return Color(hex: 0x0A84FF)
    case 13...16:
        return Color(hex: 0xAF52DE)
    default:
        return Color(hex: 0xFF9500)
    }
}

private func forumMemberGroupTitle(_ type: String) -> String {
    switch type {
    case "manager": return "吧务成员"
    case "god": return "本吧大神"
    case "active": return "活跃成员"
    case "member": return "普通成员"
    case "friend": return "互关好友"
    default: return type.isEmpty ? "成员" : type
    }
}

private func forumCompactCount(_ count: Int) -> String {
    if count >= 100_000_000 {
        return String(format: "%.1f亿", Double(count) / 100_000_000)
    }
    if count >= 10_000 {
        return String(format: "%.1f万", Double(count) / 10_000)
    }
    return "\(count)"
}

private func forumShortTime(_ timestamp: TimeInterval) -> String {
    guard timestamp > 0 else { return "" }
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
    let formatter = DateFormatter()
    formatter.dateFormat = "MM-dd"
    return formatter.string(from: date)
}

// MARK: - Previews

#Preview("贴吧主页") {
    NavigationStack {
        ForumListView(
            forumName: "苹果",
            forumAvatar: "",
            forumId: "1",
            threads: PreviewData.feedItems.compactMap(\.threadInfo),
            forumMemberCount: 128_000,
            forumThreadCount: 9_860,
            isFollowing: true,
            isSignedIn: false,
            goodClassifies: [
                ForumClassifyOption(id: "1", name: "数码"),
                ForumClassifyOption(id: "2", name: "求助"),
            ]
        )
    }
    .environment(\.appTheme, .lightPalette)
}

#Preview("吧详情") {
    NavigationStack {
        ForumDetailView(
            forum: ForumDetailInfo(
                id: "1",
                forumName: "苹果",
                slogan: "iPhone、Mac、Apple Watch 交流社区",
                intro: "欢迎来到苹果吧，讨论新品、系统、软件与使用技巧。",
                memberCount: 128_000,
                threadCount: 9_860,
                postCount: 46_200,
                isFollowing: true,
                hotText: "今日新增 1.2 万条讨论",
                recomReason: "数码类热门吧"
            ),
            memberGroups: [
                ForumMemberGroup(
                    id: "manager",
                    type: "manager",
                    count: 4,
                    members: [
                        ForumMember(id: "u1", name: "apple_fan", nameShow: "果粉小明", level: 12, levelName: "资深吧友"),
                        ForumMember(id: "u2", name: "digi_user", nameShow: "数码爱好者", level: 9, levelName: "活跃吧友"),
                    ]
                ),
                ForumMemberGroup(
                    id: "active",
                    type: "active",
                    count: 2,
                    members: [
                        ForumMember(id: "u3", name: "swift_dev", nameShow: "Swift 开发者", level: 6, levelName: "初露头角"),
                    ]
                ),
            ],
            bawuTeams: [
                ForumBawuTeam(
                    id: "moderators",
                    roleName: "吧主",
                    members: [
                        ForumBawuUser(id: "u1", name: "apple_fan", nameShow: "果粉小明", level: 12, levelName: "资深吧友", roleName: "吧主"),
                    ]
                )
            ],
            rules: ForumRule(
                title: "苹果吧吧规",
                publishTime: "2026-06-01",
                preface: "发帖前请阅读本吧管理规范。",
                authorName: "果粉小明",
                sections: [
                    ForumRuleSection(
                        title: "文明发言",
                        paragraphs: ["禁止人身攻击与恶意引战。"],
                        content: [
                            PbContent(text: "禁止", bold: true, color: "#FF3B30"),
                            PbContent(text: "人身攻击与恶意引战。"),
                            PbContent(type: "quote", quote: "文明交流是社区底线。"),
                            PbContent(type: "link", text: "查看完整规范", link: "https://tieba.baidu.com"),
                        ]
                    ),
                    ForumRuleSection(title: "内容范围", paragraphs: ["仅讨论与 Apple 相关的话题。"]),
                ]
            )
        )
    }
    .environment(\.appTheme, .lightPalette)
}

#Preview("吧内搜索") {
    NavigationStack {
        ForumSearchView(
            forumName: "苹果",
            forumId: "1",
            results: [
                ForumSearchResult(
                    id: "s1",
                    title: "iOS 26 毛玻璃效果太强了",
                    preview: "新的 Liquid Glass 在贴吧里滚动非常流畅。",
                    authorName: "果粉小明",
                    replyCount: 128,
                    createTime: Date().timeIntervalSince1970 - 3_600
                )
            ],
            history: ["毛玻璃", "iPhone", "SwiftUI"],
            searched: true
        )
    }
    .environment(\.appTheme, .lightPalette)
}
