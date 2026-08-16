import Foundation
import SwiftUI
import UIKit

// MARK: - Feed List

public struct FeedListView: View {
    public let items: [FeedItem]
    public let onLoadMore: () -> Void
    public let onRefresh: () async -> Void
    public let onOpenThread: (FeedThreadInfo) -> Void
    public let onOpenForum: (FeedForumInfo) -> Void
    public let onOpenUser: (FeedUserInfo) -> Void
    public let onOpenTopic: (FeedTopicInfo) -> Void
    public let onDislike: (FeedItem) -> Void
    public let onBlockAuthor: (FeedItem) -> Void
    public let onShare: (FeedItem) -> Void
    public let onComment: (FeedItem) -> Void
    public let onLike: (FeedItem) -> Void
    public var isLoadingMore: Bool
    public var hasMore: Bool
    public let errorMessage: String?
    public var isInitialLoading: Bool
    public let onRetry: () -> Void

    @Environment(\.appTheme) private var theme
    @State private var didTriggerInitialLoad = false
    @State private var lastRequestedItemID: String?

    public init(
        items: [FeedItem],
        onLoadMore: @escaping () -> Void = {},
        onRefresh: @escaping () async -> Void = {},
        onOpenThread: @escaping (FeedThreadInfo) -> Void = { _ in },
        onOpenForum: @escaping (FeedForumInfo) -> Void = { _ in },
        onOpenUser: @escaping (FeedUserInfo) -> Void = { _ in },
        onOpenTopic: @escaping (FeedTopicInfo) -> Void = { _ in },
        onDislike: @escaping (FeedItem) -> Void = { _ in },
        onBlockAuthor: @escaping (FeedItem) -> Void = { _ in },
        onShare: @escaping (FeedItem) -> Void = { _ in },
        onComment: @escaping (FeedItem) -> Void = { _ in },
        onLike: @escaping (FeedItem) -> Void = { _ in },
        isLoadingMore: Bool = false,
        hasMore: Bool = true,
        errorMessage: String? = nil,
        isInitialLoading: Bool = false,
        onRetry: @escaping () -> Void = {}
    ) {
        self.items = items
        self.onLoadMore = onLoadMore
        self.onRefresh = onRefresh
        self.onOpenThread = onOpenThread
        self.onOpenForum = onOpenForum
        self.onOpenUser = onOpenUser
        self.onOpenTopic = onOpenTopic
        self.onDislike = onDislike
        self.onBlockAuthor = onBlockAuthor
        self.onShare = onShare
        self.onComment = onComment
        self.onLike = onLike
        self.isLoadingMore = isLoadingMore
        self.hasMore = hasMore
        self.errorMessage = errorMessage
        self.isInitialLoading = isInitialLoading
        self.onRetry = onRetry
    }

