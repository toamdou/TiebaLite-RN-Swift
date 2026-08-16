import Foundation
import SwiftUI

// MARK: - Topic List

public struct TopicListView: View {
    public let topics: [FeedTopicInfo]
    public let onOpenTopic: (FeedTopicInfo) -> Void
    public let onRefresh: () async -> Void
    public let onLoadMore: () -> Void
    public let isLoadingMore: Bool
    public let hasMore: Bool

    @Environment(\.appTheme) private var theme
    @State private var didTriggerInitialLoad = false
    @State private var lastRequestedTopicID: String?

    public init(
        topics: [FeedTopicInfo],
        onOpenTopic: @escaping (FeedTopicInfo) -> Void = { _ in },
        onRefresh: @escaping () async -> Void = {},
        onLoadMore: @escaping () -> Void = {},
        isLoadingMore: Bool = false,
        hasMore: Bool = true
    ) {
        self.topics = topics
        self.onOpenTopic = onOpenTopic
        self.onRefresh = onRefresh
        self.onLoadMore = onLoadMore
        self.isLoadingMore = isLoadingMore
        self.hasMore = hasMore
    }

    public var body: some View {
        List {
            if topics.isEmpty {
                Section {
                    ContentUnavailableView("暂无话题", systemImage: "number")
                        .frame(maxWidth: .infinity)
                        .listRowInsets(EdgeInsets(top: 24, leading: 16, bottom: 24, trailing: 16))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                }
            } else {
                Section {
                    ForEach(rankedTopics) { ranked in
                        Button {
                            onOpenTopic(ranked.topic)
                        } label: {
                            TopicListRow(topic: ranked.topic, rank: ranked.rank)
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .onAppear {
                            requestLoadMoreIfNeeded(for: ranked.topic)
                        }
                    }

                    footer
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .refreshable {
            await onRefresh()
        }
        .navigationTitle("热门话题")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            guard topics.isEmpty, hasMore, !isLoadingMore, !didTriggerInitialLoad else { return }
            didTriggerInitialLoad = true
            onLoadMore()
        }
    }

    private var rankedTopics: [RankedTopic] {
        topics.enumerated().map { RankedTopic(rank: $0.offset + 1, topic: $0.element) }
    }

    @ViewBuilder
    private var footer: some View {
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
                requestLoadMoreForLastTopic()
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

    private func requestLoadMoreIfNeeded(for topic: FeedTopicInfo) {
        guard topic.id == topics.last?.id else { return }
        requestLoadMoreForLastTopic()
    }

    private func requestLoadMoreForLastTopic() {
        guard let lastID = topics.last?.id, lastID != lastRequestedTopicID else { return }
        lastRequestedTopicID = lastID
        guard hasMore, !isLoadingMore else { return }
        onLoadMore()
    }
}

private struct RankedTopic: Identifiable {
    let rank: Int
    let topic: FeedTopicInfo

    var id: String { topic.id }
}

private struct TopicListRow: View {
    let topic: FeedTopicInfo
    let rank: Int

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(spacing: 12) {
            rankBadge

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(topic.topicName.isEmpty ? "未命名话题" : topic.topicName)
                        .font(.headline)
                        .foregroundStyle(theme.text)
                        .lineLimit(1)

                    if topic.isNew {
                        newBadge
                    }

                    if topic.isHot {
                        hotBadge
                    }
                }

                if !topic.topicDesc.isEmpty {
                    Text(topic.topicDesc)
                        .font(.subheadline)
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(1)
                }

                Text("\(topicCompactCount(topic.discussNum)) 讨论")
                    .font(.caption)
                    .foregroundStyle(theme.textTertiary)
            }

            Spacer(minLength: 8)

            if rank <= 3 {
                topicCover
            }

            Image(systemName: "chevron.right")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(theme.textTertiary)
        }
        .padding(12)
        .background(theme.card, in: RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(theme.border, lineWidth: 0.5)
        }
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private var rankBadge: some View {
        if rank <= 3 {
            Text("\(rank)")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 26, height: 26)
                .background(rankColor, in: Circle())
        } else {
            Text("\(rank)")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(theme.textTertiary)
                .frame(width: 26, height: 26)
        }
    }

    private var rankColor: Color {
        switch rank {
        case 1:
            return Color(hex: 0xFF3B30)
        case 2:
            return Color(hex: 0xFF9500)
        case 3:
            return Color(hex: 0xFFCC00)
        default:
            return theme.surfaceTertiary
        }
    }

    @ViewBuilder
    private var topicCover: some View {
        let coverURL = validURL(topic.imageUrl ?? "")
        if let coverURL = coverURL {
            AsyncImage(url: coverURL) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                case .failure:
                    coverPlaceholder
                case .empty:
                    ProgressView()
                        .controlSize(.small)
                        .frame(width: 68, height: 68)
                        .background(theme.surfaceSecondary)
                @unknown default:
                    coverPlaceholder
                }
            }
            .frame(width: 68, height: 68)
            .background(theme.surfaceSecondary)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(theme.border, lineWidth: 0.5)
            }
        } else {
            coverPlaceholder
        }
    }

    private var coverPlaceholder: some View {
        ZStack {
            theme.surfaceSecondary
            Image(systemName: "photo")
                .font(.subheadline)
                .foregroundStyle(theme.textTertiary)
        }
        .frame(width: 68, height: 68)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(theme.border, lineWidth: 0.5)
        }
    }

    private var newBadge: some View {
        Text("新")
            .font(.caption2.weight(.bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(theme.primary, in: Capsule())
    }

    private var hotBadge: some View {
        Text("热")
            .font(.caption2.weight(.bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(theme.warning, in: Capsule())
    }
}

// MARK: - Topic Detail

public struct TopicDetailView: View {
    public let topic: FeedTopicInfo
    public let threads: [FeedThreadInfo]
    public let onOpenThread: (FeedThreadInfo) -> Void
    public let onRefresh: () async -> Void
    public let onLoadMore: () -> Void
    public let onShare: () -> Void
    public let onCopyLink: () -> Void
    public let isLoadingMore: Bool
    public let hasMore: Bool

    @Environment(\.appTheme) private var theme
    @State private var didTriggerInitialLoad = false
    @State private var lastRequestedThreadID: String?

    public init(
        topic: FeedTopicInfo,
        threads: [FeedThreadInfo] = [],
        onOpenThread: @escaping (FeedThreadInfo) -> Void = { _ in },
        onRefresh: @escaping () async -> Void = {},
        onLoadMore: @escaping () -> Void = {},
        onShare: @escaping () -> Void = {},
        onCopyLink: @escaping () -> Void = {},
        isLoadingMore: Bool = false,
        hasMore: Bool = true
    ) {
        self.topic = topic
        self.threads = threads
        self.onOpenThread = onOpenThread
        self.onRefresh = onRefresh
        self.onLoadMore = onLoadMore
        self.onShare = onShare
        self.onCopyLink = onCopyLink
        self.isLoadingMore = isLoadingMore
        self.hasMore = hasMore
    }

    public var body: some View {
        List {
            Section {
                TopicHeaderView(
                    topic: topic,
                    onShare: onShare,
                    onCopyLink: onCopyLink
                )
                .listRowInsets(EdgeInsets(top: 10, leading: 12, bottom: 8, trailing: 12))
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            }

            if !topic.relateForum.isEmpty {
                Section("相关吧") {
                    LazyVGrid(
                        columns: [GridItem(.adaptive(minimum: 140), spacing: 10)],
                        spacing: 10
                    ) {
                        ForEach(topic.relateForum) { forum in
                            TopicRelatedForumCard(forum: forum)
                        }
                    }
                    .padding(.vertical, 6)
                    .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                }
            }

            if threads.isEmpty {
                Section {
                    ContentUnavailableView(
                        "暂无讨论",
                        systemImage: "bubble.left.and.bubble.right",
                        description: Text("该话题下还没有帖子")
                    )
                    .frame(maxWidth: .infinity)
                    .listRowInsets(EdgeInsets(top: 24, leading: 16, bottom: 24, trailing: 16))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                }
            } else {
                Section {
                    ForEach(threads) { thread in
                        TopicThreadRow(thread: thread) {
                            onOpenThread(thread)
                        }
                        .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .onAppear {
                            requestLoadMoreIfNeeded(for: thread)
                        }
                    }

                    footer
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(theme.background)
        .refreshable {
            await onRefresh()
        }
        .navigationTitle(topic.topicName.isEmpty ? "话题详情" : topic.topicName)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            guard threads.isEmpty, hasMore, !isLoadingMore, !didTriggerInitialLoad else { return }
            didTriggerInitialLoad = true
            onLoadMore()
        }
    }

    @ViewBuilder
    private var footer: some View {
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

private struct TopicHeaderView: View {
    let topic: FeedTopicInfo
    let onShare: () -> Void
    let onCopyLink: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "number")
                .font(.title2.weight(.bold))
                .foregroundStyle(theme.primary)
                .frame(width: 48, height: 48)
                .background(theme.primaryLight, in: RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Text("#\(topic.topicName)#")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(theme.text)
                        .lineLimit(2)

                    if topic.isNew {
                        Text("新")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(theme.primary, in: Capsule())
                    }

                    if topic.isHot {
                        Text("热")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(theme.warning, in: Capsule())
                    }
                }

                Text("\(topicCompactCount(topic.discussNum)) 讨论")
                    .font(.subheadline)
                    .foregroundStyle(theme.textSecondary)

                if !topic.topicDesc.isEmpty {
                    Text(topic.topicDesc)
                        .font(.footnote)
                        .foregroundStyle(theme.textTertiary)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Spacer(minLength: 4)

            Menu {
                Button {
                    onShare()
                } label: {
                    Label("分享", systemImage: "square.and.arrow.up")
                }

                Button {
                    onCopyLink()
                } label: {
                    Label("复制链接", systemImage: "doc.on.doc")
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(.title3)
                    .foregroundStyle(theme.textSecondary)
                    .frame(width: 34, height: 34)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("话题操作")
        }
        .padding(14)
        .background(theme.card, in: RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(theme.border, lineWidth: 0.5)
        }
    }
}

private struct TopicRelatedForumCard: View {
    let forum: FeedForumInfo

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(spacing: 10) {
            forumAvatar

            VStack(alignment: .leading, spacing: 3) {
                Text(forumName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(theme.text)
                    .lineLimit(1)

                if forum.memberCount > 0 {
                    Text("\(topicCompactCount(forum.memberCount)) 关注")
                        .font(.caption)
                        .foregroundStyle(theme.textTertiary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.card, in: RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(theme.border, lineWidth: 0.5)
        }
    }

    @ViewBuilder
    private var forumAvatar: some View {
        let avatarURL = validURL(forum.avatar)
        if let avatarURL = avatarURL {
            AsyncImage(url: avatarURL) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                case .failure:
                    avatarPlaceholder
                case .empty:
                    ProgressView()
                        .controlSize(.small)
                @unknown default:
                    avatarPlaceholder
                }
            }
            .frame(width: 36, height: 36)
            .background(theme.surfaceSecondary)
            .clipShape(Circle())
        } else {
            avatarPlaceholder
        }
    }

    private var avatarPlaceholder: some View {
        ZStack {
            theme.surfaceSecondary
            Image(systemName: "person.2.fill")
                .font(.caption)
                .foregroundStyle(theme.textTertiary)
        }
        .frame(width: 36, height: 36)
        .clipShape(Circle())
    }

    private var forumName: String {
        forum.forumName.hasSuffix("吧") ? forum.forumName : "\(forum.forumName)吧"
    }
}

// MARK: - Topic Thread Row

public struct TopicThreadRow: View {
    public let thread: FeedThreadInfo
    public let onOpenThread: () -> Void

    @Environment(\.appTheme) private var theme

    public init(
        thread: FeedThreadInfo,
        onOpenThread: @escaping () -> Void = {}
    ) {
        self.thread = thread
        self.onOpenThread = onOpenThread
    }

    public var body: some View {
        Button(action: onOpenThread) {
            VStack(alignment: .leading, spacing: 8) {
                Text(thread.title.isEmpty ? "无标题" : thread.title)
                    .font(.headline)
                    .foregroundStyle(theme.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                if !thread.abstract.isEmpty {
                    Text(thread.abstract)
                        .font(.subheadline)
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }

                HStack(spacing: 12) {
                    HStack(spacing: 4) {
                        Image(systemName: "person.2.fill")
                        Text(thread.forumName.isEmpty ? "未知吧" : "\(thread.forumName)吧")
                    }
                    .lineLimit(1)

                    Spacer(minLength: 8)

                    Label("\(topicCompactCount(thread.replyNum)) 讨论", systemImage: "bubble.right")

                    Text(topicShortTime(thread.createTime))
                }
                .font(.caption)
                .foregroundStyle(theme.textTertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(theme.card, in: RoundedRectangle(cornerRadius: 8))
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(theme.border, lineWidth: 0.5)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Formatting

private func topicCompactCount(_ count: Int) -> String {
    if count >= 100_000_000 {
        return String(format: "%.1f亿", Double(count) / 100_000_000)
    }
    if count >= 10_000 {
        return String(format: "%.1f万", Double(count) / 10_000)
    }
    return "\(count)"
}

private func topicShortTime(_ timestamp: TimeInterval) -> String {
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

#Preview("热门话题") {
    NavigationStack {
        TopicListView(
            topics: [
                FeedTopicInfo(
                    id: "t1",
                    topicName: "iOS 26",
                    topicDesc: "新系统体验、问题反馈与技巧交流",
                    discussNum: 128_000,
                    isHot: true,
                    isNew: true,
                    imageUrl: "https://example.com/topic-ios.png"
                ),
                FeedTopicInfo(
                    id: "t2",
                    topicName: "SwiftUI",
                    topicDesc: "SwiftUI 开发资源与实战分享",
                    discussNum: 45_600,
                    isHot: true,
                    imageUrl: "https://example.com/topic-swiftui.png"
                ),
                FeedTopicInfo(
                    id: "t3",
                    topicName: "数码闲聊",
                    topicDesc: "手机、电脑与智能设备讨论",
                    discussNum: 32_800,
                    isHot: false,
                    imageUrl: "https://example.com/topic-digital.png"
                ),
            ]
        )
    }
    .environment(\.appTheme, .lightPalette)
}

#Preview("话题详情") {
    NavigationStack {
        TopicDetailView(
            topic: FeedTopicInfo(
                id: "t1",
                topicName: "iOS 26",
                topicDesc: "新系统体验、问题反馈与技巧交流",
                discussNum: 128_000,
                isHot: true,
                isNew: true,
                imageUrl: "https://example.com/topic-ios.png",
                relateForum: [
                    FeedForumInfo(
                        id: "f1",
                        forumName: "苹果",
                        avatar: "https://example.com/forum-ios.png",
                        memberCount: 128_000
                    ),
                    FeedForumInfo(
                        id: "f2",
                        forumName: "Swift",
                        avatar: "https://example.com/forum-swift.png",
                        memberCount: 92_000
                    )
                ]
            ),
            threads: PreviewData.feedItems.compactMap(\.threadInfo),
            onOpenThread: { thread in
                print("打开帖子 \(thread.id)")
            },
            onShare: {
                print("分享话题")
            },
            onCopyLink: {
                print("复制话题链接")
            }
        )
    }
    .environment(\.appTheme, .lightPalette)
}
