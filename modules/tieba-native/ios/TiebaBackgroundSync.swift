import BackgroundTasks
import ExpoModulesCore
import Foundation
import Security
import UIKit
import UserNotifications

final class TiebaBackgroundSnapshot {
  static let shared = TiebaBackgroundSnapshot()

  private let keychainService = "app"
  private let keychainAccount = "tiebalite.native.background_snapshot"

  var bduss = ""
  var stoken = ""
  var cookie = ""
  var uid = ""
  var tbs = ""
  var zid = ""
  var clientId = ""
  var forumIds: [String] = []
  var forumNames: [String] = []

  func save(_ payload: [String: Any]) {
    bduss = string(payload["bduss"])
    stoken = string(payload["stoken"])
    cookie = string(payload["cookie"])
    uid = string(payload["uid"])
    tbs = string(payload["tbs"])
    zid = string(payload["zid"])
    clientId = string(payload["clientId"])
    forumIds = payload["forumIds"] as? [String] ?? []
    forumNames = payload["forumNames"] as? [String] ?? []

    let payload: [String: Any] = [
      "bduss": bduss,
      "stoken": stoken,
      "cookie": cookie,
      "uid": uid,
      "tbs": tbs,
      "zid": zid,
      "clientId": clientId,
      "forumIds": forumIds,
      "forumNames": forumNames
    ]
    if let json = try? JSONSerialization.data(withJSONObject: payload),
       let encoded = String(data: json, encoding: .utf8) {
      writeKeychain(encoded)
    }
  }

  func load() {
    guard let raw = readKeychain(), let data = raw.data(using: .utf8) else { return }
    guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
    bduss = string(json["bduss"])
    stoken = string(json["stoken"])
    cookie = string(json["cookie"])
    uid = string(json["uid"])
    tbs = string(json["tbs"])
    zid = string(json["zid"])
    clientId = string(json["clientId"])
    forumIds = json["forumIds"] as? [String] ?? []
    forumNames = json["forumNames"] as? [String] ?? []
  }

  func clear() {
    bduss = ""
    stoken = ""
    cookie = ""
    uid = ""
    tbs = ""
    zid = ""
    clientId = ""
    forumIds = []
    forumNames = []
    deleteKeychain()
  }

  func commonParams() -> [String: String] {
    let now = Int(Date().timeIntervalSince1970 * 1000)
    let date = Date()
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyyMdd"
    let eventDay = formatter.string(from: date)
    let id = clientId.isEmpty ? "00000000-0000-4000-8000-000000000000" : clientId
    var params = [
      "BDUSS": bduss,
      "_client_id": id,
      "_client_type": "2",
      "_os_version": "31",
      "model": "SM-G9910",
      "net_type": "1",
      "_phone_imei": id,
      "timestamp": String(now),
      "active_timestamp": String(now),
      "android_id": "",
      "baiduid": "",
      "brand": "samsung",
      "c3_aid": id,
      "cmode": "1",
      "cuid": id,
      "cuid_galaxy2": id,
      "cuid_gid": "",
      "event_day": eventDay,
      "extra": "",
      "first_install_time": String(now - 86400_000 * 30),
      "framework_ver": "3340042",
      "from": "tieba",
      "is_teenager": "0",
      "last_update_time": String(now - 86400_000),
      "mac": "02:00:00:00:00:00",
      "oaid": "{\"id\":\"\",\"oaid\":\"\",\"aaid\":\"\",\"vaid\":\"\"}",
      "sample_id": id,
      "sdk_ver": "2.34.0",
      "start_scheme": "",
      "start_type": "1",
      "swan_game_ver": "1038000",
      "_client_version": "12.41.7.1",
      "naws_game_ver": "1038000",
      "personalized_rec_switch": "1",
      "z_id": ""
    ]
    if !stoken.isEmpty {
      params["stoken"] = stoken
    }
    params["device_score"] = "50"
    return params
  }

  private func string(_ value: Any?) -> String {
    if let string = value as? String {
      return string
    }
    if let number = value as? NSNumber {
      return number.stringValue
    }
    return ""
  }

