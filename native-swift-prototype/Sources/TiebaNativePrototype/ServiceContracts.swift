import Foundation
import Observation

// MARK: - Feed

public enum FeedSegment: String, CaseIterable, Identifiable, Hashable, Sendable {
    case personalized
    case concern
    case hot

    public var id: String { rawValue }
}

public struct FeedPage: Hashable, Sendable {
    public let items: [FeedItem]
    public let page: Int
    public let hasMore: Bool
    public let pageTag: String?

    public init(
        items: [FeedItem] = [],
        page: Int = 1,
        hasMore: Bool = false,
        pageTag: String? = nil
    ) {
        self.items = items
        self.page = page
        self.hasMore = hasMore
        self.pageTag = pageTag
    }
}

public protocol FeedService: Sendable {
    func loadFeed(segment: FeedSegment, page: Int, refresh: Bool) async throws -> FeedPage
}

// MARK: - Thread

public struct ThreadPage: Hashable, Sendable {
    public let thread: ThreadDetail
    public let posts: [PostInfo]
    public let page: Int
    public let hasMore: Bool

    public init(
        thread: ThreadDetail,
        posts: [PostInfo] = [],
        page: Int = 1,
        hasMore: Bool = false
    ) {
        self.thread = thread
        self.posts = posts
        self.page = page
        self.hasMore = hasMore
    }
}

public protocol ThreadService: Sendable {
    func loadThread(id: String, page: Int, seeLz: Bool, reverse: Bool) async throws -> ThreadPage
}

// MARK: - Search

public enum SearchThreadOrder: Int, CaseIterable, Hashable, Sendable {
    case newFirst = 5
    case oldFirst = 0
    case relevant = 2
}

public extension SearchThreadOrder {
    var title: String {
        switch self {
        case .newFirst:
            return "最新"
        case .oldFirst:
            return "最早"
        case .relevant:
            return "相关"
        }
    }
}

public enum SearchThreadFilter: Int, Hashable, Sendable {
    case all = 1
    case onlyThread = 2
}

public struct SearchResultPage: Hashable, Sendable {
    public let threads: [FeedThreadInfo]
    public let forums: [FeedForumInfo]
    public let users: [FeedUserInfo]
    public let page: Int
    public let hasMore: Bool

    public init(
        threads: [FeedThreadInfo] = [],
        forums: [FeedForumInfo] = [],
        users: [FeedUserInfo] = [],
        page: Int = 1,
        hasMore: Bool = false
    ) {
        self.threads = threads
        self.forums = forums
        self.users = users
        self.page = page
        self.hasMore = hasMore
    }
}

public protocol SearchService: Sendable {
    func searchThreads(
        keyword: String,
        page: Int,
        order: SearchThreadOrder,
        filter: SearchThreadFilter
    ) async throws -> SearchResultPage
    func searchForums(keyword: String) async throws -> SearchResultPage
    func searchUsers(keyword: String) async throws -> SearchResultPage
    func searchPosts(forumName: String, keyword: String, page: Int) async throws -> SearchResultPage
    func suggestions(keyword: String, isForum: Bool) async throws -> [String]
}

public extension SearchService {
    func searchThreads(keyword: String, page: Int) async throws -> SearchResultPage {
        try await searchThreads(
            keyword: keyword,
            page: page,
            order: .newFirst,
            filter: .all
        )
    }
}

// MARK: - User

public struct UserProfile: Identifiable, Hashable, Sendable {
    public let id: String
    public var name: String
    public var nameShow: String
    public var portrait: String
    public var levelId: Int
    public var levelName: String
    public var sex: Int
    public var intro: String
    public var fansNum: Int
    public var concernNum: Int
    public var postNum: Int
    public var totalAgreeNum: Int
    public var ipLocation: String
    public var tbAge: Double
    public var isBawu: Bool
    public var tiebaUid: String
    public var hasConcerned: Bool
    public var threadsNum: Int
    public var concernForumsNum: Int
    public var isBlocked: Bool
    public var canMessage: Bool
    public var canFollow: Bool
    public var canReply: Bool

