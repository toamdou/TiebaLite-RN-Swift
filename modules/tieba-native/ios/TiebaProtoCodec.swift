import Foundation

enum TiebaProtoError: LocalizedError {
  case invalidDescriptor
  case messageNotFound(String)
  case invalidPayload(String)
  case invalidWire(String)

  var errorDescription: String? {
    switch self {
    case .invalidDescriptor:
      return "Invalid protobuf descriptor JSON"
    case .messageNotFound(let path):
      return "Protobuf message not found: \(path)"
    case .invalidPayload(let reason):
      return "Invalid protobuf payload: \(reason)"
    case .invalidWire(let reason):
      return "Invalid protobuf wire data: \(reason)"
    }
  }
}

struct TiebaProtoField {
  let name: String
  let id: Int
  let type: String
  let repeated: Bool
  let protoName: String
}

struct TiebaProtoMessage {
  let path: String
  let fields: [Int: TiebaProtoField]
}

final class TiebaProtoRegistry {
  static let shared = TiebaProtoRegistry()

  private var root: [String: Any] = [:]
  private var messages: [String: TiebaProtoMessage] = [:]
  private var resolveCache: [String: ResolveResult] = [:]
  private let resolveLock = NSLock()

  private enum ResolveResult {
    case message(TiebaProtoMessage)
    case notFound
  }

  func initialize(json: String) throws {
    guard
      let data = json.data(using: .utf8),
      let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      throw TiebaProtoError.invalidDescriptor
    }
    root = object
    messages = [:]
    resolveCache = [:]
    try walk(object, path: "")
  }

  private func walk(_ object: [String: Any], path: String) throws {
    guard let nested = object["nested"] as? [String: Any] else { return }
    for (key, value) in nested {
      let fullPath = path.isEmpty ? key : "\(path).\(key)"
      guard let child = value as? [String: Any] else { continue }
      if let rawFields = child["fields"] as? [String: Any] {
        var fields: [Int: TiebaProtoField] = [:]
        for (fieldName, raw) in rawFields {
          guard
            let field = raw as? [String: Any],
            let id = field["id"] as? NSNumber
          else {
            continue
          }
          fields[id.intValue] = TiebaProtoField(
            name: fieldName,
            id: id.intValue,
            type: field["type"] as? String ?? "string",
            repeated: (field["rule"] as? String) == "repeated",
            protoName: field["protoName"] as? String ?? fieldName
          )
        }
        messages[fullPath] = TiebaProtoMessage(path: fullPath, fields: fields)
      }
      try walk(child, path: fullPath)
    }
  }

  func message(path: String) throws -> TiebaProtoMessage {
    guard let message = messages[path] else {
      throw TiebaProtoError.messageNotFound(path)
    }
    return message
  }

  func resolveMessage(typeName: String, currentPath: String) throws -> TiebaProtoMessage {
    let trimmed = typeName.hasPrefix(".") ? String(typeName.dropFirst()) : typeName
    // Absolute paths are already unique; relative names depend on the namespace.
    let key = trimmed.contains(".") ? trimmed : "\(currentPath)|\(trimmed)"

    resolveLock.lock()
    let cached = resolveCache[key]
    resolveLock.unlock()
    if let cached {
      switch cached {
      case .message(let message):
        return message
      case .notFound:
        throw TiebaProtoError.messageNotFound(trimmed)
      }
    }

    do {
      let resolved: TiebaProtoMessage
      if trimmed.contains(".") {
        resolved = try message(path: trimmed)
      } else {
        resolved = try resolveRelative(typeName: trimmed, currentPath: currentPath)
      }
      cache(key, .message(resolved))
      return resolved
    } catch {
      // Negative results are cached too: string/bytes fields probe resolveMessage
      // on every length-delimited read, and repeating the namespace fallback scan
      // on every miss is the hottest decode path.
      cache(key, .notFound)
      throw error
    }
  }

  private func cache(_ key: String, _ result: ResolveResult) {
    resolveLock.lock()
    resolveCache[key] = result
    resolveLock.unlock()
  }

  private func resolveRelative(typeName: String, currentPath: String) throws -> TiebaProtoMessage {
    var namespace = currentPath
    while true {
      let candidate = namespace.isEmpty ? typeName : "\(namespace).\(typeName)"
      if let message = messages[candidate] {
        return message
      }
      guard let dot = namespace.lastIndex(of: ".") else { break }
      namespace = String(namespace[..<dot])
    }
    if let message = messages[typeName] {
      return message
    }
    throw TiebaProtoError.messageNotFound(typeName)
  }
}

