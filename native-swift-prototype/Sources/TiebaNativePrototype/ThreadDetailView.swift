import Foundation
import SwiftUI

private enum MockCurrentUser {
    static let id = "1001"
}

// MARK: - Shared action plumbing

struct PostActions {
    var onLike: (PostInfo) -> Void
    var onReply: (PostInfo) -> Void
    var onShare: (PostInfo) -> Void
    var onCopy: (PostInfo) -> Void
    var onReport: (PostInfo) -> Void
    var onDelete: (PostInfo) -> Void
    var onOpenSubPosts: (PostInfo) -> Void
    var onImagePress: ([MediaItem], Int) -> Void
    var onLinkPress: (URL) -> Void
    var onUserPress: (String) -> Void
    var onTopicPress: (String, String) -> Void
    var onVote: (Int) -> Void
    var onVoteMulti: ([Int]) -> Void = { _ in }
    var voteIsMulti: Bool = false
    var voteIsClosed: Bool = false
    var voteDeadline: TimeInterval = 0
    var onReplySubPost: (SubPostInfo) -> Void = { _ in }
    var onReportSubPost: (SubPostInfo) -> Void = { _ in }
    var onDeleteSubPost: (SubPostInfo) -> Void = { _ in }
    var canDeleteSubPost: (SubPostInfo) -> Bool = {
        $0.authorId == MockCurrentUser.id
    }
}

private enum DetailAction: Identifiable {
    case reportThread
    case deleteThread
    case reportPost(PostInfo)
    case deletePost(PostInfo)

    var id: String {
        switch self {
        case .reportThread:
            return "report-thread"
        case .deleteThread:
            return "delete-thread"
        case .reportPost(let post):
            return "report-post-\(post.id)"
        case .deletePost(let post):
            return "delete-post-\(post.id)"
        }
    }

    var title: String {
        switch self {
        case .reportThread:
            return "举报此帖？"
        case .deleteThread:
            return "删除此帖？"
        case .reportPost:
            return "举报该楼层？"
        case .deletePost:
            return "删除该楼层？"
        }
    }

    var message: String {
        switch self {
        case .reportThread:
            return "提交后由贴吧官方审核处理。"
        case .deleteThread:
            return "删除后不可恢复，确认删除整帖？"
        case .reportPost(let post):
            return "确认举报 \(displayName(for: post)) 的楼层？"
        case .deletePost:
            return "删除后不可恢复，确认删除该楼层？"
        }
    }

    private func displayName(for post: PostInfo) -> String {
        post.authorNameShow.isEmpty ? post.authorName : post.authorNameShow
    }
}

private struct ThreadScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

private struct ThreadScrollContentSizeKey: PreferenceKey {
    static var defaultValue: CGSize = .zero

    static func reduce(value: inout CGSize, nextValue: () -> CGSize) {
        value = nextValue()
    }
}

private struct ThreadScrollViewportSizeKey: PreferenceKey {
    static var defaultValue: CGSize = .zero

    static func reduce(value: inout CGSize, nextValue: () -> CGSize) {
        value = nextValue()
    }
}

// MARK: - Thread detail page

public struct ThreadDetailView: View {
    public let thread: ThreadDetail
    public let posts: [PostInfo]
    public let canDeleteThread: Bool
    public let isLoadingMore: Bool

    public let onRefresh: () async -> Void
    public let onLoadMore: () async -> Void
    public let onJumpToPage: (Int) -> Void
    public let onToggleFavorite: () -> Void
    public let onReplyThread: () -> Void
    public let onShareThread: () -> Void
    public let onCopyThreadLink: () -> Void
    public let onReportThread: () -> Void
    public let onDeleteThread: () -> Void
    public let onLikePost: (PostInfo) -> Void
    public let onReplyPost: (PostInfo) -> Void
    public let onSharePost: (PostInfo) -> Void
    public let onCopyPost: (PostInfo) -> Void
    public let onReportPost: (PostInfo) -> Void
    public let onDeletePost: (PostInfo) -> Void
    public let onOpenSubPosts: (PostInfo) -> Void
    public let canDeletePost: (PostInfo) -> Bool
    public let onSeeLzChange: (Bool) -> Void
    public let onReverseChange: (Bool) -> Void
    public let onImmersiveChange: (Bool) -> Void
    public let onImagePress: ([MediaItem], Int) -> Void
    public let onLinkPress: (URL) -> Void
    public let onUserPress: (String) -> Void
    public let onTopicPress: (String, String) -> Void
    public let onVote: (Int) -> Void
    public let onVoteMulti: ([Int]) -> Void
    public let voteIsMulti: Bool
    public let voteIsClosed: Bool
    public let voteDeadline: TimeInterval
    public let onReplySubPost: (SubPostInfo) -> Void
    public let onReportSubPost: (SubPostInfo) -> Void
    public let onDeleteSubPost: (SubPostInfo) -> Void
    public let canDeleteSubPost: (SubPostInfo) -> Bool