    public var body: some View {
        List {
            if let errorMessage, !errorMessage.isEmpty, items.isEmpty {
                errorState(message: errorMessage)
            } else if items.isEmpty {
                if isInitialLoading {
                    loadingState
                } else {
                    emptyState
                }
            } else {
                if let errorMessage, !errorMessage.isEmpty {
                    errorRow(message: errorMessage)
                }

                ForEach(items) { item in
                    FeedCardView(
                        item: item,
                        onOpenThread: onOpenThread,
                        onOpenForum: onOpenForum,
                        onOpenUser: onOpenUser,
                        onOpenTopic: onOpenTopic,
                        onDislike: onDislike,
                        onBlockAuthor: onBlockAuthor,
                        onShare: onShare,
                        onComment: onComment,
                        onLike: onLike
                    )
                    .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .onAppear {
                        requestLoadMoreIfNeeded(for: item)
                    }
                }

                if hasMore {
                    HStack(spacing: 8) {
                        ProgressView()
                            .controlSize(.small)
                        if isLoadingMore {
                            Text("加载中")
                                .font(.footnote)
                                .foregroundStyle(theme.textSecondary)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .onAppear {
                        requestLoadMoreForLastItem()
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
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .refreshable {
            await onRefresh()
        }
        .onAppear {
            guard errorMessage == nil || errorMessage?.isEmpty == true,
                  items.isEmpty,
                  hasMore,
                  !isLoadingMore,
                  !isInitialLoading,
                  !didTriggerInitialLoad else { return }
            didTriggerInitialLoad = true
            onLoadMore()
        }
    }

    private var emptyState: some View {
        ContentUnavailableView("暂无内容", systemImage: "tray")
            .frame(maxWidth: .infinity)
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
    }

    private var loadingState: some View {
        VStack(spacing: 10) {
            ProgressView()
                .controlSize(.regular)
            Text("加载中")
                .font(.footnote)
                .foregroundStyle(theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }

    private func errorState(message: String) -> some View {
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
        .padding(.vertical, 24)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }

    private func errorRow(message: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.body.weight(.semibold))
                .foregroundStyle(theme.warning)

            VStack(alignment: .leading, spacing: 2) {
                Text("加载失败")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(theme.text)
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(theme.textSecondary)
                    .lineLimit(2)
            }

            Spacer(minLength: 8)

            Button("重试") {
                onRetry()
            }
            .font(.footnote.weight(.semibold))
        }
        .padding(12)
        .background(
            theme.warning.opacity(0.08),
            in: RoundedRectangle(cornerRadius: 8)
        )
        .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 4, trailing: 12))
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
    }

    private func requestLoadMoreIfNeeded(for item: FeedItem) {
        guard item.id == items.last?.id else { return }
        requestLoadMoreForLastItem()
    }

    private func requestLoadMoreForLastItem() {
        guard let lastID = items.last?.id, lastID != lastRequestedItemID else { return }
        lastRequestedItemID = lastID
        guard hasMore, !isLoadingMore else { return }
        onLoadMore()
    }
}

// MARK: - Feed Card

public struct FeedCardView: View {
    public let item: FeedItem
    public let onOpenThread: (FeedThreadInfo) -> Void
    public let onOpenForum: (FeedForumInfo) -> Void
    public let onOpenUser: (FeedUserInfo) -> Void
    public let onOpenTopic: (FeedTopicInfo) -> Void
    public let onDislike: (FeedItem) -> Void
    public let onBlockAuthor: (FeedItem) -> Void
    public let onShare: (FeedItem) -> Void
    public let onComment: (FeedItem) -> Void
    public let onLike: (FeedItem) -> Void

    @Environment(\.appTheme) private var theme

    public init(
        item: FeedItem,
        onOpenThread: @escaping (FeedThreadInfo) -> Void = { _ in },
        onOpenForum: @escaping (FeedForumInfo) -> Void = { _ in },
        onOpenUser: @escaping (FeedUserInfo) -> Void = { _ in },
        onOpenTopic: @escaping (FeedTopicInfo) -> Void = { _ in },
        onDislike: @escaping (FeedItem) -> Void = { _ in },
        onBlockAuthor: @escaping (FeedItem) -> Void = { _ in },
        onShare: @escaping (FeedItem) -> Void = { _ in },
        onComment: @escaping (FeedItem) -> Void = { _ in },
        onLike: @escaping (FeedItem) -> Void = { _ in }
    ) {
        self.item = item
        self.onOpenThread = onOpenThread
        self.onOpenForum = onOpenForum
        self.onOpenUser = onOpenUser
        self.onOpenTopic = onOpenTopic
        self.onDislike = onDislike
        self.onBlockAuthor = onBlockAuthor
        self.onShare = onShare
        self.onComment = onComment
        self.onLike = onLike
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            cardContent
        }
        .background(theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(theme.border, lineWidth: 0.5)
        }
        .contentShape(Rectangle())
        .contextMenu {
            contextMenuActions
        }
    }

    @ViewBuilder
    private var cardContent: some View {
        switch item.type {
        case .thread:
            if let thread = item.threadInfo {
                threadCard(thread)
            }
        case .forum:
            if let forum = item.forumInfo {
                ForumCardView(forum: forum) {
                    onOpenForum(forum)
                }
            }
        case .topic:
            if let topic = item.topicInfo {
                TopicCardView(topic: topic) {
                    onOpenTopic(topic)
                }
            }
        case .user:
            if let user = item.userInfo {
                UserCardView(user: user) {
                    onOpenUser(user)
                }
            }
        }
    }

    @ViewBuilder
    private func threadCard(_ thread: FeedThreadInfo) -> some View {
        if let media = thread.media.first {
            HeroThreadCardView(
                thread: thread,
                media: media,
                onOpenThread: { onOpenThread(thread) },
                onOpenForum: {
                    onOpenForum(FeedForumInfo(id: thread.forumId, forumName: thread.forumName))
                },
                onOpenUser: {
                    onOpenUser(
                        FeedUserInfo(
                            id: thread.authorId,
                            name: thread.authorNameShow.isEmpty ? thread.authorName : thread.authorNameShow,
                            portrait: thread.authorPortrait
                        )
                    )
                },
                onShare: { onShare(item) },
                onComment: { onComment(item) },
                onLike: { onLike(item) }
            )
        } else {
            TextThreadCardView(
                thread: thread,
                onOpenThread: { onOpenThread(thread) },
                onOpenForum: {
                    onOpenForum(FeedForumInfo(id: thread.forumId, forumName: thread.forumName))
                },
                onOpenUser: {
                    onOpenUser(
                        FeedUserInfo(
                            id: thread.authorId,
                            name: thread.authorNameShow.isEmpty ? thread.authorName : thread.authorNameShow,
                            portrait: thread.authorPortrait
                        )
                    )
                },
                onShare: { onShare(item) },
                onComment: { onComment(item) },
                onLike: { onLike(item) }
            )
        }
    }

    @ViewBuilder
    private var contextMenuActions: some View {
        Button(role: .destructive) {
            onDislike(item)
        } label: {
            Label("不感兴趣", systemImage: "hand.thumbsdown")
        }

        if item.threadInfo != nil {
            Button(role: .destructive) {
                onBlockAuthor(item)
            } label: {
                Label("屏蔽作者", systemImage: "person.crop.circle.badge.xmark")
            }
        }

        Button {
            copyTitle()
        } label: {
            Label("复制标题", systemImage: "doc.on.doc")
        }
    }

    private func copyTitle() {
        let title = item.threadInfo?.title
            ?? item.forumInfo?.forumName
            ?? item.topicInfo?.topicName
            ?? item.userInfo?.name
            ?? ""
        guard !title.isEmpty else { return }
        UIPasteboard.general.string = title
    }
}

// MARK: - Thread Cards

private struct HeroThreadCardView: View {
    let thread: FeedThreadInfo
    let media: MediaItem
    let onOpenThread: () -> Void
    let onOpenForum: () -> Void
    let onOpenUser: () -> Void
    let onShare: () -> Void
    let onComment: () -> Void
    let onLike: () -> Void

    @Environment(\.appTheme) private var theme
    @Namespace private var heroImageNamespace

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onOpenThread) {
                VStack(alignment: .leading, spacing: 10) {
                    ThreadBadgesView(isTop: thread.isTop, isGood: thread.isGood)
                    Text(thread.title)
                        .font(.headline)
                        .foregroundStyle(theme.text)
                        .multilineTextAlignment(.leading)
                    if !thread.abstract.isEmpty {
                        Text(thread.abstract)
                            .font(.subheadline)
                            .foregroundStyle(theme.textSecondary)
                            .lineLimit(3)
                            .multilineTextAlignment(.leading)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
            }
            .buttonStyle(.plain)

            if media.type == "image" {
                NavigationLink {
                    ImageViewerHeroDestination(
                        item: media,
                        watermarkSubtitle: watermarkSubtitle
                    )
                } label: {
                    MediaImageView(media: media, showsBottomFade: true)
                        .matchedTransitionSource(
                            id: "hero-\(thread.id)",
                            in: heroImageNamespace
                        )
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 12)
                .padding(.bottom, 10)
                .accessibilityLabel("查看图片")
            } else {
                Button(action: onOpenThread) {
                    MediaImageView(media: media, showsBottomFade: true)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 12)
                .padding(.bottom, 10)
            }

            HStack(alignment: .center, spacing: 8) {
                AuthorRowView(
                    userName: thread.authorNameShow.isEmpty ? thread.authorName : thread.authorNameShow,
                    portraitURL: thread.authorPortrait,
                    timestamp: thread.createTime,
                    onOpenUser: onOpenUser
                )
                Spacer(minLength: 8)
                ForumChipView(
                    forumName: thread.forumName,
                    avatarURL: nil,
                    onOpenForum: onOpenForum
                )
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 10)

            FeedActionBar(
                replyCount: thread.replyNum,
                likeCount: thread.zanNum,
                onShare: onShare,
                onComment: onComment,
                onLike: onLike
            )
        }
    }

    private var watermarkSubtitle: String {
        let author = thread.authorNameShow.isEmpty ? thread.authorName : thread.authorNameShow
        guard !thread.forumName.isEmpty else { return author }
        return "\(thread.forumName) · \(author)"
    }
}

private struct ImageViewerHeroDestination: View {
    let item: MediaItem
    let watermarkSubtitle: String?

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ImageViewerView(
            images: [item],
            initialIndex: 0,
            watermarkSubtitle: watermarkSubtitle,
            onClose: {
                dismiss()
            }
        )
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
    }
}

private struct TextThreadCardView: View {
    let thread: FeedThreadInfo
    let onOpenThread: () -> Void
    let onOpenForum: () -> Void
    let onOpenUser: () -> Void
    let onShare: () -> Void
    let onComment: () -> Void
    let onLike: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onOpenThread) {
                VStack(alignment: .leading, spacing: 8) {
                    ThreadBadgesView(isTop: thread.isTop, isGood: thread.isGood)
                    Text(thread.title)
                        .font(.headline)
                        .foregroundStyle(theme.text)
                        .multilineTextAlignment(.leading)
                    if !thread.abstract.isEmpty {
                        Text(thread.abstract)
                            .font(.subheadline)
                            .foregroundStyle(theme.textSecondary)
                            .lineLimit(3)
                            .multilineTextAlignment(.leading)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
            }
            .buttonStyle(.plain)

            HStack(alignment: .center, spacing: 8) {
                AuthorRowView(
                    userName: thread.authorNameShow.isEmpty ? thread.authorName : thread.authorNameShow,
                    portraitURL: thread.authorPortrait,
                    timestamp: thread.createTime,
                    onOpenUser: onOpenUser
                )
                Spacer(minLength: 8)
                ForumChipView(
                    forumName: thread.forumName,
                    avatarURL: nil,
                    onOpenForum: onOpenForum
                )
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 10)

            FeedActionBar(
                replyCount: thread.replyNum,
                likeCount: thread.zanNum,
                onShare: onShare,
                onComment: onComment,
                onLike: onLike
            )
        }
    }
}

