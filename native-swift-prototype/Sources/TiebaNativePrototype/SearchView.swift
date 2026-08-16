import Foundation
import Observation
import SwiftUI

// MARK: - Search Tab

public enum SearchTab: String, CaseIterable, Identifiable, Hashable, Sendable {
    case thread
    case forum
    case user

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .thread: return "贴"
        case .forum: return "吧"
        case .user: return "人"
        }
    }
}

@Observable
public final class SearchViewModel {
    var query: String
    var searchedKeyword: String
    var selectedTab: SearchTab
    var hasSearched: Bool
    var threadSort: SearchThreadOrder

    init(
        query: String = "",
        searchedKeyword: String = "",
        selectedTab: SearchTab = .thread,
        hasSearched: Bool = false,
        threadSort: SearchThreadOrder = .newFirst
    ) {
        self.query = query
        self.searchedKeyword = searchedKeyword
        self.selectedTab = selectedTab
        self.hasSearched = hasSearched
        self.threadSort = threadSort
    }
}

// MARK: - Search View

public struct SearchView: View {
    public let suggestions: [String]
    public let history: [String]
    public let threads: [FeedThreadInfo]
    public let forums: [FeedForumInfo]
    public let users: [FeedUserInfo]
    public let isLoading: Bool
    public let errorMessage: String?

    public let onSearch: (String, SearchTab) -> Void
    public let onSuggestionTap: (String) -> Void
    public let onHistoryTap: (String) -> Void
    public let onClearHistory: () -> Void
    public let onDeleteHistory: (String) -> Void
    public let onOpenThread: (FeedThreadInfo) -> Void
    public let onOpenForum: (FeedForumInfo) -> Void
    public let onOpenUser: (FeedUserInfo) -> Void
    public let onThreadSortChange: (SearchThreadOrder) -> Void
    public let onDebouncedQueryChange: (String) -> Void

    @Environment(\.appTheme) private var theme

    @State private var viewModel: SearchViewModel
    @StateObject private var historyStore: SearchHistoryStore
    private let queryDebouncer = makeDebouncer(delay: 0.4)

    public init(
        suggestions: [String] = [],
        history: [String] = [],
        threads: [FeedThreadInfo] = [],
        forums: [FeedForumInfo] = [],
        users: [FeedUserInfo] = [],
        isLoading: Bool = false,
        errorMessage: String? = nil,
        initialKeyword: String = "",
        initialTab: SearchTab = .thread,
        startsSearched: Bool = false,
        onSearch: @escaping (String, SearchTab) -> Void = { _, _ in },
        onSuggestionTap: @escaping (String) -> Void = { _ in },
        onHistoryTap: @escaping (String) -> Void = { _ in },
        onClearHistory: @escaping () -> Void = {},
        onDeleteHistory: @escaping (String) -> Void = { _ in },
        onOpenThread: @escaping (FeedThreadInfo) -> Void = { _ in },
        onOpenForum: @escaping (FeedForumInfo) -> Void = { _ in },
        onOpenUser: @escaping (FeedUserInfo) -> Void = { _ in },
        onThreadSortChange: @escaping (SearchThreadOrder) -> Void = { _ in },
        onDebouncedQueryChange: @escaping (String) -> Void = { _ in }
    ) {
        self.suggestions = suggestions
        self.history = history
        self.threads = threads
        self.forums = forums
        self.users = users
        self.isLoading = isLoading
        self.errorMessage = errorMessage
        self.onSearch = onSearch
        self.onSuggestionTap = onSuggestionTap
        self.onHistoryTap = onHistoryTap
        self.onClearHistory = onClearHistory
        self.onDeleteHistory = onDeleteHistory
        self.onOpenThread = onOpenThread
        self.onOpenForum = onOpenForum
        self.onOpenUser = onOpenUser
        self.onThreadSortChange = onThreadSortChange
        self.onDebouncedQueryChange = onDebouncedQueryChange

        let trimmedInitial = initialKeyword.trimmingCharacters(in: .whitespacesAndNewlines)
        _viewModel = State(initialValue: SearchViewModel(
            query: trimmedInitial,
            searchedKeyword: startsSearched ? trimmedInitial : "",
            selectedTab: initialTab,
            hasSearched: startsSearched && !trimmedInitial.isEmpty
        ))
        let store = SearchHistoryStore(scope: .global)
        store.seedIfEmpty(history)
        _historyStore = StateObject(wrappedValue: store)
    }