    @Environment(\.appTheme) private var theme
    @Environment(\.accessibilityEnvironment) private var accessibility
    @State private var favorite: Bool
    @State private var seeLz = false
    @State private var reverse = false
    @State private var immersive = false
    @State private var showThreadMenu = false
    @State private var showJumpPageAlert = false
    @State private var jumpPageText = ""
    @State private var pendingAction: DetailAction?
    @State private var isRequestingMore = false
    @State private var toast: ToastMessage?
    @State private var toolbarVisible = true
    @State private var lastScrollOffset: CGFloat = 0
    @State private var scrollContentHeight: CGFloat = 0
    @State private var scrollViewportHeight: CGFloat = 0

    public init(
        thread: ThreadDetail,
        posts: [PostInfo],
        isFavorite: Bool = false,
        canDeleteThread: Bool = false,
        isLoadingMore: Bool = false,
        onRefresh: @escaping () async -> Void = {},
        onLoadMore: @escaping () async -> Void = {},
        onJumpToPage: @escaping (Int) -> Void = { _ in },
        onToggleFavorite: @escaping () -> Void = {},
        onReplyThread: @escaping () -> Void = {},
        onShareThread: @escaping () -> Void = {},
        onCopyThreadLink: @escaping () -> Void = {},
        onReportThread: @escaping () -> Void = {},
        onDeleteThread: @escaping () -> Void = {},
        onLikePost: @escaping (PostInfo) -> Void = { _ in },
        onReplyPost: @escaping (PostInfo) -> Void = { _ in },
        onSharePost: @escaping (PostInfo) -> Void = { _ in },
        onCopyPost: @escaping (PostInfo) -> Void = { _ in },
        onReportPost: @escaping (PostInfo) -> Void = { _ in },
        onDeletePost: @escaping (PostInfo) -> Void = { _ in },
        onOpenSubPosts: @escaping (PostInfo) -> Void = { _ in },
        canDeletePost: @escaping (PostInfo) -> Bool = { _ in false },
        onSeeLzChange: @escaping (Bool) -> Void = { _ in },
        onReverseChange: @escaping (Bool) -> Void = { _ in },
        onImmersiveChange: @escaping (Bool) -> Void = { _ in },
        onImagePress: @escaping ([MediaItem], Int) -> Void = { _, _ in },
        onLinkPress: @escaping (URL) -> Void = { _ in },
        onUserPress: @escaping (String) -> Void = { _ in },
        onTopicPress: @escaping (String, String) -> Void = { _, _ in },
        onVote: @escaping (Int) -> Void = { _ in },
        onVoteMulti: @escaping ([Int]) -> Void = { _ in },
        voteIsMulti: Bool = false,
        voteIsClosed: Bool = false,
        voteDeadline: TimeInterval = 0,
        onReplySubPost: @escaping (SubPostInfo) -> Void = { _ in },
        onReportSubPost: @escaping (SubPostInfo) -> Void = { _ in },
        onDeleteSubPost: @escaping (SubPostInfo) -> Void = { _ in },
        canDeleteSubPost: @escaping (SubPostInfo) -> Bool = {
            $0.authorId == MockCurrentUser.id
        }
    ) {
        self.thread = thread
        self.posts = posts
        self.canDeleteThread = canDeleteThread
        self.isLoadingMore = isLoadingMore
        self.onRefresh = onRefresh
        self.onLoadMore = onLoadMore
        self.onJumpToPage = onJumpToPage
        self.onToggleFavorite = onToggleFavorite
        self.onReplyThread = onReplyThread
        self.onShareThread = onShareThread
        self.onCopyThreadLink = onCopyThreadLink
        self.onReportThread = onReportThread
        self.onDeleteThread = onDeleteThread
        self.onLikePost = onLikePost
        self.onReplyPost = onReplyPost
        self.onSharePost = onSharePost
        self.onCopyPost = onCopyPost
        self.onReportPost = onReportPost
        self.onDeletePost = onDeletePost
        self.onOpenSubPosts = onOpenSubPosts
        self.canDeletePost = canDeletePost
        self.onSeeLzChange = onSeeLzChange
        self.onReverseChange = onReverseChange
        self.onImmersiveChange = onImmersiveChange
        self.onImagePress = onImagePress
        self.onLinkPress = onLinkPress
        self.onUserPress = onUserPress
        self.onTopicPress = onTopicPress
        self.onVote = onVote
        self.onVoteMulti = onVoteMulti
        self.voteIsMulti = voteIsMulti
        self.voteIsClosed = voteIsClosed
        self.voteDeadline = voteDeadline
        self.onReplySubPost = onReplySubPost
        self.onReportSubPost = onReportSubPost
        self.onDeleteSubPost = onDeleteSubPost
        self.canDeleteSubPost = canDeleteSubPost
        _favorite = State(initialValue: isFavorite)
    }