final class TiebaProtoEncoder {
  private let registry: TiebaProtoRegistry
  private var data = Data()

  init(registry: TiebaProtoRegistry = .shared) {
    self.registry = registry
  }

  func encode(messagePath: String, payload: [String: Any]) throws -> Data {
    let message = try registry.message(path: messagePath)
    for field in message.fields.values.sorted(by: { $0.id < $1.id }) {
      guard let value = payload[field.name], !(value is NSNull) else { continue }
      if field.repeated {
        guard let array = value as? [Any] else { continue }
        for item in array {
          try write(field: field, value: item, messagePath: messagePath)
        }
      } else {
        try write(field: field, value: value, messagePath: messagePath)
      }
    }
    return data
  }

  private func write(field: TiebaProtoField, value: Any, messagePath: String) throws {
    if let nestedMessage = try? registry.resolveMessage(typeName: field.type, currentPath: messagePath) {
      guard let nestedPayload = value as? [String: Any] else {
        throw TiebaProtoError.invalidPayload("\(field.name) expects a message object")
      }
      let nestedData = try encode(messagePath: nestedMessage.path, payload: nestedPayload)
      try writeLengthDelimitedField(field.id, nestedData)
      return
    }

    switch field.type {
    case "double":
      try writeFixed64Field(field.id, try number(value).bitPattern)
    case "float":
      try writeFixed32Field(field.id, try Float(number(value)).bitPattern)
    case "fixed64", "sfixed64":
      try writeFixed64Field(field.id, try uint64(value))
    case "fixed32", "sfixed32":
      try writeFixed32Field(field.id, try uint32(value))
    case "sint32":
      try writeVarintField(field.id, UInt64(zigZagEncode32(try int32(value))))
    case "sint64":
      try writeVarintField(field.id, zigZagEncode64(try int64(value)))
    case "string", "bytes":
      let fieldData = field.type == "string" ? try stringData(value) : try bytesData(value)
      try writeLengthDelimitedField(field.id, fieldData)
    default:
      try writeVarintField(field.id, try varint(value))
    }
  }

  private func writeKey(_ fieldNumber: Int, wireType: Int) throws {
    guard fieldNumber > 0 else {
      throw TiebaProtoError.invalidPayload("Field number must be positive")
    }
    try appendVarint(UInt64((fieldNumber << 3) | wireType))
  }

  private func writeVarintField(_ fieldNumber: Int, _ value: UInt64) throws {
    try writeKey(fieldNumber, wireType: 0)
    try appendVarint(value)
  }

  private func writeFixed32Field(_ fieldNumber: Int, _ value: UInt32) throws {
    try writeKey(fieldNumber, wireType: 5)
    appendFixed32(value)
  }

  private func writeFixed64Field(_ fieldNumber: Int, _ value: UInt64) throws {
    try writeKey(fieldNumber, wireType: 1)
    appendFixed64(value)
  }

  private func writeLengthDelimitedField(_ fieldNumber: Int, _ value: Data) throws {
    try writeKey(fieldNumber, wireType: 2)
    try appendVarint(UInt64(value.count))
    data.append(value)
  }

  private func appendVarint(_ value: UInt64) throws {
    var v = value
    while v >= 0x80 {
      data.append(UInt8(v & 0x7f) | 0x80)
      v >>= 7
    }
    data.append(UInt8(v))
  }

  private func appendFixed32(_ value: UInt32) {
    var little = value.littleEndian
    withUnsafeBytes(of: &little) { raw in
      data.append(contentsOf: raw.bindMemory(to: UInt8.self))
    }
  }

  private func appendFixed64(_ value: UInt64) {
    var little = value.littleEndian
    withUnsafeBytes(of: &little) { raw in
      data.append(contentsOf: raw.bindMemory(to: UInt8.self))
    }
  }

