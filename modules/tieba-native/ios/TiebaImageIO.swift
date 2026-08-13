import Foundation
import ImageIO
import UIKit

enum TiebaImageIOError: LocalizedError {
  case invalidSource
  case downloadFailed
  case decodeFailed
  case encodeFailed
  case writeFailed
  case watermarkFailed

  var errorDescription: String? {
    switch self {
    case .invalidSource:
      return "Invalid image source"
    case .downloadFailed:
      return "Image download failed"
    case .decodeFailed:
      return "Image decode failed"
    case .encodeFailed:
      return "Image thumbnail encode failed"
    case .writeFailed:
      return "Image thumbnail write failed"
    case .watermarkFailed:
      return "Image watermark render failed"
    }
  }
}

final class TiebaImageIO {
  static let shared = TiebaImageIO()

  private let fileManager = FileManager.default
  private let cacheDirectory: URL
  // In-memory decoded thumbnail cache: ~200 entries or ~50MB, whichever first.
  private let memoryCache = NSCache<NSString, NSData>()
  // Disk budget cap (~200MB). Exceeding it evicts least-recently-used files.
  private let diskLimitBytes: Int64 = 200 * 1024 * 1024
  private let evictionLock = NSLock()
  // Bump when the on-disk key encoding changes: files written under the old
  // scheme can never be found again, so purge them once on launch instead of
  // letting up to ~200MB of orphans wait for LRU eviction.
  private let cacheVersion = 2
  private let cacheVersionKey = "TiebaImageIO.cacheVersion"

  private init() {
    let base = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
      ?? fileManager.temporaryDirectory
    cacheDirectory = base.appendingPathComponent("TiebaImageIO", isDirectory: true)
    try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    memoryCache.countLimit = 200
    memoryCache.totalCostLimit = 50 * 1024 * 1024
    purgeIfKeyEncodingChanged()
  }