    public var body: some View {
        let actions = PostActions(
            onLike: { post in onLikePost(post) },
            onReply: { post in onReplyPost(post) },
            onShare: { post in onSharePost(post) },
            onCopy: { post in onCopyPost(post) },
            onReport: { post in pendingAction = .reportPost(post) },
            onDelete: { post in pendingAction = .deletePost(post) },
            onOpenSubPosts: { post in onOpenSubPosts(post) },
            onImagePress: onImagePress,
            onLinkPress: onLinkPress,
            onUserPress: onUserPress,
            onTopicPress: onTopicPress,
            onVote: onVote,
            onVoteMulti: onVoteMulti,
            voteIsMulti: voteIsMulti,
            voteIsClosed: voteIsClosed,
            voteDeadline: voteDeadline,
            onReplySubPost: onReplySubPost,
            onReportSubPost: onReportSubPost,
            onDeleteSubPost: onDeleteSubPost,
            canDeleteSubPost: canDeleteSubPost
        )

        return NavigationStack {
            ScrollViewReader { proxy in
                GeometryReader { viewport in
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            if let mainPost = posts.first {
                                PostCardView(
                                    post: mainPost,
                                    thread: thread,
                                    title: thread.title,
                                    isMain: true,
                                    immersive: immersive,
                                    canDelete: canDeletePost,
                                    actions: actions
                                )
                                .id("thread-top")
                            }

                            ForEach(replyPosts) { post in
                                PostCardView(
                                    post: post,
                                    thread: thread,
                                    immersive: immersive,
                                    canDelete: canDeletePost,
                                    actions: actions
                                )
                            }

                            LoadMoreFooter(
                                hasMore: thread.hasMore,
                                isLoading: isLoadingMore,
                                onLoadMore: requestLoadMore
                            )
                        }
                        .padding(.vertical, 12)
                        .background {
                            GeometryReader { contentProxy in
                                Color.clear
                                    .preference(
                                        key: ThreadScrollOffsetKey.self,
                                        value: contentProxy.frame(in: .named("thread-scroll")).minY
                                    )
                                    .preference(
                                        key: ThreadScrollContentSizeKey.self,
                                        value: contentProxy.size
                                    )
                            }
                        }
                    }
                    .coordinateSpace(name: "thread-scroll")
                    .background(theme.background)
                    .background {
                        Color.clear.preference(
                            key: ThreadScrollViewportSizeKey.self,
                            value: viewport.size
                        )
                    }
                    .refreshable {
                        await onRefresh()
                    }
                    .onPreferenceChange(ThreadScrollOffsetKey.self) { offset in
                        handleScrollOffsetChange(offset)
                    }
                    .onPreferenceChange(ThreadScrollContentSizeKey.self) { size in
                        scrollContentHeight = size.height
                    }
                    .onPreferenceChange(ThreadScrollViewportSizeKey.self) { size in
                        scrollViewportHeight = size.height
                    }
                    .safeAreaInset(edge: .bottom, spacing: 0) {
                        floatingToolbarArea(proxy: proxy)
                    }
                    .navigationTitle(navigationTitle)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Menu {
                                threadToolbarMenu
                            } label: {
                                Image(systemName: "ellipsis.circle")
                                    .accessibilityLabel("更多")
                            }
                        }
                    }
                    .onChange(of: seeLz) { _, newValue in
                        onSeeLzChange(newValue)
                    }
                    .onChange(of: reverse) { _, newValue in
                        onReverseChange(newValue)
                    }
                    .onChange(of: immersive) { _, newValue in
                        onImmersiveChange(newValue)
                    }
                    .alert("跳转页面", isPresented: $showJumpPageAlert) {
                        TextField("页码", text: $jumpPageText)
                            .keyboardType(.numberPad)
                        Button("跳转") {
                            jumpToPage(using: proxy)
                        }
                        Button("取消", role: .cancel) {
                            jumpPageText = ""
                        }
                    } message: {
                        Text("当前第 \(thread.pageCurrent) / \(max(thread.pageTotal, 1)) 页")
                    }
                    .confirmationDialog(
                        pendingAction?.title ?? "操作确认",
                        isPresented: Binding(
                            get: { pendingAction != nil },
                            set: { isPresented in
                                if !isPresented { pendingAction = nil }
                            }
                        ),
                        titleVisibility: .visible,
                        presenting: pendingAction
                    ) { action in
                        switch action {
                        case .reportThread:
                            Button("举报") { onReportThread() }
                            Button("取消", role: .cancel) {}
                        case .deleteThread:
                            Button("删除", role: .destructive) { performDeleteThread() }
                            Button("取消", role: .cancel) {}
                        case .reportPost(let post):
                            Button("举报") { onReportPost(post) }
                            Button("取消", role: .cancel) {}
                        case .deletePost(let post):
                            Button("删除", role: .destructive) { performDeletePost(post) }
                            Button("取消", role: .cancel) {}
                        }
                    } message: { action in
                        Text(action.message)
                    }
                    .sheet(isPresented: $showThreadMenu) {
                        ThreadMenuSheet(
                            seeLz: $seeLz,
                            reverse: $reverse,
                            immersive: $immersive,
                            isFavorite: favorite,
                            canDelete: canDeleteThread,
                            onToggleFavorite: toggleFavorite,
                            onShare: performShareThread,
                            onCopyLink: performCopyThreadLink,
                            onJumpPage: { showJumpPageAlert = true },
                            onReport: { pendingAction = .reportThread },
                            onDelete: { pendingAction = .deleteThread }
                        )
                    }
                    .toastOverlay(toast: toast) {
                        toast = nil
                    }
                }
            }
        }
    }

    private var replyPosts: [PostInfo] {
        Array(posts.dropFirst())
    }

    private var navigationTitle: String {
        let trimmed = thread.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "帖子详情" }
        let limit = 14
        return trimmed.count > limit ? String(trimmed.prefix(limit)) + "…" : trimmed
    }

    @ViewBuilder
    private var threadToolbarMenu: some View {
        Button {
            showJumpPageAlert = true
        } label: {
            Label("跳转页码", systemImage: "number")
        }
        Button {
            performShareThread()
        } label: {
            Label("分享", systemImage: "square.and.arrow.up")
        }
        Button {
            performCopyThreadLink()
        } label: {
            Label("复制链接", systemImage: "link")
        }
        Button(role: .destructive) {
            pendingAction = .reportThread
        } label: {
            Label("举报", systemImage: "exclamationmark.bubble")
        }
        if canDeleteThread {
            Button(role: .destructive) {
                pendingAction = .deleteThread
            } label: {
                Label("删除帖子", systemImage: "trash")
            }
        }
    }

    private func scrollToTop(_ proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.2)) {
            proxy.scrollTo("thread-top", anchor: .top)
        }
    }

    private func handleScrollOffsetChange(_ offset: CGFloat) {
        let delta = offset - lastScrollOffset
        let maxOffset = max(0, scrollContentHeight - scrollViewportHeight)
        if offset >= 0 || maxOffset <= 1 || abs(offset + maxOffset) <= 24 {
            toolbarVisible = true
            lastScrollOffset = offset
            return
        }
        guard abs(delta) > 6 else { return }
        lastScrollOffset = offset
        toolbarVisible = delta > 0
    }

    private var toolbarOffset: CGFloat {
        toolbarVisible || accessibility.reduceMotion ? 0 : 90
    }

    private func floatingToolbarArea(proxy: ScrollViewProxy) -> some View {
        ZStack {
            if !toolbarVisible {
                Button {
                    toolbarVisible = true
                } label: {
                    Color.clear
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("显示工具栏")
            }

            GradientBlurView(
                colors: [.clear, theme.background.opacity(0.85)],
                startPoint: .top,
                endPoint: .bottom,
                blurStyle: .systemThinMaterial
            )
            .ignoresSafeArea(edges: .bottom)
            .opacity(toolbarVisible ? 1 : 0)
            .allowsHitTesting(false)

            FloatingToolbar(
                isFavorite: favorite,
                onBackToTop: { scrollToTop(proxy) },
                onToggleFavorite: toggleFavorite,
                onReply: onReplyThread,
                onMore: { showThreadMenu = true }
            )
            .opacity(toolbarVisible ? 1 : 0)
            .offset(y: toolbarOffset)
            .allowsHitTesting(toolbarVisible)
            .accessibilityHidden(!toolbarVisible)
        }
        .animation(.easeOut(duration: 0.22), value: toolbarVisible)
    }

    private func toggleFavorite() {
        favorite.toggle()
        onToggleFavorite()
    }

    private func performCopyThreadLink() {
        onCopyThreadLink()
        presentToast(
            title: "已复制",
            message: "链接已复制到剪贴板",
            systemImage: "link"
        )
    }

    private func performShareThread() {
        onShareThread()
        presentToast(
            title: "已分享",
            systemImage: "square.and.arrow.up"
        )
    }

    private func performDeleteThread() {
        onDeleteThread()
        presentToast(
            title: "已删除",
            message: "帖子已删除",
            systemImage: "trash"
        )
    }

    private func performDeletePost(_ post: PostInfo) {
        onDeletePost(post)
        presentToast(
            title: "已删除",
            message: "楼层已删除",
            systemImage: "trash"
        )
    }

    private func presentToast(
        title: String,
        message: String? = nil,
        systemImage: String = "checkmark.circle.fill"
    ) {
        toast = ToastMessage(
            title: title,
            message: message,
            systemImage: systemImage
        )
    }

    private func requestLoadMore() {
        guard !isRequestingMore else { return }
        isRequestingMore = true
        Task {
            await onLoadMore()
            isRequestingMore = false
        }
    }

    private func jumpToPage(using proxy: ScrollViewProxy) {
        let pageText = jumpPageText.trimmingCharacters(in: .whitespacesAndNewlines)
        let requested = Int(pageText) ?? 1
        let total = max(thread.pageTotal, 1)
        let page = min(max(requested, 1), total)
        jumpPageText = ""
        onJumpToPage(page)
        withAnimation(.easeOut(duration: 0.2)) {
            proxy.scrollTo("thread-top", anchor: .top)
        }
    }
}