private struct ThreadBadgesView: View {
    let isTop: Bool
    let isGood: Bool

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(spacing: 6) {
            if isTop {
                badge("置顶", color: theme.accent)
            }
            if isGood {
                badge("精华", color: theme.warning)
            }
        }
    }

    private func badge(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 4))
            .foregroundStyle(color)
    }
}

// MARK: - Forum, Topic and User Cards

private struct ForumCardView: View {
    let forum: FeedForumInfo
    let onOpenForum: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        Button(action: onOpenForum) {
            HStack(spacing: 12) {
                AvatarView(urlString: forum.avatar, fallbackText: forum.forumName, size: 48)
                VStack(alignment: .leading, spacing: 4) {
                    Text(forum.forumName)
                        .font(.headline)
                        .foregroundStyle(theme.text)
                        .lineLimit(1)
                    Text("\(compactCount(forum.memberCount)) 关注 · \(compactCount(forum.threadCount)) 帖子")
                        .font(.caption)
                        .foregroundStyle(theme.textSecondary)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(theme.textTertiary)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
    }
}

private struct TopicCardView: View {
    let topic: FeedTopicInfo
    let onOpenTopic: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        Button(action: onOpenTopic) {
            HStack(spacing: 12) {
                Image(systemName: topic.isHot ? "flame.fill" : "bubble.left.and.bubble.right.fill")
                    .font(.title2)
                    .foregroundStyle(topic.isHot ? theme.warning : theme.accent)
                    .frame(width: 44, height: 44)
                    .background(
                        (topic.isHot ? theme.warning : theme.accent).opacity(0.1),
                        in: RoundedRectangle(cornerRadius: 8)
                    )

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(topic.topicName)
                            .font(.headline)
                            .foregroundStyle(theme.text)
                            .lineLimit(1)
                        if topic.isHot {
                            Text("热")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(theme.warning, in: Capsule())
                        }
                    }
                    if !topic.topicDesc.isEmpty {
                        Text(topic.topicDesc)
                            .font(.caption)
                            .foregroundStyle(theme.textSecondary)
                            .lineLimit(1)
                    }
                    Text("\(compactCount(topic.discussNum)) 讨论")
                        .font(.caption2)
                        .foregroundStyle(theme.textTertiary)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(theme.textTertiary)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
    }
}

private struct UserCardView: View {
    let user: FeedUserInfo
    let onOpenUser: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        Button(action: onOpenUser) {
            HStack(spacing: 12) {
                AvatarView(urlString: user.portrait, fallbackText: user.name, size: 48)
                VStack(alignment: .leading, spacing: 4) {
                    Text(user.name)
                        .font(.headline)
                        .foregroundStyle(theme.text)
                        .lineLimit(1)
                    Text("查看个人主页")
                        .font(.caption)
                        .foregroundStyle(theme.textSecondary)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(theme.textTertiary)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Shared Components

private struct AuthorRowView: View {
    let userName: String
    let portraitURL: String?
    let timestamp: TimeInterval
    let onOpenUser: () -> Void

    @Environment(\.appTheme) private var theme
    @State private var showsAvatarPreview = false

    var body: some View {
        HStack(spacing: 8) {
            // 头像点击只打开大图预览；作者名和 chevron 仍负责跳转用户主页，避免嵌套按钮冲突。
            if let portraitURL, validURL(portraitURL) != nil {
                Button {
                    showsAvatarPreview = true
                } label: {
                    AvatarView(urlString: portraitURL, fallbackText: userName, size: 32)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("查看头像大图")
            } else {
                AvatarView(urlString: portraitURL ?? "", fallbackText: userName, size: 32)
            }

            Button(action: onOpenUser) {
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(userName)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(theme.text)
                            .lineLimit(1)
                        if timestamp > 0 {
                            Text(shortTime(timestamp))
                                .font(.caption)
                                .foregroundStyle(theme.textTertiary)
                        }
                    }
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.right")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(theme.textTertiary)
                }
            }
            .buttonStyle(.plain)
        }
        .sheet(isPresented: $showsAvatarPreview) {
            ImageViewerView(
                images: [MediaItem(src: portraitURL ?? "")],
                initialIndex: 0,
                watermarkSubtitle: userName,
                onClose: {
                    showsAvatarPreview = false
                }
            )
        }
    }
}

private struct ForumChipView: View {
    let forumName: String
    let avatarURL: String?
    let onOpenForum: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        Button(action: onOpenForum) {
            HStack(spacing: 4) {
                if let avatarURL, let url = URL(string: avatarURL) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFill()
                        case .failure:
                            Image(systemName: "person.2.fill")
                                .font(.system(size: 10))
                        case .empty:
                            ProgressView()
                                .controlSize(.mini)
                        @unknown default:
                            Image(systemName: "person.2.fill")
                                .font(.system(size: 10))
                        }
                    }
                    .frame(width: 14, height: 14)
                    .clipShape(Circle())
                } else {
                    Image(systemName: "person.2.fill")
                        .font(.system(size: 10))
                }

                Text(forumName)
                    .font(.caption.weight(.medium))
                    .lineLimit(1)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(theme.chip)
            .foregroundStyle(theme.onChip)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .fixedSize()
    }
}

private struct FeedActionBar: View {
    let replyCount: Int
    let likeCount: Int
    let onShare: () -> Void
    let onComment: () -> Void
    let onLike: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(spacing: 0) {
            action(
                title: "分享",
                systemImage: "square.and.arrow.up",
                action: onShare
            )
            action(
                title: replyCount > 0 ? compactCount(replyCount) : "评论",
                systemImage: "bubble.right",
                action: onComment
            )
            action(
                title: likeCount > 0 ? compactCount(likeCount) : "点赞",
                systemImage: "hand.thumbsup",
                action: onLike
            )
        }
        .padding(.horizontal, 8)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(theme.divider)
                .frame(height: 0.5)
        }
    }

    private func action(title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.footnote)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
        }
        .buttonStyle(.plain)
        .foregroundStyle(theme.textSecondary)
    }
}

