import Combine
import Foundation

public struct SearchHistoryEntry: Identifiable, Hashable, Sendable, Codable {
    public let id: UUID
    public var keyword: String
    public var timestamp: TimeInterval

    public init(
        id: UUID = UUID(),
        keyword: String,
        timestamp: TimeInterval = Date().timeIntervalSince1970
    ) {
        self.id = id
        self.keyword = keyword
        self.timestamp = timestamp
    }
}

public enum SearchHistoryScope: Hashable, Sendable {
    case global
    case forum(String)

    public var storageKey: String {
        switch self {
        case .global:
            return "tieba.search_history.global"
        case .forum(let forumID):
            let safeID = forumID
                .components(separatedBy: CharacterSet.alphanumerics.inverted)
                .filter { !$0.isEmpty }
                .joined(separator: "-")
            return "tieba.search_history.forum.\(safeID)"
        }
    }
}

public final class SearchHistoryStore: ObservableObject {
    @Published public private(set) var entries: [SearchHistoryEntry]

    private let defaults: UserDefaults
    private let storageKey: String
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let maxCount: Int

    public init(
        scope: SearchHistoryScope,
        defaults: UserDefaults = .standard,
        maxCount: Int = 30
    ) {
        self.defaults = defaults
        self.storageKey = scope.storageKey
        self.maxCount = max(1, maxCount)
        self.entries = []
        self.entries = Self.load(from: defaults, key: storageKey, decoder: decoder)
    }

    public convenience init(forumID: String, defaults: UserDefaults = .standard) {
        self.init(scope: .forum(forumID), defaults: defaults)
    }

    public var keywords: [String] {
        entries.map(\.keyword)
    }

    public func seedIfEmpty(_ keywords: [String]) {
        guard entries.isEmpty, !keywords.isEmpty else { return }
        let now = Date().timeIntervalSince1970
        entries = keywords.enumerated().map { index, keyword in
            SearchHistoryEntry(
                keyword: keyword,
                timestamp: now - Double(index) * 60
            )
        }
    }

    public func add(_ keyword: String) {
        let trimmed = keyword.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        entries.removeAll { existing in
            existing.keyword.caseInsensitiveCompare(trimmed) == .orderedSame
        }
        entries.insert(
            SearchHistoryEntry(keyword: trimmed),
            at: 0
        )
        if entries.count > maxCount {
            entries = Array(entries.prefix(maxCount))
        }
        persist()
    }

    public func remove(_ keyword: String) {
        entries.removeAll { existing in
            existing.keyword.caseInsensitiveCompare(keyword) == .orderedSame
        }
        persist()
    }

    public func removeEntry(id: UUID) {
        entries.removeAll { $0.id == id }
        persist()
    }

    public func clear() {
        entries = []
        persist()
    }

    private func persist() {
        guard let data = try? encoder.encode(entries) else { return }
        defaults.set(data, forKey: storageKey)
    }

    private static func load(
        from defaults: UserDefaults,
        key: String,
        decoder: JSONDecoder
    ) -> [SearchHistoryEntry] {
        guard let data = defaults.data(forKey: key),
              let decoded = try? decoder.decode([SearchHistoryEntry].self, from: data) else {
            return []
        }
        return decoded
    }
}
