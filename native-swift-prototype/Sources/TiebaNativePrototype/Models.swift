import Foundation
import CoreGraphics

// MARK: - Feed

public enum FeedItemType: String, Hashable, Sendable {
    case thread
    case forum
    case topic
    case user
}

public struct FeedThreadInfo: Identifiable, Hashable, Sendable {
    public let id: String
    public var title: String
    public var abstract: String
    public var forumName: String
    public var forumId: String
    public var authorId: String
    public var authorName: String
    public var authorNameShow: String
    public var authorPortrait: String
    public var createTime: TimeInterval
    public var replyNum: Int
    public var zanNum: Int
    public var isTop: Bool
    public var isGood: Bool
    public var media: [MediaItem]

    public init(
        id: String,
        title: String = "",
        abstract: String = "",
        forumName: String = "",
        forumId: String = "",
        authorId: String = "",
        authorName: String = "",
        authorNameShow: String = "",
        authorPortrait: String = "",
        createTime: TimeInterval = 0,
        replyNum: Int = 0,
        zanNum: Int = 0,
        isTop: Bool = false,
        isGood: Bool = false,
        media: [MediaItem] = []
    ) {
        self.id = id
        self.title = title
        self.abstract = abstract
        self.forumName = forumName
        self.forumId = forumId
        self.authorId = authorId
        self.authorName = authorName
        self.authorNameShow = authorNameShow
        self.authorPortrait = authorPortrait
        self.createTime = createTime
        self.replyNum = replyNum
        self.zanNum = zanNum
        self.isTop = isTop
        self.isGood = isGood
        self.media = media
    }
}

public struct FeedForumInfo: Identifiable, Hashable, Sendable {
    public let id: String
    public var forumName: String
    public var avatar: String
    public var memberCount: Int
    public var threadCount: Int

    public init(id: String, forumName: String = "", avatar: String = "", memberCount: Int = 0, threadCount: Int = 0) {
        self.id = id
        self.forumName = forumName
        self.avatar = avatar
        self.memberCount = memberCount
        self.threadCount = threadCount
    }
}

public struct FeedTopicInfo: Identifiable, Hashable, Sendable {
    public let id: String
    public var topicName: String
    public var topicDesc: String
    public var discussNum: Int
    public var isHot: Bool
    public var isNew: Bool
    public var imageUrl: String?
    public var relateForum: [FeedForumInfo]

    public init(
        id: String,
        topicName: String = "",
        topicDesc: String = "",
        discussNum: Int = 0,
        isHot: Bool = false,
        isNew: Bool = false,
        imageUrl: String? = nil,
        relateForum: [FeedForumInfo] = []
    ) {
        self.id = id
        self.topicName = topicName
        self.topicDesc = topicDesc
        self.discussNum = discussNum
        self.isHot = isHot
        self.isNew = isNew
        self.imageUrl = imageUrl
        self.relateForum = relateForum
    }
}

public struct FeedUserInfo: Identifiable, Hashable, Sendable {
    public let id: String
    public var name: String
    public var portrait: String

    public init(id: String, name: String = "", portrait: String = "") {
        self.id = id
        self.name = name
        self.portrait = portrait
    }
}

public struct FeedItem: Identifiable, Hashable, Sendable {
    public var id: String { stableKey }
    public let type: FeedItemType
    public let stableKey: String
    public var threadInfo: FeedThreadInfo?
    public var forumInfo: FeedForumInfo?
    public var topicInfo: FeedTopicInfo?
    public var userInfo: FeedUserInfo?

    public init(
        type: FeedItemType,
        stableKey: String,
        threadInfo: FeedThreadInfo? = nil,
        forumInfo: FeedForumInfo? = nil,
        topicInfo: FeedTopicInfo? = nil,
        userInfo: FeedUserInfo? = nil
    ) {
        self.type = type
        self.stableKey = stableKey
        self.threadInfo = threadInfo
        self.forumInfo = forumInfo
        self.topicInfo = topicInfo
        self.userInfo = userInfo
    }
}