    public init(
        id: String,
        name: String = "",
        nameShow: String = "",
        portrait: String = "",
        levelId: Int = 0,
        levelName: String = "",
        sex: Int = 0,
        intro: String = "",
        fansNum: Int = 0,
        concernNum: Int = 0,
        postNum: Int = 0,
        totalAgreeNum: Int = 0,
        ipLocation: String = "",
        tbAge: Double = 0,
        isBawu: Bool = false,
        tiebaUid: String = "",
        hasConcerned: Bool = false,
        threadsNum: Int = 0,
        concernForumsNum: Int = 0,
        isBlocked: Bool = false,
        canMessage: Bool = true,
        canFollow: Bool = true,
        canReply: Bool = true
    ) {
        self.id = id
        self.name = name
        self.nameShow = nameShow
        self.portrait = portrait
        self.levelId = levelId
        self.levelName = levelName
        self.sex = sex
        self.intro = intro
        self.fansNum = fansNum
        self.concernNum = concernNum
        self.postNum = postNum
        self.totalAgreeNum = totalAgreeNum
        self.ipLocation = ipLocation
        self.tbAge = tbAge
        self.isBawu = isBawu
        self.tiebaUid = tiebaUid
        self.hasConcerned = hasConcerned
        self.threadsNum = threadsNum
        self.concernForumsNum = concernForumsNum
        self.isBlocked = isBlocked
        self.canMessage = canMessage
        self.canFollow = canFollow
        self.canReply = canReply
    }
}

public struct UserContentPage: Hashable, Sendable {
    public let items: [UserPostInfo]
    public let page: Int
    public let hasMore: Bool

    public init(items: [UserPostInfo] = [], page: Int = 1, hasMore: Bool = false) {
        self.items = items
        self.page = page
        self.hasMore = hasMore
    }
}

public struct UserForumPage: Hashable, Sendable {
    public let items: [UserForumInfo]
    public let page: Int
    public let hasMore: Bool

    public init(items: [UserForumInfo] = [], page: Int = 1, hasMore: Bool = false) {
        self.items = items
        self.page = page
        self.hasMore = hasMore
    }
}

public protocol UserService: Sendable {
    func loadProfile(userID: String) async throws -> UserProfile
    func loadPosts(userID: String, page: Int, isThread: Bool) async throws -> UserContentPage
    func loadFollowedForums(userID: String, page: Int) async throws -> UserForumPage
    func follow(userID: String) async throws
    func unfollow(userID: String) async throws
    func block(userID: String) async throws
    func unblock(userID: String) async throws
}

// MARK: - Settings

public enum ImageLoadType: String, Hashable, Sendable {
    case smartLoad = "smart_load"
    case smartOrigin = "smart_origin"
    case allOrigin = "all_origin"
    case allNo = "all_no"
    case original
    case wifiOnly = "wifi_only"
    case auto
    case low
}

public enum DefaultStartTab: String, Hashable, Sendable {
    case home
    case explore
    case notifications
    case user
    case profile
}

public struct AppPreferences: Hashable, Sendable {
    public var theme: ThemeName
    public var fontScale: Double
    public var autoSign: Bool
    public var autoSignTime: String
    public var imageLoadType: ImageLoadType
    public var incognitoMode: Bool
    public var defaultStartTab: DefaultStartTab
    public var showBothUsername: Bool
    public var collectSeeLz: Bool
    public var collectDescSort: Bool
    public var hideMedia: Bool
    public var forumSingleColumn: Bool
    public var blockVideo: Bool
    public var hideBlockedContent: Bool
    public var hapticFeedback: Bool
    public var useBuiltInBrowser: Bool
    public var showShortcutInThread: Bool
    public var hideReply: Bool
    public var showFollowedOnly: Bool
    public var hideExplore: Bool
    public var homePageShowHistoryForum: Bool
    public var exploreAutoRefresh: Bool

