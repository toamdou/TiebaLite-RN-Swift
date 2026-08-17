import ActivityKit
import ExpoModulesCore
import Foundation

@available(iOS 16.2, *)
@MainActor
final class TiebaLiveActivityManager {
  static let shared = TiebaLiveActivityManager()

  private var activities: [String: Activity<LiveActivityKitAttributes>] = [:]

  private init() {}

  nonisolated static func areActivitiesEnabled() -> Bool {
    ActivityAuthorizationInfo().areActivitiesEnabled
  }

  func start(state: [String: Any]) throws -> String {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      throw TiebaLiveActivityError.disabled
    }
    let attributes = LiveActivityKitAttributes(
      name: state["name"] as? String ?? "TiebaLiteSign",
      extra: state["extra"] as? [String: String]
    )
    let content = ActivityContent(
      state: Self.makeState(state),
      staleDate: nil,
      relevanceScore: 0
    )
    let activity = try Activity<LiveActivityKitAttributes>.request(
      attributes: attributes,
      content: content,
      pushType: nil
    )
    activities[activity.id] = activity
    return activity.id
  }

  func update(activityId: String, state: [String: Any]) async {
    guard let activity = activities[activityId] else { return }
    let content = ActivityContent(
      state: Self.makeState(state),
      staleDate: nil,
      relevanceScore: 0
    )
    await activity.update(content, alertConfiguration: nil)
  }

  func end(activityId: String, state: [String: Any], dismissalPolicy: String) async {
    guard let activity = activities[activityId] else { return }
    let content = ActivityContent(
      state: Self.makeState(state),
      staleDate: nil,
      relevanceScore: 0
    )
    await activity.end(content, dismissalPolicy: dismissalPolicy == "immediate" ? .immediate : .default)
    activities.removeValue(forKey: activityId)
  }

  func endAll(state: [String: Any], dismissalPolicy: String) async {
    let content = ActivityContent(
      state: Self.makeState(state),
      staleDate: nil,
      relevanceScore: 0
    )
    let isImmediate = dismissalPolicy == "immediate"
    for activity in Activity<LiveActivityKitAttributes>.activities {
      await activity.end(content, dismissalPolicy: isImmediate ? .immediate : .default)
    }
    activities.removeAll()
  }

  private static func makeState(
    _ raw: [String: Any]
  ) -> LiveActivityKitAttributes.ContentState {
    LiveActivityKitAttributes.ContentState(
      title: raw["title"] as? String ?? "",
      subtitle: raw["subtitle"] as? String,
      body: raw["body"] as? String,
      currentForum: raw["currentForum"] as? String,
      status: raw["status"] as? String,
      progress: raw["progress"] as? Double,
      date: raw["date"] as? Double,
      imageName: raw["imageName"] as? String,
      tintColorHex: raw["tintColorHex"] as? String,
      leading: raw["leading"] as? String,
      trailing: raw["trailing"] as? String,
      extra: raw["extra"] as? [String: String]
    )
  }

}

enum TiebaLiveActivityError: LocalizedError {
  case disabled

  var errorDescription: String? {
    switch self {
    case .disabled:
      return "Live Activities are not enabled for this app."
    }
  }
}