// MARK: - Media

public struct MediaItem: Hashable, Sendable {
    public var src: String
    public var originSrc: String
    public var poster: String?
    public var type: String
    public var width: CGFloat
    public var height: CGFloat

    public init(
        src: String = "",
        originSrc: String = "",
        poster: String? = nil,
        type: String = "image",
        width: CGFloat = 0,
        height: CGFloat = 0
    ) {
        self.src = src
        self.originSrc = originSrc
        self.poster = poster
        self.type = type
        self.width = width
        self.height = height
    }
}

// MARK: - Post Content

public enum PostSegment: Hashable, Sendable {
    case text(String)
    case emoji(String)
    case emoticon(name: String, src: String)
    case image(MediaItem)
    case video(MediaItem)
    case audio(url: String, duration: TimeInterval)
    case link(text: String, url: String)
    case at(uid: String, name: String)
    case topic(id: String, name: String)
    case poll(options: [PollOption])
    case linebreak
}

public struct PollOption: Identifiable, Hashable, Sendable {
    public let id: String
    public var text: String
    public var count: Int
    public var isSelected: Bool

    public init(id: String = UUID().uuidString, text: String = "", count: Int = 0, isSelected: Bool = false) {
        self.id = id
        self.text = text
        self.count = count
        self.isSelected = isSelected
    }
}

public struct PbContent: Identifiable, Hashable, Sendable {
    public let id: String
    public var type: String
    public var text: String
    public var url: String
    public var link: String
    public var quote: String
    public var bold: Bool
    public var color: String?
    public var image: MediaItem?
    public var isLineBreak: Bool

    public init(
        id: String = UUID().uuidString,
        type: String = "text",
        text: String = "",
        url: String = "",
        link: String = "",
        quote: String = "",
        bold: Bool = false,
        color: String? = nil,
        image: MediaItem? = nil,
        isLineBreak: Bool = false
    ) {
        self.id = id
        self.type = type
        self.text = text
        self.url = url
        self.link = link
        self.quote = quote
        self.bold = bold
        self.color = color
        self.image = image
        self.isLineBreak = isLineBreak
    }
}

public struct SubPostInfo: Identifiable, Hashable, Sendable {
    public let id: String
    public var authorId: String
    public var authorName: String
    public var content: [PostSegment]
    public var createTime: TimeInterval
    public var agreeNum: Int

    public init(
        id: String,
        authorId: String = "",
        authorName: String = "",
        content: [PostSegment] = [],
        createTime: TimeInterval = 0,
        agreeNum: Int = 0
    ) {
        self.id = id
        self.authorId = authorId
        self.authorName = authorName
        self.content = content
        self.createTime = createTime
        self.agreeNum = agreeNum
    }
}

public struct PostInfo: Identifiable, Hashable, Sendable {
    public let id: String
    public var threadId: String
    public var floor: Int
    public var authorId: String
    public var authorName: String
    public var authorNameShow: String
    public var authorPortrait: String
    public var authorLevelId: Int
    public var createTime: TimeInterval
    public var ipLocation: String
    public var content: [PostSegment]
    public var agreeNum: Int
    public var isAgree: Bool
    public var subPosts: [SubPostInfo]

    public init(
        id: String,
        threadId: String = "",
        floor: Int = 1,
        authorId: String = "",
        authorName: String = "",
        authorNameShow: String = "",
        authorPortrait: String = "",
        authorLevelId: Int = 0,
        createTime: TimeInterval = 0,
        ipLocation: String = "",
        content: [PostSegment] = [],
        agreeNum: Int = 0,
        isAgree: Bool = false,
        subPosts: [SubPostInfo] = []
    ) {
        self.id = id
        self.threadId = threadId
        self.floor = floor
        self.authorId = authorId
        self.authorName = authorName
        self.authorNameShow = authorNameShow
        self.authorPortrait = authorPortrait
        self.authorLevelId = authorLevelId
        self.createTime = createTime
        self.ipLocation = ipLocation
        self.content = content
        self.agreeNum = agreeNum
        self.isAgree = isAgree
        self.subPosts = subPosts
    }
}