  private func parseNumber<T>(
    _ value: Any,
    message: String,
    numberValue: (NSNumber) -> T,
    stringValue: (String) -> T?
  ) throws -> T {
    if let number = value as? NSNumber {
      return numberValue(number)
    }
    if let string = value as? String, let parsed = stringValue(string) {
      return parsed
    }
    throw TiebaProtoError.invalidPayload(message)
  }

  private func number(_ value: Any) throws -> Double {
    try parseNumber(
      value,
      message: "Expected a number, got \(value)",
      numberValue: \.doubleValue,
      stringValue: Double.init
    )
  }

  private func int32(_ value: Any) throws -> Int32 {
    try parseNumber(value, message: "Expected int32", numberValue: \.int32Value, stringValue: Int32.init)
  }

  private func int64(_ value: Any) throws -> Int64 {
    try parseNumber(value, message: "Expected int64", numberValue: \.int64Value, stringValue: Int64.init)
  }

  private func uint32(_ value: Any) throws -> UInt32 {
    try parseNumber(value, message: "Expected uint32", numberValue: \.uint32Value, stringValue: UInt32.init)
  }

  private func uint64(_ value: Any) throws -> UInt64 {
    try parseNumber(value, message: "Expected uint64", numberValue: \.uint64Value, stringValue: UInt64.init)
  }

  private func varint(_ value: Any) throws -> UInt64 {
    if let bool = value as? Bool {
      return bool ? 1 : 0
    }
    if let number = value as? NSNumber {
      if CFGetTypeID(number) == CFBooleanGetTypeID() {
        return number.boolValue ? 1 : 0
      }
      return UInt64(bitPattern: number.int64Value)
    }
    if let string = value as? String, let number = Int64(string) {
      return UInt64(bitPattern: number)
    }
    throw TiebaProtoError.invalidPayload("Expected varint value")
  }

  private func stringData(_ value: Any) throws -> Data {
    guard let string = value as? String, let data = string.data(using: .utf8) else {
      throw TiebaProtoError.invalidPayload("Expected string")
    }
    return data
  }

  private func bytesData(_ value: Any) throws -> Data {
    if let data = value as? Data {
      return data
    }
    if let string = value as? String, let data = Data(base64Encoded: string) {
      return data
    }
    throw TiebaProtoError.invalidPayload("Expected base64 bytes")
  }

  private func zigZagEncode32(_ value: Int32) -> UInt32 {
    let bits = UInt32(bitPattern: value)
    return (bits << 1) ^ (bits >> 31)
  }

  private func zigZagEncode64(_ value: Int64) -> UInt64 {
    return UInt64(bitPattern: (value << 1) ^ (value >> 63))
  }
}

final class TiebaProtoDecoder {
  private let registry: TiebaProtoRegistry
  private var data = Data()
  private var index = 0
  // Exclusive end of the currently decoded message window. Nested messages
  // narrow this instead of copying subdata / allocating a new decoder.
  private var windowEnd = 0

  init(registry: TiebaProtoRegistry = .shared) {
    self.registry = registry
  }

  func decode(messagePath: String, bytes: Data) throws -> [String: Any] {
    return try decode(messagePath: messagePath, data: bytes, from: 0, to: bytes.count)
  }

  // Shared entry point: top-level calls get the full buffer; nested messages
  // reuse this instance with a narrowed window, avoiding subdata copies and
  // per-level decoder allocation.
  func decode(messagePath: String, data bytes: Data, from start: Int, to end: Int) throws -> [String: Any] {
    let message = try registry.message(path: messagePath)
    let savedData = data
    let savedIndex = index
    let savedWindowEnd = windowEnd
    data = bytes
    index = start
    windowEnd = end
    var result: [String: Any] = [:]

    while index < windowEnd {
      guard let key = try readVarint() else { break }
      let fieldId = Int(key >> 3)
      let wireType = Int(key & 0x07)
      guard let field = message.fields[fieldId] else {
        try skip(wireType: wireType)
        continue
      }

      if field.repeated {
        if isPackedField(field, wireType: wireType, messagePath: messagePath) {
          let values = try readPacked(field: field, messagePath: messagePath)
          result[field.name] = (result[field.name] as? [Any] ?? []) + values
        } else {
          let value = try read(field: field, wireType: wireType, messagePath: messagePath)
          result[field.name] = (result[field.name] as? [Any] ?? []) + [value]
        }
      } else {
        result[field.name] = try read(field: field, wireType: wireType, messagePath: messagePath)
      }
    }

    data = savedData
    index = savedIndex
    windowEnd = savedWindowEnd
    return omitDefaults(result)
  }