  private func writeKeychain(_ value: String) {
    let data = Data(value.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: keychainAccount,
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    ]
    SecItemDelete(query as CFDictionary)
    SecItemAdd(query as CFDictionary, nil)
  }

  private func readKeychain() -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: keychainAccount,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let data = item as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  private func deleteKeychain() {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: keychainAccount
    ]
    SecItemDelete(query as CFDictionary)
  }
}

public class TiebaBackgroundAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    registerHandler(for: TiebaBackgroundSync.notificationTaskIdentifier)
    registerHandler(for: TiebaBackgroundSync.autoSignTaskIdentifier)
    return true
  }

  private func registerHandler(for identifier: String) {
    BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { task in
      TiebaBackgroundSync.shared.handle(task)
    }
  }
}

final class TiebaBackgroundSync {
  static let shared = TiebaBackgroundSync()
  static let notificationTaskIdentifier = "com.tiebalite.app.notification-sync"
  static let autoSignTaskIdentifier = "com.tiebalite.app.auto-sign"

  private let defaults = UserDefaults.standard
  private let intervalKey = "tiebalite.native.notification_interval_minutes"
  private let autoSignTimeKey = "tiebalite.native.auto_sign_time"
  private let autoSignSuccessPrefixKey = "tiebalite.native.auto_sign_success"
  private let autoSignSummaryPrefixKey = "tiebalite.native.auto_sign_summary"

  /// Baidu Tieba returns error_code 1101 for a forum that is already signed
  /// today. Both /c/c/forum/msign and /c/c/forum/sign use it. It is a
  /// successful state, never a failure.
  private static let alreadySignedErrorCode = 1101

  private func lastCountsKey(_ uid: String) -> String {
    return "tiebalite.native.last_counts.\(uid)"
  }

  private func autoSignSuccessKey(_ uid: String) -> String {
    return "\(autoSignSuccessPrefixKey).\(uid)"
  }

  private func autoSignSummaryKey(_ uid: String) -> String {
    return "\(autoSignSummaryPrefixKey).\(uid)"
  }

  func registerNotificationPoll(minutes: Double) throws {
    defaults.set(minutes, forKey: intervalKey)
    guard BGTaskScheduler.shared.supportsBackgroundTasks else { return }
    let request = BGAppRefreshTaskRequest(identifier: Self.notificationTaskIdentifier)
    request.earliestBeginDate = Date(timeIntervalSinceNow: minutes * 60)
    try? BGTaskScheduler.shared.submit(request)
  }

  func registerAutoSign(hour: Int, minute: Int) throws {
    defaults.set("\(hour):\(minute)", forKey: autoSignTimeKey)
    guard BGTaskScheduler.shared.supportsBackgroundTasks else { return }
    let request = BGProcessingTaskRequest(identifier: Self.autoSignTaskIdentifier)
    request.requiresNetworkConnectivity = true
    request.earliestBeginDate = nextAutoSignDate(hour: hour, minute: minute)
    try? BGTaskScheduler.shared.submit(request)
  }

