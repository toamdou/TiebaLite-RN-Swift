import ExpoModulesCore
import Foundation
import UIKit

public final class TiebaNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TiebaNative")

    Function("isAvailable") {
      true
    }

    Function("protoInitialize") { (json: String) throws in
      try TiebaProtoRegistry.shared.initialize(json: json)
    }

    // Sync variant — kept for the existing synchronous JS caller
    // (src/services/api/proto.ts). Encode cost is now tiny thanks to the
    // registry's resolveMessage cache, so the JS-thread blocking is minimal.
    Function("protoEncode") { (typePath: String, payload: [String: Any]) throws -> String in
      let data = try TiebaProtoEncoder().encode(messagePath: typePath, payload: payload)
      return data.base64EncodedString()
    }

    // Async variant — encodes on a background queue, never blocks JS.
    AsyncFunction("protoEncodeAsync") { (typePath: String, payload: [String: Any]) async throws -> String in
      let data = try await Task.detached(priority: .userInitiated) {
        try TiebaProtoEncoder().encode(messagePath: typePath, payload: payload)
      }.value
      return data.base64EncodedString()
    }

    Function("protoDecode") { (typePath: String, base64: String) throws -> [String: Any] in
      guard let data = Data(base64Encoded: base64) else {
        throw TiebaProtoError.invalidWire("invalid base64")
      }
      return try TiebaProtoDecoder().decode(messagePath: typePath, bytes: data)
    }

    AsyncFunction("protoPost") {
      (
        url: String,
        headers: [String: String],
        formFields: [[String]],
        protoDataBase64: String,
        skipSign: Bool,
        responseType: String,
        requestId: String,
        timeoutMs: Double?
      ) async throws -> String in
      guard let protoData = Data(base64Encoded: protoDataBase64) else {
        throw TiebaProtoError.invalidWire("invalid proto base64")
      }
      let responseData = try await TiebaNativeClient.shared.postProto(
        urlString: url,
        headers: headers,
        formFields: formFields,
        protoData: protoData,
        skipSign: skipSign,
        requestId: requestId,
        timeout: timeoutMs ?? 15000
      )
      // Decode on a background queue, project the tree down to the render
      // whitelist, then serialize to a JSON string. A flat string crosses the
      // bridge far cheaper than a deeply nested dictionary, and the projection
      // prunes content the JS UI never reads (mirrors helpers.ts mapping
      // whitelist: subPosts capped to 3, firstPostContent dropped, etc.), so
      // the JS heap only ever holds one projected copy.
      let decoded = try await Task.detached(priority: .userInitiated) {
        try TiebaProtoDecoder().decode(messagePath: responseType, bytes: responseData)
      }.value
      let projected = TiebaProtoProjector.shared.project(decoded, messagePath: responseType)
      let jsonData = try JSONSerialization.data(withJSONObject: projected)
      return String(data: jsonData, encoding: .utf8) ?? "{}"
    }

    Function("cancelProtoRequest") { (requestId: String) in
      TiebaNativeClient.shared.cancel(requestId: requestId)
    }

    Function("signParams") { (params: [String: String]) -> String in
      TiebaSigner.signParams(params)
    }

    Function("signFields") { (fields: [[String]]) -> String in
      TiebaSigner.signFields(fields)
    }

    AsyncFunction("makeThumbnail") {
      (
        sourceUri: String,
        width: Double,
        height: Double,
        cacheKey: String,
        referer: String?,
        targetWidth: Double?
      ) async throws -> String in
      try await TiebaImageIO.shared.makeThumbnail(
        sourceUri: sourceUri,
        width: width,
        height: height,
        cacheKey: cacheKey,
        referer: referer,
        targetWidth: targetWidth
      )
    }

    AsyncFunction("applyWatermark") {
      (sourceUri: String, text: String) async throws -> String in
      try await TiebaImageIO.shared.applyWatermark(sourceUri: sourceUri, text: text)
    }

    Function("clearThumbnailCache") {
      _ = try? TiebaImageIO.shared.clearCache()
    }

    Function("isLiveActivitySupported") {
      supportsLiveActivities
    }

    Function("areLiveActivitiesEnabled") {
      guard supportsLiveActivities else { return false }
      return TiebaLiveActivityManager.areActivitiesEnabled()
    }

    AsyncFunction("startLiveActivity") { (state: [String: Any]) async throws -> String? in
      guard supportsLiveActivities else { return nil }
      return try await TiebaLiveActivityManager.shared.start(state: state)
    }

    AsyncFunction("updateLiveActivity") { (activityId: String, state: [String: Any]) async throws in
      guard supportsLiveActivities else { return }
      await TiebaLiveActivityManager.shared.update(activityId: activityId, state: state)
    }

    AsyncFunction("endLiveActivity") { (activityId: String, state: [String: Any], dismissalPolicy: String) async throws in
      guard supportsLiveActivities else { return }
      await TiebaLiveActivityManager.shared.end(
        activityId: activityId,
        state: state,
        dismissalPolicy: dismissalPolicy
      )
    }

    AsyncFunction("endAllLiveActivities") { (state: [String: Any], dismissalPolicy: String) async throws in
      guard supportsLiveActivities else { return }
      await TiebaLiveActivityManager.shared.endAll(
        state: state,
        dismissalPolicy: dismissalPolicy
      )
    }

    Function("saveBackgroundSnapshot") { (payload: [String: Any]) in
      TiebaBackgroundSync.shared.saveBackgroundSnapshot(payload)
    }

    Function("clearBackgroundSnapshot") {
      TiebaBackgroundSync.shared.clearBackgroundSnapshot()
    }

    Function("registerNotificationSync") { (minutes: Double) throws in
      try TiebaBackgroundSync.shared.registerNotificationPoll(minutes: minutes)
    }

    Function("cancelNotificationSync") {
      TiebaBackgroundSync.shared.cancelNotificationSync()
    }

    Function("setNotificationCounts") {
      (uid: String, reply: Int, at: Int, agree: Int, total: Int) in
      TiebaBackgroundSync.shared.setNotificationCounts(
        uid: uid,
        reply: reply,
        at: at,
        agree: agree,
        total: total
      )
    }

    Function("getNotificationCounts") { (uid: String) -> [String: Any]? in
      TiebaBackgroundSync.shared.getNotificationCounts(uid: uid)
    }

    Function("clearNotificationCounts") { (uid: String) in
      TiebaBackgroundSync.shared.clearNotificationCounts(uid: uid)
    }

    Function("registerAutoSign") { (hour: Int, minute: Int) throws in
      try TiebaBackgroundSync.shared.registerAutoSign(hour: hour, minute: minute)
    }

    Function("cancelAutoSign") {
      TiebaBackgroundSync.shared.cancelAutoSign()
    }

    Function("cancelAllBackgroundTasks") {
      TiebaBackgroundSync.shared.cancelAll()
    }

    Function("isAutoSignRegistered") { () -> Bool in
      TiebaBackgroundSync.shared.isAutoSignRegistered()
    }

    Function("scheduleSignReminder") { (hour: Int, minute: Int) in
      TiebaBackgroundSync.shared.scheduleSignReminder(hour: hour, minute: minute)
    }

    Function("cancelSignReminder") {
      TiebaBackgroundSync.shared.cancelSignReminder()
    }

    View(TiebaRichTextView.self) {
      Events("onLinkPress", "onUserPress", "onTopicPress")

      Prop("contentWidth") { (view, width: Double) in
        view.contentWidth = CGFloat(width)
      }

      Prop("fontSize") { (view, size: Double) in
        view.fontSize = CGFloat(size)
      }

      Prop("lineHeight") { (view, height: Double) in
        view.lineHeight = CGFloat(height)
      }

      Prop("textColor") { (view, color: UIColor?) in
        view.textColor = color ?? .label
      }

      Prop("linkColor") { (view, color: UIColor?) in
        view.linkColor = color ?? .systemBlue
      }

      Prop("runs") { (view, runs: [[String: Any]]) in
        view.runs = runs
      }
    }

    View(TiebaGradientBlurView.self) {
      Prop("intensity") { (view, intensity: Double) in
        view.intensity = intensity
      }
      Prop("tint") { (view, tint: String) in
        view.tint = tint
      }
      Prop("fadeHeight") { (view, fadeHeight: Double) in
        view.fadeHeight = fadeHeight
      }
    }

    View(TiebaAudioWaveformView.self) {
      Prop("heights") { (view, heights: [Double]) in
        view.heights = heights
      }
      Prop("isPlaying") { (view, isPlaying: Bool) in
        view.isPlaying = isPlaying
      }
      Prop("color") { (view, color: UIColor?) in
        view.color = color ?? .systemBlue
      }
      Prop("inactiveColor") { (view, color: UIColor?) in
        view.inactiveColor = color ?? .secondaryLabel
      }
    }

    // ── iOS 26 美化波（P1）：原生按压 + 原生信息流卡片 ──

    View(TiebaPressableView.self) {
      Events("onPress")

      Prop("scalePressed") { (view, scale: Double) in
        view.scalePressed = scale
      }
      Prop("highlightColor") { (view, color: UIColor?) in
        view.highlightColor = color
      }
      Prop("disabled") { (view, disabled: Bool) in
        view.disabled = disabled
      }
    }

    View(TiebaFeedCellView.self) {
      Events("onPress")

      Prop("title") { (view, title: String) in
        view.title = title
      }
      Prop("summary") { (view, summary: String?) in
        view.summary = summary
      }
      Prop("author") { (view, author: String) in
        view.author = author
      }
      Prop("forumName") { (view, forumName: String?) in
        view.forumName = forumName
      }
      Prop("replyCount") { (view, replyCount: Int) in
        view.replyCount = replyCount
      }
      Prop("timeText") { (view, timeText: String) in
        view.timeText = timeText
      }
      Prop("imageUrl") { (view, imageUrl: String?) in
        view.imageUrl = imageUrl
      }
      Prop("accentColor") { (view, color: UIColor?) in
        view.accentColor = color
      }
      Prop("textPrimary") { (view, color: UIColor) in
        view.textPrimary = color
      }
      Prop("textSecondary") { (view, color: UIColor) in
        view.textSecondary = color
      }
      Prop("cardBackground") { (view, color: UIColor?) in
        view.cardBackground = color
      }
      Prop("radius") { (view, radius: Double) in
        view.radius = radius
      }
      Prop("enterIndex") { (view, index: Int) in
        view.enterIndex = index
      }
    }

    View(TiebaGlassSurfaceView.self) {
      Events("onPress")

      Prop("material") { (view, material: String) in
        view.material = material
      }
      Prop("tintColor") { (view, color: UIColor?) in
        view.tintColor = color
      }
      Prop("cornerRadius") { (view, radius: Double) in
        view.cornerRadius = radius
      }
      Prop("borderColor") { (view, color: UIColor?) in
        view.borderColor = color
      }
      Prop("highlight") { (view, highlight: Bool) in
        view.highlight = highlight
      }
    }
  }

  private var supportsLiveActivities: Bool {
    if #available(iOS 16.2, *) {
      return true
    }
    return false
  }
}