  private func readVarint() throws -> UInt64? {
    guard index < windowEnd else { return nil }
    var result: UInt64 = 0
    var shift: UInt64 = 0
    while index < windowEnd {
      if shift >= 64 {
        throw TiebaProtoError.invalidWire("varint too long")
      }
      let byte = data[index]
      index += 1
      result |= UInt64(byte & 0x7f) << shift
      if byte & 0x80 == 0 {
        return result
      }
      shift += 7
    }
    throw TiebaProtoError.invalidWire("truncated varint")
  }

  private func readLength() throws -> Int {
    guard let length = try readVarint() else {
      throw TiebaProtoError.invalidWire("missing length")
    }
    guard length <= UInt64(windowEnd - index) else {
      throw TiebaProtoError.invalidWire("length exceeds payload")
    }
    return Int(length)
  }

  private func read(field: TiebaProtoField, wireType: Int, messagePath: String) throws -> Any {
    switch wireType {
    case 0:
      guard let raw = try readVarint() else {
        throw TiebaProtoError.invalidWire("missing varint")
      }
      return scalar(fromVarint: raw, type: field.type)
    case 1:
      return fixed64(from: try readFixedBytes(width: 8, error: "missing fixed64"), type: field.type)
    case 2:
      let length = try readLength()
      let sliceStart = index
      index += length
      if let nestedMessage = try? registry.resolveMessage(typeName: field.type, currentPath: messagePath) {
        // Reuse this instance: narrower window, no subdata copy, no decoder churn.
        return try decode(messagePath: nestedMessage.path, data: data, from: sliceStart, to: sliceStart + length)
      }
      let slice = data.subdata(in: sliceStart..<(sliceStart + length))
      if field.type == "string" {
        return String(data: slice, encoding: .utf8) ?? ""
      }
      if field.type == "bytes" {
        return slice.base64EncodedString()
      }
      throw TiebaProtoError.invalidWire("unexpected length-delimited field \(field.type)")
    case 5:
      return fixed32(from: try readFixedBytes(width: 4, error: "missing fixed32"), type: field.type)
    default:
      throw TiebaProtoError.invalidWire("unsupported wire type \(wireType)")
    }
  }

  private func readFixedBytes(width: Int, error reason: String) throws -> Data {
    guard index + width <= windowEnd else {
      throw TiebaProtoError.invalidWire(reason)
    }
    defer { index += width }
    return data.subdata(in: index..<(index + width))
  }

  private func isPackedField(_ field: TiebaProtoField, wireType: Int, messagePath: String) -> Bool {
    guard field.repeated, wireType == 2 else { return false }
    return !["string", "bytes"].contains(field.type) &&
      (try? registry.resolveMessage(typeName: field.type, currentPath: messagePath)) == nil
  }

  private func readPacked(field: TiebaProtoField, messagePath: String) throws -> [Any] {
    let length = try readLength()
    let end = index + length
    var values: [Any] = []
    while index < end {
      let wireType = packedWireType(for: field.type)
      values.append(try read(field: field, wireType: wireType, messagePath: messagePath))
    }
    return values
  }

  private func packedWireType(for type: String) -> Int {
    switch type {
    case "double", "fixed64", "sfixed64":
      return 1
    case "float", "fixed32", "sfixed32":
      return 5
    default:
      return 0
    }
  }

  private func scalar(fromVarint raw: UInt64, type: String) -> Any {
    switch type {
    case "bool":
      return raw != 0
    case "int32":
      return Int32(truncatingIfNeeded: raw)
    case "int64":
      return Int64(bitPattern: raw)
    case "uint32":
      return UInt32(truncatingIfNeeded: raw)
    case "uint64":
      return raw
    case "sint32":
      return zigZagDecode32(UInt32(truncatingIfNeeded: raw))
    case "sint64":
      return zigZagDecode64(raw)
    default:
      return Int64(bitPattern: raw)
    }
  }