  func cancelAutoSign() {
    BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.autoSignTaskIdentifier)
    defaults.removeObject(forKey: autoSignTimeKey)
  }

  func cancelNotificationSync() {
    BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.notificationTaskIdentifier)
    defaults.removeObject(forKey: intervalKey)
  }

  func cancelAll() {
    BGTaskScheduler.shared.cancelAllTaskRequests()
    defaults.removeObject(forKey: intervalKey)
    defaults.removeObject(forKey: autoSignTimeKey)
    cancelSignReminder()
  }

  func isAutoSignRegistered() -> Bool {
    return defaults.object(forKey: autoSignTimeKey) != nil
  }

  func handle(_ task: BGTask) {
    var completed = false
    task.expirationHandler = {
      finish(task, completed: &completed, success: false)
    }
    Task {
      do {
        TiebaBackgroundSnapshot.shared.load()
        if task.identifier == Self.notificationTaskIdentifier {
          try await performNotificationSync()
        } else if task.identifier == Self.autoSignTaskIdentifier {
          try await performAutoSign()
        }
        reschedule(for: task)
        finish(task, completed: &completed, success: true)
      } catch {
        reschedule(for: task)
        finish(task, completed: &completed, success: false)
      }
    }
  }

  private func reschedule(for task: BGTask) {
    if task.identifier == Self.notificationTaskIdentifier {
      rescheduleNotificationPoll()
    } else if task.identifier == Self.autoSignTaskIdentifier {
      rescheduleAutoSign()
    }
  }

  private func finish(_ task: BGTask, completed: inout Bool, success: Bool) {
    guard !completed else { return }
    completed = true
    task.setTaskCompleted(success: success)
  }

  func performNotificationSync() async throws {
    let snapshot = TiebaBackgroundSnapshot.shared
    guard !snapshot.bduss.isEmpty else { return }
    let response = try await TiebaNativeClient.shared.postForm(
      urlString: "https://c.tieba.baidu.com/c/s/msg",
      fields: ["bookmark": "1"],
      includeCommon: true,
      includeSign: true,
      requestId: "background-msg-\(UUID().uuidString)",
      timeout: 15
    )
    let data = response["data"] as? [String: Any] ?? response
    let reply = int(data["reply"])
    let at = int(data["at"])
    let agree = int(data["agree"])
    let total = reply + at + agree

    let previous = loadLastCounts(uid: snapshot.uid)
    if let previous {
      let newReply = reply - previous.reply
      let newAt = at - previous.at
      let newAgree = agree - previous.agree
      if total > previous.total {
        if newReply > 0 {
          sendNotification(
            "回复我的 (\(reply))",
            "你有 \(newReply) 条新回复",
            identifier: "msg_reply",
            deepLink: "tiebalite://notifications/0"
          )
        }
        if newAt > 0 {
          sendNotification(
            "提到我的 (\(at))",
            "有 \(newAt) 人@了你",
            identifier: "msg_at",
            deepLink: "tiebalite://notifications/1"
          )
        }
        if newAgree > 0 {
          sendNotification(
            "赞我的 (\(agree))",
            "有 \(newAgree) 人赞了你",
            identifier: "msg_agree",
            deepLink: "tiebalite://notifications/2"
          )
        }
      }
    }
    saveLastCounts(uid: snapshot.uid, reply: reply, at: at, agree: agree, total: total)
    await MainActor.run {
      UIApplication.shared.applicationIconBadgeNumber = total
    }
  }

  func performAutoSign() async throws {
    let snapshot = TiebaBackgroundSnapshot.shared
    guard !snapshot.tbs.isEmpty, !snapshot.forumIds.isEmpty else { return }

    let day = dayKey()

    // Coordination with the foreground sign channel:
    // 1. Forums a native auto-sign already completed today are persisted under
    //    `autoSignSuccessKey(uid)`. Skip them so a re-run (or a run that fires
    //    after the user signed manually in the foreground) does not re-hit the
    //    server.
    // 2. The server is idempotent: msign returns error_code 1101 for forums
    //    already signed today (by this app or another client). Those are
    //    classified as "已签到" (successful state), NOT as failures, so the
    //    completion notification never misreports "失败 N".
    var targets = snapshot.forumIds
    let alreadySignedToday = loadAutoSignSuccessIds(uid: snapshot.uid, day: day)
    if !alreadySignedToday.isEmpty {
      targets = targets.filter { !alreadySignedToday.contains($0) }
    }
    if targets.isEmpty {
      return
    }

    let response = try await TiebaNativeClient.shared.postForm(
      urlString: "https://c.tieba.baidu.com/c/c/forum/msign",
      fields: [
        "forum_ids": targets.joined(separator: ","),
        "tbs": snapshot.tbs,
        "authsid": "null",
        "stoken": snapshot.stoken,
        "user_id": ""
      ],
      includeCommon: true,
      includeSign: true,
      requestId: "background-msign-\(UUID().uuidString)",
      timeout: 25
    )
    let list = response["sign_list"] as? [[String: Any]] ?? []

    var success = 0
    var fail = 0
    var alreadySigned = 0
    var exp = 0
    var successIds = Set(alreadySignedToday)

    for item in list {
      let code = int(item["error_code"])
      if code == Self.alreadySignedErrorCode {
        alreadySigned += 1
        recordSignSuccess(item["forum_id"], in: &successIds)
      } else if code == 0 {
        success += 1
        exp += int(item["exp"])
        recordSignSuccess(item["forum_id"], in: &successIds)
      } else {
        fail += 1
      }
    }

    saveAutoSignSuccessIds(uid: snapshot.uid, day: day, ids: Array(successIds))
    saveLastAutoSignSummary(
      uid: snapshot.uid,
      day: day,
      success: success,
      fail: fail,
      alreadySigned: alreadySigned,
      exp: exp
    )

    if !list.isEmpty {
      let body: String
      if alreadySigned > 0 {
        body = "成功签到 \(success) 个吧，已签到 \(alreadySigned) 个，失败 \(fail) 个，获得 \(exp) 经验"
      } else {
        body = "成功签到 \(success) 个吧，失败 \(fail) 个，获得 \(exp) 经验"
      }
      sendNotification("一键签到完成", body, identifier: "sign_complete")
    }
  }

  private func recordSignSuccess(_ rawForumId: Any?, in ids: inout Set<String>) {
    let forumId = string(rawForumId)
    if !forumId.isEmpty { ids.insert(forumId) }
  }

  func saveBackgroundSnapshot(_ payload: [String: Any]) {
    TiebaBackgroundSnapshot.shared.save(payload)
  }

  func clearBackgroundSnapshot() {
    let uid = TiebaBackgroundSnapshot.shared.uid
    TiebaBackgroundSnapshot.shared.clear()
    if !uid.isEmpty {
      defaults.removeObject(forKey: autoSignSuccessKey(uid))
      defaults.removeObject(forKey: autoSignSummaryKey(uid))
    }
  }

  func setNotificationCounts(uid: String, reply: Int, at: Int, agree: Int, total: Int) {
    saveLastCounts(uid: uid, reply: reply, at: at, agree: agree, total: total)
  }

  func getNotificationCounts(uid: String) -> [String: Any]? {
    guard let counts = loadLastCounts(uid: uid) else { return nil }
    return [
      "reply": counts.reply,
      "at": counts.at,
      "agree": counts.agree,
      "total": counts.total
    ]
  }

  func clearNotificationCounts(uid: String) {
    defaults.removeObject(forKey: lastCountsKey(uid))
  }

  // ----------------------------------------------------------------
  // Auto-sign coordination state (day-scoped, uid-namespaced)
  // ----------------------------------------------------------------

  /// Last native auto-sign outcome for a uid, so the foreground channel and a
  /// future bridge caller can tell whether the background already signed today.
  /// The module bridge owns function registration (TiebaNativeModule.swift);
  /// expose this there if the JS side needs it directly.
  func getLastAutoSignSummary(uid: String) -> [String: Any]? {
    guard let raw = defaults.string(forKey: autoSignSummaryKey(uid)),
          let json = decodeJSON(raw) as? [String: Any]
    else {
      return nil
    }
    return json
  }

  func clearAutoSignSummary(uid: String) {
    defaults.removeObject(forKey: autoSignSummaryKey(uid))
    defaults.removeObject(forKey: autoSignSuccessKey(uid))
  }

  private func dayKey(_ date: Date = Date()) -> String {
    dayFormatter.string(from: date)
  }

  private lazy var dayFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyyMdd"
    return formatter
  }()

  private func loadAutoSignSuccessIds(uid: String, day: String) -> [String] {
    guard let raw = defaults.string(forKey: autoSignSuccessKey(uid)),
          let json = decodeJSON(raw) as? [String: Any],
          json["day"] as? String == day
    else {
      return []
    }
    return json["ids"] as? [String] ?? []
  }

  private func saveAutoSignSuccessIds(uid: String, day: String, ids: [String]) {
    saveJSON(["day": day, "ids": ids], forKey: autoSignSuccessKey(uid))
  }

  private func saveLastAutoSignSummary(
    uid: String,
    day: String,
    success: Int,
    fail: Int,
    alreadySigned: Int,
    exp: Int
  ) {
    let payload: [String: Any] = [
      "day": day,
      "success": success,
      "fail": fail,
      "alreadySigned": alreadySigned,
      "exp": exp,
      "timestamp": Int(Date().timeIntervalSince1970 * 1000)
    ]
    saveJSON(payload, forKey: autoSignSummaryKey(uid))
  }

  func scheduleSignReminder(hour: Int, minute: Int) {
    let content = UNMutableNotificationContent()
    content.title = "一键签到"
    content.body = "已安排，将在系统空闲时尝试"
    content.sound = .default
    content.badge = 1
    content.userInfo = ["type": "auto_sign_reminder"]

    var date = DateComponents()
    date.hour = hour
    date.minute = minute
    let trigger = UNCalendarNotificationTrigger(dateMatching: date, repeats: true)
    let request = UNNotificationRequest(identifier: "auto_sign_reminder", content: content, trigger: trigger)
    UNUserNotificationCenter.current().add(request)
  }

  func cancelSignReminder() {
    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["auto_sign_reminder"])
  }

  private func rescheduleNotificationPoll() {
    let minutes = defaults.double(forKey: intervalKey)
    guard minutes > 0 else { return }
    try? registerNotificationPoll(minutes: minutes)
  }

  private func rescheduleAutoSign() {
    guard let raw = defaults.string(forKey: autoSignTimeKey) else { return }
    let parts = raw.split(separator: ":").compactMap { Int($0) }
    guard parts.count == 2 else { return }
    try? registerAutoSign(hour: parts[0], minute: parts[1])
  }

  private func nextAutoSignDate(hour: Int, minute: Int) -> Date {
    let calendar = Calendar.current
    var components = calendar.dateComponents([.year, .month, .day], from: Date())
    components.hour = hour
    components.minute = minute
    guard let candidate = calendar.date(from: components) else { return Date(timeIntervalSinceNow: 86400) }
    return candidate > Date() ? candidate : calendar.date(byAdding: .day, value: 1, to: candidate) ?? candidate
  }

  private func loadLastCounts(uid: String) -> (reply: Int, at: Int, agree: Int, total: Int)? {
    guard let raw = defaults.string(forKey: lastCountsKey(uid)),
          let json = decodeJSON(raw) as? [String: Any]
    else {
      return nil
    }
    return (
      reply: int(json["reply"]),
      at: int(json["at"]),
      agree: int(json["agree"]),
      total: int(json["total"])
    )
  }

  private func saveLastCounts(uid: String, reply: Int, at: Int, agree: Int, total: Int) {
    saveJSON(
      ["reply": reply, "at": at, "agree": agree, "total": total],
      forKey: lastCountsKey(uid)
    )
  }

  private func decodeJSON(_ raw: String) -> Any? {
    guard let data = raw.data(using: .utf8) else { return nil }
    return try? JSONSerialization.jsonObject(with: data)
  }

  private func saveJSON(_ payload: [String: Any], forKey key: String) {
    guard let data = try? JSONSerialization.data(withJSONObject: payload),
          let encoded = String(data: data, encoding: .utf8)
    else {
      return
    }
    defaults.set(encoded, forKey: key)
  }

  private func sendNotification(
    _ title: String,
    _ body: String,
    identifier: String,
    deepLink: String? = nil
  ) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    if let deepLink {
      content.userInfo = ["type": "message", "url": deepLink]
    }
    let request = UNNotificationRequest(identifier: identifier, content: content, trigger: nil)
    UNUserNotificationCenter.current().add(request)
  }

  private func coerceNumber<T>(
    _ value: Any?,
    numberValue: (NSNumber) -> T,
    stringValue: (String) -> T?
  ) -> T? {
    if let number = value as? NSNumber {
      return numberValue(number)
    }
    if let string = value as? String, let parsed = stringValue(string) {
      return parsed
    }
    return nil
  }

  private func int(_ value: Any?) -> Int {
    coerceNumber(value, numberValue: \.intValue, stringValue: Int.init) ?? 0
  }

  private func string(_ value: Any?) -> String {
    coerceNumber(value, numberValue: \.stringValue, stringValue: Optional.some) ?? ""
  }
}