private struct AvatarView: View {
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

private struct MediaImageView: View {
    let media: MediaItem
    var showsBottomFade = false

    @Environment(\.appTheme) private var theme

    var body: some View {
        ZStack {
            theme.surfaceSecondary

            if let url = URL(string: media.src), !media.src.isEmpty {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure:
                        placeholder
                    case .empty:
                        ProgressView()
                            .tint(theme.textTertiary)
                    @unknown default:
                        placeholder
                    }
                }
            } else {
                placeholder
            }

            if showsBottomFade {
                GradientBlurView(
                    colors: [.clear, .black.opacity(0.55)],
                    startPoint: .top,
                    endPoint: .bottom,
                    blurStyle: .systemThinMaterial
                )
                .allowsHitTesting(false)
            }

            if media.type == "video" {
                Image(systemName: "play.fill")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.white)
                    .padding(10)
                    .background(.black.opacity(0.45), in: Circle())
            } else if media.type == "audio" {
                Image(systemName: "music.note")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.white)
                    .padding(10)
                    .background(.black.opacity(0.45), in: Circle())
            }
        }
        .aspectRatio(mediaRatio, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .clipped()
    }

    private var placeholder: some View {
        VStack(spacing: 6) {
            Image(systemName: "photo")
                .font(.title2)
            Text("图片加载失败")
                .font(.caption)
        }
        .foregroundStyle(theme.textTertiary)
    }

    private var mediaRatio: CGFloat {
        guard media.width > 0, media.height > 0 else { return 16.0 / 10.0 }
        return min(max(media.width / media.height, 0.75), 2.4)
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

private func shortTime(_ timestamp: TimeInterval) -> String {
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

// MARK: - Preview

#Preview("信息流") {
    NavigationStack {
        FeedListView(items: PreviewData.feedItems)
    }
    .environment(\.appTheme, .lightPalette)
}