  func makeThumbnail(
    sourceUri: String,
    width: Double,
    height: Double,
    cacheKey: String,
    referer: String?,
    targetWidth: Double? = nil
  ) async throws -> String {
    let baseKey = cacheKey.isEmpty
      ? UUID().uuidString
      : makeSafeCacheKey(cacheKey)
    // Different target widths produce different files; suffix the key so a
    // list thumbnail and a full image never collide. nil keeps legacy names.
    let suffix = targetWidth.map { $0 > 0 ? "-w\(Int($0))" : "" } ?? ""
    let safeKey = "\(baseKey)\(suffix)"
    let destination = cacheDirectory.appendingPathComponent("\(safeKey).jpg")

    // 1) Memory cache: avoids a disk read entirely on hot list scrolls.
    if let cached = memoryCache.object(forKey: safeKey as NSString) {
      let data = cached as Data
      if !fileManager.fileExists(atPath: destination.path) {
        try? data.write(to: destination, options: .atomic)
      }
      touch(destination)
      return destination.absoluteString
    }

    // 2) Disk cache: reload into memory for subsequent fast hits.
    if fileManager.fileExists(atPath: destination.path) {
      if let diskData = try? Data(contentsOf: destination) {
        memoryCache.setObject(diskData as NSData, forKey: safeKey as NSString, cost: diskData.count)
      }
      touch(destination)
      return destination.absoluteString
    }

    // 3) Miss: download / decode / encode / persist.
    let imageData: Data
    if sourceUri.hasPrefix("file://"), let localUrl = URL(string: sourceUri) {
      guard let data = try? Data(contentsOf: localUrl) else {
        throw TiebaImageIOError.invalidSource
      }
      imageData = data
    } else if let remoteUrl = URL(string: sourceUri) {
      imageData = try await download(remoteUrl, referer: referer)
    } else {
      throw TiebaImageIOError.invalidSource
    }

    guard let source = CGImageSourceCreateWithData(imageData as CFData, nil) else {
      throw TiebaImageIOError.decodeFailed
    }
    let maxPixel: Double
    if let targetWidth, targetWidth > 0 {
      maxPixel = targetWidth
    } else {
      maxPixel = max(width, height)
    }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: maxPixel
    ]
    guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
      throw TiebaImageIOError.decodeFailed
    }

    let image = UIImage(cgImage: thumbnail)
    guard let jpeg = image.jpegData(compressionQuality: 0.85) else {
      throw TiebaImageIOError.encodeFailed
    }
    try writeAtomically(jpeg, to: destination)
    memoryCache.setObject(jpeg as NSData, forKey: safeKey as NSString, cost: jpeg.count)
    touch(destination)
    enforceDiskLimit()
    return destination.absoluteString
  }

  func clearCache() throws {
    memoryCache.removeAllObjects()
    let contents = try fileManager.contentsOfDirectory(at: cacheDirectory, includingPropertiesForKeys: nil)
    for url in contents {
      try? fileManager.removeItem(at: url)
    }
  }

  /// Filesystem-safe, collision-free cache key derived from the raw cacheKey.
  ///
  /// The previous scheme collapsed every non-alphanumeric character into "-",
  /// which is NOT injective: "https://x.com/a-b" and "https://x.com/a/b" both
  /// sanitize to "https---x-com-a-b" (the split segments are identical, so a
  /// per-segment length prefix alone would not help either), and the two
  /// thumbnails overwrote each other in memory and on disk. We keep the
  /// readable sanitized prefix for debuggability and append a stable 64-bit
  /// digest of the ORIGINAL key so two distinct keys can no longer collide.
  /// The digest is only used for namespace disambiguation, not security.
  private func makeSafeCacheKey(_ cacheKey: String) -> String {
    let readable = cacheKey.components(separatedBy: CharacterSet.alphanumerics.inverted)
      .joined(separator: "-")
    return "\(readable)-\(stableDigest64(cacheKey))"
  }

  /// djb2 variant (64-bit) over the Unicode scalars of the input. Pure
  /// integer arithmetic, so the value is deterministic across launches and
  /// platforms; URLs that differ only in separator characters always produce
  /// different digests.
  private func stableDigest64(_ input: String) -> String {
    var hash: UInt64 = 5381
    for scalar in input.unicodeScalars {
      hash = (hash &* 33) &+ UInt64(scalar.value)
    }
    return String(hash, radix: 16)
  }

  /// One-shot migration: when the cache-key encoding version changes, drop
  /// every file written by the previous encoding. Old keys can never be
  /// resolved again, so leaving them would only waste the disk budget.
  private func purgeIfKeyEncodingChanged() {
    let defaults = UserDefaults.standard
    guard defaults.integer(forKey: cacheVersionKey) != cacheVersion else { return }
    if let contents = try? fileManager.contentsOfDirectory(at: cacheDirectory, includingPropertiesForKeys: nil) {
      for url in contents {
        try? fileManager.removeItem(at: url)
      }
    }
    defaults.set(cacheVersion, forKey: cacheVersionKey)
  }

  // Bump the file mtime on every hit so eviction naturally picks the oldest.
  private func touch(_ url: URL) {
    try? fileManager.setAttributes(
      [.modificationDate: Date()],
      ofItemAtPath: url.path
    )
  }

  // Simple LRU sweep: when the directory exceeds the disk budget, delete the
  // least-recently-used files until back under it. Runs on the calling
  // (background) queue after a write.
  private func enforceDiskLimit() {
    evictionLock.lock()
    defer { evictionLock.unlock() }
    do {
      let contents = try fileManager.contentsOfDirectory(
        at: cacheDirectory,
        includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey]
      )
      let total = contents.reduce(Int64(0)) { $0 + fileSize(of: $1) }
      guard total > diskLimitBytes else { return }

      let sorted = contents.sorted { modificationDate(of: $0) < modificationDate(of: $1) }
      var freed: Int64 = 0
      for url in sorted {
        guard total - freed > diskLimitBytes else { break }
        let size = fileSize(of: url)
        if (try? fileManager.removeItem(at: url)) != nil {
          freed += size
          // 内存缓存键是 safeKey（无 .jpg 扩展名），这里须去掉扩展名才能命中；
          // 否则被淘汰文件对应的解码数据仍驻留 NSCache，内存不释放。
          memoryCache.removeObject(forKey: url.deletingPathExtension().lastPathComponent as NSString)
        }
      }
    } catch {}
  }

  private func fileSize(of url: URL) -> Int64 {
    Int64((try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0)
  }

  private func modificationDate(of url: URL) -> Date {
    (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
  }

  private func writeAtomically(_ data: Data, to url: URL) throws {
    do {
      try data.write(to: url, options: .atomic)
    } catch {
      throw TiebaImageIOError.writeFailed
    }
  }

  func applyWatermark(sourceUri: String, text: String) async throws -> String {
    guard let url = URL(string: sourceUri), let data = try? Data(contentsOf: url) else {
      throw TiebaImageIOError.invalidSource
    }
    guard let image = UIImage(data: data) else {
      throw TiebaImageIOError.decodeFailed
    }

    let renderer = UIGraphicsImageRenderer(size: image.size)
    let watermarked = renderer.image { context in
      image.draw(in: CGRect(origin: .zero, size: image.size))
      guard !text.isEmpty else { return }

      let fontSize = max(13, min(22, image.size.width * 0.035))
      let paragraph = NSMutableParagraphStyle()
      paragraph.alignment = .right
      let shadow = NSShadow()
      shadow.shadowColor = UIColor.black.withAlphaComponent(0.6)
      shadow.shadowOffset = CGSize(width: 0, height: 1)
      shadow.shadowBlurRadius = 2
      let attributes: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: fontSize, weight: .semibold),
        .foregroundColor: UIColor.white.withAlphaComponent(0.9),
        .paragraphStyle: paragraph,
        .shadow: shadow,
      ]
      let nsText = text as NSString
      let textSize = nsText.size(withAttributes: attributes)
      let margin: CGFloat = 12
      let rect = CGRect(
        x: max(margin, image.size.width - textSize.width - margin),
        y: max(margin, image.size.height - textSize.height - margin),
        width: min(textSize.width, image.size.width - margin * 2),
        height: textSize.height
      )
      nsText.draw(in: rect, withAttributes: attributes)
    }

    guard let jpeg = watermarked.jpegData(compressionQuality: 0.92) else {
      throw TiebaImageIOError.encodeFailed
    }
    let destination = cacheDirectory.appendingPathComponent("watermark-\(UUID().uuidString).jpg")
    try writeAtomically(jpeg, to: destination)
    return destination.absoluteString
  }

  private func download(_ url: URL, referer: String?) async throws -> Data {
    var request = URLRequest(url: url)
    request.timeoutInterval = 30
    if let referer, !referer.isEmpty {
      request.setValue(referer, forHTTPHeaderField: "Referer")
    }
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw TiebaImageIOError.downloadFailed
    }
    return data
  }
}