  private func fixed64(from slice: Data, type: String) -> Any {
    let value = slice.withUnsafeBytes { $0.loadUnaligned(as: UInt64.self) }
    switch type {
    case "double":
      return Double(bitPattern: value)
    case "sfixed64":
      return Int64(bitPattern: value)
    default:
      return value
    }
  }

  private func fixed32(from slice: Data, type: String) -> Any {
    let value = slice.withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) }
    switch type {
    case "float":
      return Float(bitPattern: value)
    case "sfixed32":
      return Int32(bitPattern: value)
    default:
      return value
    }
  }

  private func zigZagDecode32(_ value: UInt32) -> Int32 {
    return Int32(bitPattern: (value >> 1) ^ UInt32(bitPattern: -(Int32(bitPattern: value) & 1)))
  }

  private func zigZagDecode64(_ value: UInt64) -> Int64 {
    return Int64(bitPattern: (value >> 1) ^ UInt64(bitPattern: -(Int64(bitPattern: value) & 1)))
  }

  private func skip(wireType: Int) throws {
    switch wireType {
    case 0:
      _ = try readVarint()
    case 1:
      index += 8
    case 2:
      let length = try readLength()
      index += length
    case 5:
      index += 4
    case 3:
      while true {
        guard let key = try readVarint() else {
          throw TiebaProtoError.invalidWire("unterminated group")
        }
        if Int(key & 0x07) == 4 { break }
        try skip(wireType: Int(key & 0x07))
      }
    case 4:
      throw TiebaProtoError.invalidWire("unexpected end group")
    default:
      throw TiebaProtoError.invalidWire("unsupported skip wire type \(wireType)")
    }
  }

  private func omitDefaults(_ object: [String: Any]) -> [String: Any] {
    var result = object
    var removeKeys: [String] = []
    for (key, value) in object {
      if let array = value as? [Any] {
        if array.isEmpty { removeKeys.append(key) }
      } else if let dictionary = value as? [String: Any] {
        // Prune nested messages in place; empty nested dicts are kept so the
        // shape returned to JS is byte-for-byte the same as before.
        result[key] = omitDefaults(dictionary)
      } else if isDefault(value) {
        removeKeys.append(key)
      }
    }
    for key in removeKeys {
      result.removeValue(forKey: key)
    }
    return result
  }

  private func isDefault(_ value: Any) -> Bool {
    if let number = value as? NSNumber {
      if CFGetTypeID(number) == CFBooleanGetTypeID() {
        return !number.boolValue
      }
      return number.doubleValue == 0
    }
    if let string = value as? String {
      return string.isEmpty
    }
    if let data = value as? Data {
      return data.isEmpty
    }
    return false
  }
}

/// Post-decode field projection ("响应映射下沉 — 投影裁剪").
///
/// After a response is decoded into a full `[String: Any]` tree, we prune every
/// message down to the fields the JS render layer actually reads, before the
/// JSON string is serialized and crossed over the bridge. This kills the
/// "full payload over the bridge twice" cost: only render-relevant data ever
/// leaves native, so the JS heap only ever holds one (projected) copy.
///
/// Contract with `src/services/api/endpoints/helpers.ts`:
///   - Field names are the descriptor camelCase names the decoder produces, so
///     helpers reads (`raw.field ?? raw.field_name`) resolve identically.
///   - The heavy pruning helpers already perform is mirrored here:
///       * ThreadInfo.firstPostContent is dropped (no UI reads it).
///       * Post.subPostList → SubPost.subPostList is capped to the first 3
///         (helpers keeps `slice(0, 3)` as a no-op guard).
///   - `toMillis` / `isDisagree` / subPosts slicing semantics are NOT moved
///     into Swift; they stay in helpers unchanged.
///   - Message types not listed in the whitelist keep all their fields
///     (safe default) — the table only targets the heavy/shared types.
final class TiebaProtoProjector {
  static let shared = TiebaProtoProjector()