    public var body: some View {
        @Bindable var viewModel = viewModel

        Group {
            if !trimmedQuery.isEmpty && !hasSearched {
                preSearchContent
            } else if hasSearched {
                resultsContent
            } else {
                idleContent
            }
        }
        .navigationTitle("搜索")
        .searchable(
            text: $viewModel.query,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: "搜索贴吧、帖子、用户"
        )
        .onSubmit(of: .search) {
            submitSearch()
        }
        .onChange(of: viewModel.query) { _, newValue in
            handleQueryChange(newValue)
        }
        .onChange(of: viewModel.selectedTab) { _, newTab in
            guard viewModel.hasSearched, !viewModel.searchedKeyword.isEmpty else { return }
            onSearch(viewModel.searchedKeyword, newTab)
        }
        .onChange(of: viewModel.threadSort) { _, newOrder in
            guard viewModel.hasSearched, !viewModel.searchedKeyword.isEmpty else { return }
            onThreadSortChange(newOrder)
        }
    }

    // MARK: Content

    private var trimmedQuery: String {
        viewModel.query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var hasSearched: Bool {
        viewModel.hasSearched
    }

    private var selectedTab: SearchTab {
        viewModel.selectedTab
    }

    private var uniqueSuggestions: [String] {
        uniqueStrings(suggestions)
    }

    private var uniqueHistoryEntries: [SearchHistoryEntry] {
        var seen = Set<String>()
        return historyStore.entries.filter { seen.insert($0.keyword.lowercased()).inserted }
    }

    private var idleContent: some View {
        ContentUnavailableView("开始搜索", systemImage: "magnifyingglass")
            .foregroundStyle(theme.textSecondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(theme.background)
    }

    private var preSearchContent: some View {
        List {
            if !uniqueSuggestions.isEmpty {
                Section {
                    ForEach(uniqueSuggestions, id: \.self) { suggestion in
                        Button {
                            selectSuggestion(suggestion)
                        } label: {
                            Label(suggestion, systemImage: "magnifyingglass")
                                .foregroundStyle(theme.text)
                                .lineLimit(1)
                        }
                        .buttonStyle(.plain)
                    }
                } header: {
                    sectionHeader("搜索建议", showClear: false)
                }
            }

            if !uniqueHistoryEntries.isEmpty {
                Section {
                    ForEach(uniqueHistoryEntries) { entry in
                        historyRow(entry)
                    }
                } header: {
                    sectionHeader("搜索历史", showClear: true)
                }
            }

            if uniqueSuggestions.isEmpty && uniqueHistoryEntries.isEmpty {
                ContentUnavailableView("暂无搜索建议", systemImage: "magnifyingglass")
                    .listRowBackground(Color.clear)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(theme.background)
    }

    private var resultsContent: some View {
        @Bindable var viewModel = viewModel

        VStack(spacing: 0) {
            Picker("搜索类型", selection: $viewModel.selectedTab) {
                ForEach(SearchTab.allCases) { tab in
                    Text(tab.title).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 8)

            if viewModel.selectedTab == .thread {
                HStack(spacing: 12) {
                    Picker("排序", selection: $viewModel.threadSort) {
                        ForEach(SearchThreadOrder.allCases, id: \.self) { order in
                            Text(order.title).tag(order)
                        }
                    }
                    .pickerStyle(.menu)
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
            }

            if let errorMessage, !errorMessage.isEmpty {
                ContentUnavailableView {
                    Label("搜索失败", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(errorMessage)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if isLoading {
                VStack(spacing: 10) {
                    ProgressView()
                        .controlSize(.regular)
                    Text("搜索中")
                        .font(.footnote)
                        .foregroundStyle(theme.textSecondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                resultList
            }
        }
        .background(theme.background)
    }

    @ViewBuilder
    private var resultList: some View {
        List {
            switch selectedTab {
            case .thread:
                if threads.isEmpty {
                    emptyResultRow("没有找到相关帖子", systemImage: "doc.text.magnifyingglass")
                } else {
                    ForEach(threads) { thread in
                        SearchThreadRow(thread: thread) {
                            onOpenThread(thread)
                        }
                        .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                    }
                }
            case .forum:
                if forums.isEmpty {
                    emptyResultRow("没有找到相关贴吧", systemImage: "person.2")
                } else {
                    ForEach(forums) { forum in
                        SearchForumRow(forum: forum) {
                            onOpenForum(forum)
                        }
                        .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                    }
                }
            case .user:
                if users.isEmpty {
                    emptyResultRow("没有找到相关用户", systemImage: "person.crop.circle")
                } else {
                    ForEach(users) { user in
                        SearchUserRow(user: user) {
                            onOpenUser(user)
                        }
                        .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }

    private func emptyResultRow(_ title: String, systemImage: String) -> some View {
        ContentUnavailableView(Text(title), systemImage: systemImage)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 60)
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
    }

    private func sectionHeader(_ title: String, showClear: Bool) -> some View {
        HStack {
            Text(title)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(theme.textSecondary)
            Spacer()
            if showClear {
                Button {
                    historyStore.clear()
                    onClearHistory()
                } label: {
                    Image(systemName: "trash")
                        .font(.footnote.weight(.medium))
                }
                .buttonStyle(.plain)
                .foregroundStyle(theme.textSecondary)
            }
        }
    }

    private func historyRow(_ entry: SearchHistoryEntry) -> some View {
        Button {
            selectHistory(entry.keyword)
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "clock.arrow.circlepath")
                    .foregroundStyle(theme.textSecondary)
                Text(entry.keyword)
                    .foregroundStyle(theme.text)
                    .lineLimit(1)
                Spacer(minLength: 8)
                if entry.timestamp > 0 {
                    Text(relativeTime(entry.timestamp))
                        .font(.caption2)
                        .foregroundStyle(theme.textTertiary)
                        .lineLimit(1)
                }
            }
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button(role: .destructive) {
                historyStore.remove(entry.keyword)
                onDeleteHistory(entry.keyword)
            } label: {
                Label("删除", systemImage: "trash")
            }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) {
                historyStore.remove(entry.keyword)
                onDeleteHistory(entry.keyword)
            } label: {
                Label("删除", systemImage: "trash")
            }
        }
    }

    // MARK: Actions

    private func submitSearch() {
        let keyword = trimmedQuery
        guard !keyword.isEmpty else { return }
        viewModel.query = keyword
        viewModel.searchedKeyword = keyword
        viewModel.hasSearched = true
        historyStore.add(keyword)
        onSearch(keyword, viewModel.selectedTab)
    }

    private func selectSuggestion(_ suggestion: String) {
        beginSearch(with: suggestion)
        onSuggestionTap(suggestion)
    }

    private func selectHistory(_ item: String) {
        beginSearch(with: item)
        onHistoryTap(item)
    }

    private func beginSearch(with keyword: String) {
        viewModel.query = keyword
        viewModel.searchedKeyword = keyword
        viewModel.hasSearched = true
        historyStore.add(keyword)
    }

    private func handleQueryChange(_ newValue: String) {
        let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            viewModel.hasSearched = false
            viewModel.searchedKeyword = ""
        } else if viewModel.hasSearched, trimmed != viewModel.searchedKeyword {
            viewModel.hasSearched = false
            viewModel.searchedKeyword = ""
        }
        queryDebouncer.schedule { [onDebouncedQueryChange] in
            onDebouncedQueryChange(trimmed)
        }
    }

    private func uniqueStrings(_ items: [String]) -> [String] {
        var seen = Set<String>()
        return items.filter { seen.insert($0).inserted }
    }
}

// MARK: - Result Rows

public struct SearchThreadRow: View {
    public let thread: FeedThreadInfo
    public let onOpen: () -> Void

    @Environment(\.appTheme) private var theme

    public init(thread: FeedThreadInfo, onOpen: @escaping () -> Void = {}) {
        self.thread = thread
        self.onOpen = onOpen
    }

    public var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 8) {
                Text(thread.title)
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

                HStack(spacing: 8) {
                    SearchAvatarView(
                        urlString: thread.authorPortrait,
                        fallbackText: displayAuthorName,
                        size: 22
                    )

                    VStack(alignment: .leading, spacing: 2) {
                        Text(displayAuthorName)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(theme.text)
                            .lineLimit(1)
                        if thread.createTime > 0 {
                            Text(relativeTime(thread.createTime))
                                .font(.caption2)
                                .foregroundStyle(theme.textTertiary)
                        }
                    }

                    Spacer(minLength: 8)

                    if !thread.forumName.isEmpty {
                        forumChip(thread.forumName)
                    }

                    if thread.replyNum > 0 {
                        Label(formatCount(thread.replyNum), systemImage: "bubble.right")
                            .font(.caption)
                            .foregroundStyle(theme.textSecondary)
                            .lineLimit(1)
                    }
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
        .background(theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(theme.border, lineWidth: 0.5)
        }
    }

    private var displayAuthorName: String {
        let name = thread.authorNameShow.isEmpty ? thread.authorName : thread.authorNameShow
        return name.isEmpty ? "楼主" : name
    }

    private func forumChip(_ forumName: String) -> some View {
        HStack(spacing: 3) {
            Image(systemName: "person.2.fill")
                .font(.caption2)
            Text(forumName)
                .font(.caption.weight(.medium))
                .lineLimit(1)
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(theme.chip, in: Capsule())
        .foregroundStyle(theme.onChip)
    }
}

public struct SearchForumRow: View {
    public let forum: FeedForumInfo
    public let onOpen: () -> Void

    @Environment(\.appTheme) private var theme

    public init(forum: FeedForumInfo, onOpen: @escaping () -> Void = {}) {
        self.forum = forum
        self.onOpen = onOpen
    }

    public var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 12) {
                SearchAvatarView(
                    urlString: forum.avatar,
                    fallbackText: forum.forumName,
                    size: 44
                )

                VStack(alignment: .leading, spacing: 4) {
                    Text(forum.forumName)
                        .font(.headline)
                        .foregroundStyle(theme.text)
                        .lineLimit(1)
                    Text("\(formatCount(forum.memberCount)) 关注 · \(formatCount(forum.threadCount)) 帖子")
                        .font(.caption)
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(1)
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
        .background(theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(theme.border, lineWidth: 0.5)
        }
    }
}

public struct SearchUserRow: View {
    public let user: FeedUserInfo
    public let onOpen: () -> Void

    @Environment(\.appTheme) private var theme

    public init(user: FeedUserInfo, onOpen: @escaping () -> Void = {}) {
        self.user = user
        self.onOpen = onOpen
    }

    public var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 12) {
                SearchAvatarView(
                    urlString: user.portrait,
                    fallbackText: user.name,
                    size: 44
                )

                VStack(alignment: .leading, spacing: 4) {
                    Text(user.name.isEmpty ? "未命名用户" : user.name)
                        .font(.headline)
                        .foregroundStyle(theme.text)
                        .lineLimit(1)
                    Text("查看个人主页")
                        .font(.caption)
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(1)
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
        .background(theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(theme.border, lineWidth: 0.5)
        }
    }
}

// MARK: - Shared Components

private struct SearchAvatarView: View {
    let urlString: String
    let fallbackText: String
    var size: CGFloat = 32

    @Environment(\.appTheme) private var theme

    var body: some View {
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

// MARK: - Preview

#Preview("搜索结果") {
    NavigationStack {
        SearchView(
            suggestions: ["iOS 26", "毛玻璃", "苹果吧"],
            history: ["SwiftUI", "贴吧"],
            threads: previewThreads,
            forums: previewForums,
            users: previewUsers,
            initialKeyword: "毛玻璃",
            startsSearched: true,
            onClearHistory: {},
            onDeleteHistory: { _ in }
        )
    }
    .environment(\.appTheme, .lightPalette)
}

#Preview("搜索建议与历史") {
    NavigationStack {
        SearchView(
            suggestions: ["iOS 26", "毛玻璃", "苹果吧"],
            history: ["SwiftUI", "贴吧", "数码"],
            initialKeyword: "iOS"
        )
    }
    .environment(\.appTheme, .lightPalette)
}

private let previewThreads: [FeedThreadInfo] = [
    FeedThreadInfo(
        id: "preview-thread-1",
        title: "iOS 26 毛玻璃效果太强了",
        abstract: "新的 Liquid Glass 在贴吧里滚动非常流畅，帧率稳定。",
        forumName: "苹果",
        authorId: "1001",
        authorName: "apple_fan",
        authorNameShow: "果粉小明",
        authorPortrait: "https://example.com/avatar1.png",
        createTime: Date().timeIntervalSince1970 - 3_600,
        replyNum: 128
    ),
    FeedThreadInfo(
        id: "preview-thread-2",
        title: "求推荐一个好用的浏览器",
        abstract: "平时看视频、逛贴吧比较多。",
        forumName: "数码",
        authorId: "1002",
        authorName: "digi_user",
        authorNameShow: "数码爱好者",
        createTime: Date().timeIntervalSince1970 - 86_400,
        replyNum: 42
    ),
]

private let previewForums: [FeedForumInfo] = [
    FeedForumInfo(id: "forum-1", forumName: "苹果吧", avatar: "https://example.com/forum1.png", memberCount: 2_180_000, threadCount: 56_800_000),
    FeedForumInfo(id: "forum-2", forumName: "数码吧", avatar: "https://example.com/forum2.png", memberCount: 880_000, threadCount: 12_400_000),
]

private let previewUsers: [FeedUserInfo] = [
    FeedUserInfo(id: "1001", name: "果粉小明", portrait: "https://example.com/avatar1.png"),
    FeedUserInfo(id: "1002", name: "数码爱好者", portrait: "https://example.com/avatar2.png"),
]
