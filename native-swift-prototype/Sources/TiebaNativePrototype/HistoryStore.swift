import Combine
import Foundation
import SwiftData

// MARK: - History model

@Model
public final class HistoryEntry {
    public var threadID: String
    public var title: String
    public var forumName: String
    public var timestamp: TimeInterval

    public init(
        threadID: String,
        title: String,
        forumName: String,
        timestamp: TimeInterval = Date().timeIntervalSince1970
    ) {
        self.threadID = threadID
        self.title = title
        self.forumName = forumName
        self.timestamp = timestamp
    }
}

// MARK: - History store

@MainActor
public final class HistoryStore: ObservableObject {
    @Published public private(set) var entries: [HistoryEntry]

    public let container: ModelContainer
    public let context: ModelContext

    public init(inMemory: Bool = false) {
        let configuration = ModelConfiguration(isStoredInMemoryOnly: inMemory)
        do {
            container = try ModelContainer(
                for: [HistoryEntry.self],
                configurations: configuration
            )
        } catch {
            fatalError("Unable to create HistoryStore container: \(error)")
        }
        context = container.mainContext
        entries = []
        refreshEntries()
    }

    public func add(
        threadID: String,
        title: String,
        forumName: String,
        timestamp: TimeInterval = Date().timeIntervalSince1970
    ) {
        for entry in entries where entry.threadID == threadID {
            context.delete(entry)
        }

        let entry = HistoryEntry(
            threadID: threadID,
            title: title,
            forumName: forumName,
            timestamp: timestamp
        )
        context.insert(entry)
        saveAndRefresh()
    }

    public func remove(threadID: String) {
        for entry in entries where entry.threadID == threadID {
            context.delete(entry)
        }
        saveAndRefresh()
    }

    public func remove(entry: HistoryEntry) {
        context.delete(entry)
        saveAndRefresh()
    }

    public func clear() {
        for entry in entries {
            context.delete(entry)
        }
        saveAndRefresh()
    }

    /// One-time migration placeholder for the RN AsyncStorage browsing-history JSON.
    ///
    /// The app bootstrap layer owns the real migration: read the legacy
    /// AsyncStorage value, decode each JSON item into `HistoryEntry`, call
    /// `add(threadID:title:forumName:timestamp:)`, and finally remove the
    /// legacy key so the migration runs only once.
    public func migrateFromAsyncStoragePlaceholder() {
        // Intentionally empty for now; no network/auth work is performed.
    }

    private func saveAndRefresh() {
        try? context.save()
        refreshEntries()
    }

    private func refreshEntries() {
        let descriptor = FetchDescriptor<HistoryEntry>(
            sortBy: [SortDescriptor(\.timestamp, order: .reverse)]
        )
        entries = (try? context.fetch(descriptor)) ?? []
    }
}