  private let registry: TiebaProtoRegistry

  /// Message path → allowed field names. Keys are the exact full message paths
  /// used by `protoPost`'s responseType and the shared types nested inside.
  private let whitelists: [String: Set<String>] = [
    // ---- shared render types ----
    "tieba.ThreadInfo": [
      "id", "threadId", "title", "replyNum", "viewNum", "lastTimeInt", "lastTime",
      "createTime", "isTop", "isGood", "authorId", "forumId",
      "forumName", "media", "_abstract", "agreeNum", "agree", "shareNum",
      "isShareThread", "originThreadInfo", "author", "videoInfo", "firstPostId",
      "tabId", "tabName", "hotNum",
    ],
    "tieba.Post": [
      "id", "tid", "floor", "time", "timeEx", "authorId", "author", "content",
      "subPostNumber", "subPostList", "agree",
    ],
    "tieba.SubPost": ["pid", "subPostList"],
    "tieba.SubPostList": [
      "id", "content", "time", "authorId", "author", "agree", "location",
    ],
    "tieba.PbContent": [
      "type", "text", "link", "src", "bsize", "bigSrc", "cdnSrc", "bigCdnSrc",
      "originSrc", "c", "uid", "duringTime", "width", "height", "cdnSrcActive",
    ],
    "tieba.User": [
      "id", "name", "nameShow", "portrait", "levelId", "levelName",
      "sex", "gender", "intro", "fansNum", "concernNum", "postNum", "threadNum",
      "myLikeNum", "totalAgreeNum", "ipAddress", "ip", "tbAge", "isBawu",
      "tiebaUid", "hasConcerned", "bazhuGrade", "newGodData",
    ],
    "tieba.Media": ["type", "bigPic", "srcPic", "originPic", "width", "height"],
    "tieba.Abstract": ["type", "text", "link", "src"],
    "tieba.Agree": ["agreeNum", "hasAgree", "disagreeNum", "diffAgreeNum"],
    "tieba.Page": ["currentPage", "totalPage", "totalCount", "hasMore"],
    "tieba.Error": ["errorCode", "errorMsg", "userMsg"],
    "tieba.ForumInfo": [
      "id", "name", "avatar", "memberNum", "threadNum", "postNum", "slogan",
      "isLike", "userLevel", "levelName", "curScore", "levelupScore",
      "signInInfo", "goodClassify",
    ],
    "tieba.SimpleForum": ["id", "name", "avatar", "memberNum", "postNum"],
    "tieba.ForumSignInfo": ["userInfo"],
    "tieba.ForumSignUser": ["isSignIn", "contSignNum", "userSignRank", "signBonusPoint"],
    "tieba.ForumClassify": ["name", "id", "classId", "className"],
    "tieba.FrsTabInfo": [
      "tabId", "tabType", "tabName", "tabUrl", "tabGid", "tabTitle",
      "isGeneralTab", "tabCode", "isDefault",
    ],
    "tieba.frsPage.NavTabInfo": ["tab", "menu", "head"],
    "tieba.OriginThreadInfo": ["title", "content", "media", "fname"],
    "tieba.PostInfoList": ["threadId", "forumId", "title", "content", "replyNum", "forumName", "createTime"],
    "tieba.PostInfoContent": ["postContent", "postType"],
    "tieba.BazhuSign": ["desc"],
    "tieba.NewGodInfo": ["status", "fieldName"],
    "tieba.Anti": ["tbs"],
    "tieba.getDislikeList.ForumList": ["forumId", "forumName", "avatar", "memberCount", "postNum", "threadNum"],
    // ---- response data messages ----
    "tieba.hotThreadList.HotThreadListResponseData": ["topicList", "threadInfo", "hotThreadTabInfo"],
    "tieba.topicList.TopicListResponseData": ["topicBang", "topicManual", "mediaTopic", "tabList", "frsTabTopic", "topicList"],
    "tieba.pbPage.PbPageResponseData": ["thread", "postList", "userList", "page", "forum", "anti", "firstFloorPost"],
    "tieba.pbFloor.PbFloorResponseData": ["subpostList", "page", "thread", "forum"],
    "tieba.personalized.PersonalizedResponseData": ["threadList", "threadPersonalized"],
    "tieba.userLike.UserLikeResponseData": ["threadInfo", "pageTag", "hasMore", "requestUnix"],
    "tieba.generalTabList.GeneralTabListResponseData": ["generalList", "hasMore", "userList", "sortType"],
    "tieba.frsPage.FrsPageResponseData": ["forum", "page", "threadList", "userList", "anti", "navTabInfo"],
    "tieba.profile.ProfileResponseData": ["user"],
    "tieba.getUserInfo.GetUserInfoResponseData": ["user"],
    "tieba.userPost.UserPostResponseData": ["postList"],
    "tieba.searchSug.SearchSugResponseData": ["list", "forumList"],
    "tieba.getDislikeList.GetDislikeListResponseData": ["forumList", "hasMore", "curPage"],
    "tieba.getBawuInfo.GetBawuInfoResponseData": ["bawuTeamList"],
    "tieba.getMemberInfo.GetMemberInfoResponseData": ["memberInfo"],
    "tieba.forumRuleDetail.ForumRuleDetailResponseData": ["forumRule", "ruleHtml", "ruleText", "ruleTitle"],
    "tieba.getHistoryForum.GetHistoryForumResponseData": ["forumList"],
    "tieba.forumRecommend.ForumRecommendResponseData": ["likeForum"],
    // ---- small nested types used by bawu/member ----
    "tieba.BawuTeam": ["totalNum", "bawuTeamList"],
    "tieba.BawuRoleDes": ["roleName", "roleInfo"],
    "tieba.BawuRoleInfoPub": ["forumId", "userId", "roleId", "roleName", "portrait", "userLevel", "levelName", "userName", "nameShow"],
    "tieba.getMemberInfo.ForumMember": ["uid", "name", "portrait", "levelId", "levelName"],
    "tieba.forumRecommend.LikeForumRec": ["forumId", "forumName", "avatar", "memberCount", "threadCount", "isLike", "levelId"],
  ]