// MARK: - Post card

struct PostCardView: View {
    let post: PostInfo
    let thread: ThreadDetail
    let title: String?
    let isMain: Bool
    let immersive: Bool
    let canDelete: (PostInfo) -> Bool
    let actions: PostActions

    @Environment(\.appTheme) private var theme
    @State private var isLiked: Bool
    @State private var likeCount: Int

    init(
        post: PostInfo,
        thread: ThreadDetail,
        title: String? = nil,
        isMain: Bool = false,
        immersive: Bool = false,
        canDelete: @escaping (PostInfo) -> Bool = { _ in false },
        actions: PostActions
    ) {
        self.post = post
        self.thread = thread
        self.title = title
        self.isMain = isMain
        self.immersive = immersive
        self.canDelete = canDelete
        self.actions = actions
        _isLiked = State(initialValue: post.isAgree)
        _likeCount = State(initialValue: post.agreeNum)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !immersive {
                authorRow
                    .padding(.horizontal, 14)
                    .padding(.top, 12)
                    .padding(.bottom, 10)
            }

            if isMain, let title {
                Text(title)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(theme.text)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 14)
                    .padding(.bottom, 10)
            }

            PostContentView(
                segments: post.content,
                onImagePress: actions.onImagePress,
                onLinkPress: actions.onLinkPress,
                onUserPress: actions.onUserPress,
                onTopicPress: actions.onTopicPress,
                onVote: actions.onVote,
                onVoteMulti: actions.onVoteMulti,
                voteIsMulti: actions.voteIsMulti,
                voteIsClosed: actions.voteIsClosed,
                voteDeadline: actions.voteDeadline
            )
            .padding(.horizontal, 14)