    public init(
        theme: ThemeName = .tieba,
        fontScale: Double = 1,
        autoSign: Bool = false,
        autoSignTime: String = "08:00",
        imageLoadType: ImageLoadType = .smartLoad,
        incognitoMode: Bool = false,
        defaultStartTab: DefaultStartTab = .home,
        showBothUsername: Bool = false,
        collectSeeLz: Bool = true,
        collectDescSort: Bool = false,
        hideMedia: Bool = false,
        forumSingleColumn: Bool = false,
        blockVideo: Bool = false,
        hideBlockedContent: Bool = false,
        hapticFeedback: Bool = true,
        useBuiltInBrowser: Bool = true,
        showShortcutInThread: Bool = true,
        hideReply: Bool = false,
        showFollowedOnly: Bool = false,
        hideExplore: Bool = false,
        homePageShowHistoryForum: Bool = true,
        exploreAutoRefresh: Bool = true
    ) {
        self.theme = theme
        self.fontScale = fontScale
        self.autoSign = autoSign
        self.autoSignTime = autoSignTime
        self.imageLoadType = imageLoadType
        self.incognitoMode = incognitoMode
        self.defaultStartTab = defaultStartTab
        self.showBothUsername = showBothUsername
        self.collectSeeLz = collectSeeLz
        self.collectDescSort = collectDescSort
        self.hideMedia = hideMedia
        self.forumSingleColumn = forumSingleColumn
        self.blockVideo = blockVideo
        self.hideBlockedContent = hideBlockedContent
        self.hapticFeedback = hapticFeedback
        self.useBuiltInBrowser = useBuiltInBrowser
        self.showShortcutInThread = showShortcutInThread
        self.hideReply = hideReply
        self.showFollowedOnly = showFollowedOnly
        self.hideExplore = hideExplore
        self.homePageShowHistoryForum = homePageShowHistoryForum
        self.exploreAutoRefresh = exploreAutoRefresh
    }

    public static let standard = AppPreferences()
}

public protocol SettingsStore: Sendable {
    func loadPreferences() async throws -> AppPreferences
    func savePreferences(_ preferences: AppPreferences) async throws
    func resetPreferences() async throws
}

// MARK: - Auth

public struct AuthAccount: Identifiable, Hashable, Sendable {
    public let id: String
    public let uid: String
    public let name: String
    public let portrait: String?

    public init(id: String, uid: String, name: String, portrait: String? = nil) {
        self.id = id
        self.uid = uid
        self.name = name
        self.portrait = portrait
    }
}

public struct AuthCredentials: Hashable, Sendable {
    public let bduss: String
    public let sToken: String
    public let cookie: String?

    public init(bduss: String, sToken: String, cookie: String? = nil) {
        self.bduss = bduss
        self.sToken = sToken
        self.cookie = cookie
    }
}

public protocol AuthProviding: Sendable {
    func restoreSession() async throws -> AuthAccount?
    func login(credentials: AuthCredentials) async throws -> AuthAccount
    func logout() async throws
    func clearAllCredentials() async throws
}

@MainActor
@Observable
public final class AuthStore: AuthProviding {
    public private(set) var account: AuthAccount?
    public private(set) var isLoggedIn: Bool
    public private(set) var error: String?

    public init(account: AuthAccount? = nil) {
        self.account = account
        self.isLoggedIn = account != nil
        self.error = nil
    }

    public func restoreSession() async throws -> AuthAccount? {
        account
    }

    public func login(credentials: AuthCredentials) async throws -> AuthAccount {
        let restored = AuthAccount(
            id: credentials.bduss,
            uid: "1000",
            name: "preview_user",
            portrait: nil
        )
        account = restored
        isLoggedIn = true
        error = nil
        return restored
    }

    public func logout() async throws {
        account = nil
        isLoggedIn = false
        error = nil
    }

    public func clearAllCredentials() async throws {
        account = nil
        isLoggedIn = false
        error = nil
    }
}

// MARK: - Mock Container

public struct MockServiceContainer: FeedService, ThreadService, SearchService, UserService, SettingsStore {
    private let settings: SettingsBox

    private static let previewForums: [FeedForumInfo] = [
        FeedForumInfo(
            id: "f1",
            forumName: "iOS",
            avatar: "https://example.com/forum-ios.png",
            memberCount: 186_000,
            threadCount: 2_400_000
        ),
        FeedForumInfo(
            id: "f2",
            forumName: "Swift",
            avatar: "https://example.com/forum-swift.png",
            memberCount: 92_000,
            threadCount: 860_000
        )
    ]

    private static let previewUsers: [FeedUserInfo] = [
        FeedUserInfo(id: "1001", name: "apple_fan", portrait: "https://example.com/user-1001.png"),
        FeedUserInfo(id: "1002", name: "swift_dev", portrait: "https://example.com/user-1002.png")
    ]

    public init(preferences: AppPreferences = .standard) {
        settings = SettingsBox(preferences: preferences)
    }

    public static let preview = MockServiceContainer()