  /// Repeated-field length caps, keyed by message path → field name → max.
  /// Mirrors helpers' `rawSubPosts.slice(0, 3)` preview cap.
  private let caps: [String: [String: Int]] = [
    "tieba.SubPost": ["subPostList": 3],
  ]

  init(registry: TiebaProtoRegistry = .shared) {
    self.registry = registry
  }

  /// Prune `object` (decoded at `messagePath`) to the render whitelist.
  /// Unknown/unlisted message types are returned unchanged (safe default).
  func project(_ object: [String: Any], messagePath: String) -> [String: Any] {
    guard let message = try? registry.message(path: messagePath) else { return object }
    var fieldByName: [String: TiebaProtoField] = [:]
    for field in message.fields.values {
      fieldByName[field.name] = field
    }
    let whitelist = whitelists[messagePath]
    let capMap = caps[messagePath]

    var result: [String: Any] = [:]
    for (key, value) in object {
      if let whitelist = whitelist, !whitelist.contains(key) { continue }
      guard let field = fieldByName[key] else {
        // Should not happen (decoder only emits schema fields), keep value.
        result[key] = value
        continue
      }
      result[key] = projectedValue(value, field: field, messagePath: messagePath, cap: capMap?[key])
    }
    return result
  }

  /// Project a single value: recurse into message-typed fields, apply the
  /// length cap to capped repeated lists, and pass everything else through.
  private func projectedValue(
    _ value: Any,
    field: TiebaProtoField,
    messagePath: String,
    cap: Int?
  ) -> Any {
    guard let nested = try? registry.resolveMessage(typeName: field.type, currentPath: messagePath) else {
      return value
    }
    if field.repeated {
      guard let array = value as? [Any] else { return value }
      let projected = array.map { projectAny($0, messagePath: nested.path) }
      if let cap, projected.count > cap {
        return Array(projected.prefix(cap))
      }
      return projected
    }
    guard let dict = value as? [String: Any] else { return value }
    return project(dict, messagePath: nested.path)
  }

  private func projectAny(_ value: Any, messagePath: String) -> Any {
    guard let dict = value as? [String: Any] else { return value }
    return project(dict, messagePath: messagePath)
  }
}