            if !immersive {
                if !post.subPosts.isEmpty {
                    subPostsSection
                        .padding(.top, 10)
                }
                actionBar
                    .padding(.top, 8)
            }
        }
        .background(theme.floorCard)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(theme.separator, lineWidth: 0.5)
        }
        .contextMenu {
            postMenu
        }
    }

    private var authorRow: some View {
        HStack(alignment: .center, spacing: 10) {
            AvatarView(portrait: post.authorPortrait, size: 40)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(displayName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(theme.text)
                        .lineLimit(1)
                    if post.authorLevelId > 0 {
                        levelBadge
                    }
                    if post.authorId == thread.authorId {
                        opBadge
                    }
                }
                Text(metaText)
                    .font(.caption)
                    .foregroundStyle(theme.textTertiary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            Button {
                withAnimation(.easeOut(duration: 0.2)) {
                    isLiked.toggle()
                    likeCount += isLiked ? 1 : -1
                }
                actions.onLike(post)
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: isLiked ? "heart.fill" : "heart")
                    if likeCount > 0 {
                        Text("\(likeCount)")
                    }
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(isLiked ? theme.error : theme.textSecondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(theme.surfaceSecondary, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }

    private var displayName: String {
        post.authorNameShow.isEmpty ? post.authorName : post.authorNameShow
    }

    private var levelBadge: some View {
        Text("Lv.\(post.authorLevelId)")
            .font(.caption2.weight(.medium))
            .foregroundStyle(theme.onChip)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(theme.chip, in: Capsule())
    }

    private var opBadge: some View {
        Text("楼主")
            .font(.caption2.weight(.bold))
            .foregroundStyle(Color.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(theme.primary, in: Capsule())
    }

    private var metaText: String {
        var parts: [String] = []
        if post.floor > 0 {
            parts.append("\(post.floor)楼")
        }
        parts.append(relativeTime(post.createTime))
        if !post.ipLocation.isEmpty {
            parts.append(post.ipLocation)
        }
        return parts.joined(separator: " · ")
    }

    private var visibleSubPosts: [SubPostInfo] {
        Array(post.subPosts.prefix(3))
    }

    @ViewBuilder
    private var subPostsSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(visibleSubPosts) { subPost in
                SubPostRow(
                    subPost: subPost,
                    isOP: subPost.authorId == thread.authorId,
                    onImagePress: actions.onImagePress,
                    onLinkPress: actions.onLinkPress,
                    onUserPress: actions.onUserPress,
                    onTopicPress: actions.onTopicPress,
                    onVote: actions.onVote,
                    onVoteMulti: actions.onVoteMulti,
                    voteIsMulti: actions.voteIsMulti,
                    voteIsClosed: actions.voteIsClosed,
                    voteDeadline: actions.voteDeadline,
                    onReply: actions.onReplySubPost,
                    onReport: actions.onReportSubPost,
                    onDelete: actions.onDeleteSubPost,
                    canDelete: actions.canDeleteSubPost
                )
                if subPost.id != visibleSubPosts.last?.id {
                    Rectangle()
                        .fill(theme.separator)
                        .frame(height: 0.5)
                        .padding(.leading, 18)
                }
            }

            if post.subPosts.count > 3 {
                Button {
                    actions.onOpenSubPosts(post)
                } label: {
                    Text("查看全部 \(post.subPosts.count) 条回复")
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(theme.textLink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 8)
                        .padding(.horizontal, 14)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 4)
        .background(theme.surfaceSecondary.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .padding(.horizontal, 14)
    }

    private var actionBar: some View {
        HStack(spacing: 4) {
            actionButton("分享", "square.and.arrow.up") {
                actions.onShare(post)
            }
            actionButton("回复", "bubble.right") {
                actions.onReply(post)
            }
            Spacer(minLength: 8)
            Menu {
                postMenu
            } label: {
                Label("更多", systemImage: "ellipsis")
                    .font(.footnote)
                    .foregroundStyle(theme.textSecondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
            }
        }
        .padding(.horizontal, 6)
        .padding(.bottom, 4)
    }

    private func actionButton(
        _ title: String,
        _ systemImage: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.footnote)
                .foregroundStyle(theme.textSecondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var postMenu: some View {
        Button {
            actions.onCopy(post)
        } label: {
            Label("复制内容", systemImage: "doc.on.doc")
        }
        Button {
            actions.onShare(post)
        } label: {
            Label("分享", systemImage: "square.and.arrow.up")
        }
        Button {
            actions.onReply(post)
        } label: {
            Label("回复", systemImage: "bubble.right")
        }
        if canDelete(post) {
            Button(role: .destructive) {
                actions.onDelete(post)
            } label: {
                Label("删除", systemImage: "trash")
            }
        }
        Button(role: .destructive) {
            actions.onReport(post)
        } label: {
            Label("举报", systemImage: "exclamationmark.bubble")
        }
    }
}

// MARK: - Sub post row

struct SubPostRow: View {
    let subPost: SubPostInfo
    let isOP: Bool
    let onImagePress: ([MediaItem], Int) -> Void
    let onLinkPress: (URL) -> Void
    let onUserPress: (String) -> Void
    let onTopicPress: (String, String) -> Void
    let onVote: (Int) -> Void
    let onVoteMulti: ([Int]) -> Void
    let voteIsMulti: Bool
    let voteIsClosed: Bool
    let voteDeadline: TimeInterval
    let onReply: (SubPostInfo) -> Void
    let onReport: (SubPostInfo) -> Void
    let onDelete: (SubPostInfo) -> Void
    let canDelete: (SubPostInfo) -> Bool

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(isOP ? theme.primary : theme.separator)
                .frame(width: 3)
                .frame(maxHeight: .infinity)

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text(subPost.authorName)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(theme.text)
                        .lineLimit(1)
                    if isOP {
                        Text("楼主")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(theme.primary)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(theme.chip, in: Capsule())
                    }
                    Spacer(minLength: 8)
                    Text(relativeTime(subPost.createTime))
                        .font(.caption2)
                        .foregroundStyle(theme.textTertiary)
                }

                quotedReplyBlock

                if subPost.agreeNum > 0 {
                    Label("\(subPost.agreeNum)", systemImage: "hand.thumbsup")
                        .font(.caption2)
                        .foregroundStyle(theme.textTertiary)
                }
            }
        }
        .padding(.vertical, 8)
        .padding(.leading, 14)
        .padding(.trailing, 12)
        .contentShape(Rectangle())
        .contextMenu {
            Button {
                onReply(subPost)
            } label: {
                Label("回复", systemImage: "bubble.right")
            }
            Button(role: .destructive) {
                onReport(subPost)
            } label: {
                Label("举报", systemImage: "exclamationmark.bubble")
            }
            if canDelete(subPost) {
                Button(role: .destructive) {
                    onDelete(subPost)
                } label: {
                    Label("删除", systemImage: "trash")
                }
            }
        }
    }

    private var quotedReplyBlock: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("引用", systemImage: "quote.opening")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(theme.textTertiary)

            PostContentView(
                segments: subPost.content,
                maxImageCount: 3,
                onImagePress: onImagePress,
                onLinkPress: onLinkPress,
                onUserPress: onUserPress,
                onTopicPress: onTopicPress,
                onVote: onVote,
                onVoteMulti: onVoteMulti,
                voteIsMulti: voteIsMulti,
                voteIsClosed: voteIsClosed,
                voteDeadline: voteDeadline
            )
            .font(.subheadline)
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            theme.surfaceTertiary.opacity(0.55),
            in: RoundedRectangle(cornerRadius: 6)
        )
    }
}

// MARK: - Floating toolbar

struct FloatingToolbar: View {
    let isFavorite: Bool
    let onBackToTop: () -> Void
    let onToggleFavorite: () -> Void
    let onReply: () -> Void
    let onMore: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(spacing: 4) {
            iconButton("arrow.up", "返回顶部", action: onBackToTop)
            iconButton(
                isFavorite ? "star.fill" : "star",
                isFavorite ? "取消收藏" : "收藏",
                action: onToggleFavorite
            )
            Spacer(minLength: 12)
            iconButton("square.and.pencil", "发回复", action: onReply)
            iconButton("ellipsis", "更多", action: onMore)
        }
        .glassNavigationBar(material: .ultraThinMaterial, cornerRadius: 22)
        .frame(maxWidth: 340)
        .shadow(color: .black.opacity(0.08), radius: 12, y: 4)
        .frame(maxWidth: .infinity)
        .padding(.bottom, 2)
    }

    private func iconButton(
        _ systemImage: String,
        _ label: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(theme.text)
                .frame(width: 40, height: 40)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

// MARK: - Load more footer

struct LoadMoreFooter: View {
    let hasMore: Bool
    let isLoading: Bool
    let onLoadMore: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        Group {
            if hasMore {
                VStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text(isLoading ? "加载中..." : "上拉加载更多")
                        .font(.caption)
                        .foregroundStyle(theme.textTertiary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .onAppear {
                    guard !isLoading else { return }
                    onLoadMore()
                }
            } else {
                Text("已显示全部楼层")
                    .font(.caption)
                    .foregroundStyle(theme.textTertiary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
            }
        }
    }
}

// MARK: - Thread menu sheet

struct ThreadMenuSheet: View {
    @Binding var seeLz: Bool
    @Binding var reverse: Bool
    @Binding var immersive: Bool
    let isFavorite: Bool
    let canDelete: Bool
    let onToggleFavorite: () -> Void
    let onShare: () -> Void
    let onCopyLink: () -> Void
    let onJumpPage: () -> Void
    let onReport: () -> Void
    let onDelete: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("阅读设置") {
                    Toggle("只看楼主", isOn: $seeLz)
                    Toggle("倒序浏览", isOn: $reverse)
                    Toggle("沉浸阅读", isOn: $immersive)
                }

                Section("帖子操作") {
                    Button {
                        onToggleFavorite()
                        dismiss()
                    } label: {
                        Label(
                            isFavorite ? "取消收藏" : "收藏",
                            systemImage: isFavorite ? "star.fill" : "star"
                        )
                    }
                    Button {
                        onShare()
                        dismiss()
                    } label: {
                        Label("分享", systemImage: "square.and.arrow.up")
                    }
                    Button {
                        onCopyLink()
                        dismiss()
                    } label: {
                        Label("复制链接", systemImage: "link")
                    }
                    Button {
                        dismiss()
                        onJumpPage()
                    } label: {
                        Label("跳转页码", systemImage: "number")
                    }
                    Button(role: .destructive) {
                        dismiss()
                        onReport()
                    } label: {
                        Label("举报", systemImage: "exclamationmark.bubble")
                    }
                    if canDelete {
                        Button(role: .destructive) {
                            dismiss()
                            onDelete()
                        } label: {
                            Label("删除帖子", systemImage: "trash")
                        }
                    }
                }
            }
            .navigationTitle("帖子菜单")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

// MARK: - Avatar

struct AvatarView: View {
    let portrait: String
    var size: CGFloat

    @Environment(\.appTheme) private var theme

    var body: some View {
        Group {
            if let url = URL(string: portrait), !portrait.isEmpty {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image
                            .resizable()
                            .scaledToFill()
                    } else {
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var placeholder: some View {
        ZStack {
            Circle()
                .fill(theme.surfaceTertiary)
            Image(systemName: "person.fill")
                .font(.system(size: size * 0.44))
                .foregroundStyle(theme.textTertiary)
        }
    }
}

// MARK: - Formatting

private func relativeTime(_ timestamp: TimeInterval) -> String {
    guard timestamp > 0 else { return "未知时间" }
    let formatter = RelativeDateTimeFormatter()
    formatter.locale = Locale(identifier: "zh_CN")
    formatter.unitsStyle = .short
    return formatter.localizedString(
        for: Date(timeIntervalSince1970: timestamp),
        relativeTo: Date()
    )
}

// MARK: - Preview

#Preview("帖子详情") {
    ThreadDetailView(
        thread: PreviewData.threadDetail,
        posts: PreviewData.posts,
        isFavorite: true,
        onJumpToPage: { page in
            print("跳转到第 \(page) 页")
        },
        onToggleFavorite: {
            print("切换收藏")
        },
        onLikePost: { post in
            print("点赞 \(post.id)")
        },
        onOpenSubPosts: { post in
            print("打开楼中楼 \(post.id)")
        }
    )
    .environment(\.appTheme, AppPalette.lightPalette)
}