public struct ThreadDetail: Identifiable, Hashable, Sendable {
    public let id: String
    public var title: String
    public var forumName: String
    public var forumId: String
    public var authorId: String
    public var authorName: String
    public var authorNameShow: String
    public var authorPortrait: String
    public var authorLevelId: Int
    public var createTime: TimeInterval
    public var replyNum: Int
    public var pageCurrent: Int
    public var pageTotal: Int
    public var hasMore: Bool

    public init(
        id: String,
        title: String = "",
        forumName: String = "",
        forumId: String = "",
        authorId: String = "",
        authorName: String = "",
        authorNameShow: String = "",
        authorPortrait: String = "",
        authorLevelId: Int = 0,
        createTime: TimeInterval = 0,
        replyNum: Int = 0,
        pageCurrent: Int = 1,
        pageTotal: Int = 1,
        hasMore: Bool = false
    ) {
        self.id = id
        self.title = title
        self.forumName = forumName
        self.forumId = forumId
        self.authorId = authorId
        self.authorName = authorName
        self.authorNameShow = authorNameShow
        self.authorPortrait = authorPortrait
        self.authorLevelId = authorLevelId
        self.createTime = createTime
        self.replyNum = replyNum
        self.pageCurrent = pageCurrent
        self.pageTotal = pageTotal
        self.hasMore = hasMore
    }
}

// MARK: - Preview Helpers

public enum PreviewData {
    public static let feedItems: [FeedItem] = [
        FeedItem(
            type: .thread,
            stableKey: "preview-thread-1",
            threadInfo: FeedThreadInfo(
                id: "1",
                title: "iOS 26 毛玻璃效果太强了",
                abstract: "新的 Liquid Glass 在贴吧里滚动非常流畅，帧率稳定。",
                forumName: "苹果",
                authorId: "1001",
                authorName: "apple_fan",
                authorNameShow: "果粉小明",
                replyNum: 128,
                zanNum: 96,
                media: [MediaItem(src: "https://example.com/1.jpg", width: 1200, height: 800)]
            )
        ),
        FeedItem(
            type: .thread,
            stableKey: "preview-thread-2",
            threadInfo: FeedThreadInfo(
                id: "2",
                title: "求推荐一个好用的浏览器",
                forumName: "数码",
                authorId: "1002",
                authorName: "digi_user",
                authorNameShow: "数码爱好者",
                replyNum: 42,
                zanNum: 18
            )
        ),
    ]

    public static let threadDetail = ThreadDetail(
        id: "1",
        title: "iOS 26 毛玻璃效果太强了",
        forumName: "苹果",
        authorId: "1001",
        authorName: "apple_fan",
        authorNameShow: "果粉小明",
        replyNum: 128
    )

    public static let posts: [PostInfo] = [
        PostInfo(
            id: "p1",
            threadId: "1",
            floor: 1,
            authorId: "1001",
            authorName: "apple_fan",
            authorNameShow: "果粉小明",
            content: [
                .text("新系统"),
                .emoticon(name: "滑稽", src: "https://example.com/emoticon25.png"),
                .text("的毛玻璃效果"),
                .image(MediaItem(src: "https://example.com/1.jpg", width: 1200, height: 800)),
            ],
            agreeNum: 32
        ),
        PostInfo(
            id: "p2",
            threadId: "1",
            floor: 2,
            authorId: "1002",
            authorName: "digi_user",
            authorNameShow: "数码爱好者",
            content: [
                .text("确实很流畅，续航也没有明显变差。"),
            ],
            agreeNum: 8
        ),
    ]
}