    public func loadFeed(segment: FeedSegment, page: Int, refresh: Bool) async throws -> FeedPage {
        let items: [FeedItem]
        switch segment {
        case .personalized, .concern:
            items = PreviewData.feedItems
        case .hot:
            items = PreviewData.feedItems + [
                FeedItem(
                    type: .topic,
                    stableKey: "mock-topic-1",
                    topicInfo: FeedTopicInfo(
                        id: "topic-1",
                        topicName: "iOS Native",
                        topicDesc: "Service contract prototype",
                        discussNum: 3200,
                        isHot: true
                    )
                ),
                FeedItem(
                    type: .forum,
                    stableKey: "mock-forum-1",
                    forumInfo: Self.previewForums[0]
                )
            ]
        }
        return FeedPage(items: items, page: page, hasMore: false, pageTag: nil)
    }

    public func loadThread(id: String, page: Int, seeLz: Bool, reverse: Bool) async throws -> ThreadPage {
        var posts = PreviewData.posts
        if seeLz {
            posts = posts.filter { $0.authorId == PreviewData.threadDetail.authorId }
        }
        if reverse {
            posts.reverse()
        }
        return ThreadPage(
            thread: PreviewData.threadDetail,
            posts: posts,
            page: page,
            hasMore: page < 2
        )
    }

    public func searchThreads(
        keyword: String,
        page: Int,
        order: SearchThreadOrder,
        filter: SearchThreadFilter
    ) async throws -> SearchResultPage {
        SearchResultPage(
            threads: PreviewData.feedItems.compactMap(\.threadInfo),
            page: page,
            hasMore: false
        )
    }

    public func searchForums(keyword: String) async throws -> SearchResultPage {
        SearchResultPage(forums: Self.previewForums)
    }

    public func searchUsers(keyword: String) async throws -> SearchResultPage {
        SearchResultPage(users: Self.previewUsers)
    }

    public func searchPosts(forumName: String, keyword: String, page: Int) async throws -> SearchResultPage {
        SearchResultPage(
            threads: PreviewData.feedItems.compactMap(\.threadInfo),
            page: page,
            hasMore: false
        )
    }

    public func suggestions(keyword: String, isForum: Bool) async throws -> [String] {
        isForum ? ["iOS", "Swift"] : ["SwiftUI", "iOS Native", "Tieba"]
    }

    public func loadProfile(userID: String) async throws -> UserProfile {
        UserProfile(
            id: userID,
            name: "apple_fan",
            nameShow: "Apple Fan",
            portrait: "https://example.com/user-1001.png",
            levelId: 7,
            levelName: "Lv.7",
            sex: 1,
            intro: "Native migration prototype.",
            fansNum: 128,
            concernNum: 36,
            postNum: 24,
            totalAgreeNum: 96,
            ipLocation: "Guangdong",
            tbAge: 3,
            isBawu: false,
            tiebaUid: userID,
            hasConcerned: false,
            threadsNum: 12,
            concernForumsNum: 36,
            isBlocked: false,
            canMessage: true,
            canFollow: true,
            canReply: true
        )
    }

    public func loadPosts(userID: String, page: Int, isThread: Bool) async throws -> UserContentPage {
        let items = PreviewData.posts.map { post in
            UserPostInfo(
                id: post.id,
                threadId: post.threadId,
                title: PreviewData.threadDetail.title,
                abstract: "",
                forumName: PreviewData.threadDetail.forumName,
                createTime: post.createTime,
                replyNum: post.subPosts.count,
                post: post
            )
        }
        return UserContentPage(items: items, page: page, hasMore: false)
    }

    public func loadFollowedForums(userID: String, page: Int) async throws -> UserForumPage {
        let items = Self.previewForums.map { forum in
            UserForumInfo(
                id: forum.id,
                forumName: forum.forumName,
                avatar: forum.avatar,
                levelName: "Lv.6",
                slogan: "",
                memberCount: forum.memberCount
            )
        }
        return UserForumPage(items: items, page: page, hasMore: false)
    }

    public func follow(userID: String) async throws {}
    public func unfollow(userID: String) async throws {}
    public func block(userID: String) async throws {}
    public func unblock(userID: String) async throws {}

    public func loadPreferences() async throws -> AppPreferences {
        await settings.load()
    }

    public func savePreferences(_ preferences: AppPreferences) async throws {
        await settings.save(preferences)
    }

    public func resetPreferences() async throws {
        await settings.reset()
    }
}

private actor SettingsBox {
    private var preferences: AppPreferences

    init(preferences: AppPreferences = .standard) {
        self.preferences = preferences
    }

    func load() -> AppPreferences {
        preferences
    }

    func save(_ preferences: AppPreferences) {
        self.preferences = preferences
    }

    func reset() {
        preferences = .standard
    }
}
