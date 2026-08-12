import Foundation

/// Prototype media downloader.
///
/// This layer intentionally does not handle cookies, signatures, or
/// authentication. The real network layer owns that logic; the prototype
/// only demonstrates URLSession download + FileManager caching and a
/// Referer header hook for Baidu media hosts.
public actor MediaDownloader {
    public static let shared = MediaDownloader()

    public enum DownloadError: LocalizedError {
        case invalidResponse

        public var errorDescription: String? {
            switch self {
            case .invalidResponse:
                return "The media server returned an invalid response."
            }
        }
    }

    private let session: URLSession
    private let fileManager: FileManager
    private let cacheDirectory: URL
    private let temporaryDirectory: URL

    public init(
        session: URLSession = .shared,
        fileManager: FileManager = .default
    ) {
        self.session = session
        self.fileManager = fileManager

        let base = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory
        cacheDirectory = base
            .appendingPathComponent("TiebaNativePrototype", isDirectory: true)
            .appendingPathComponent("Media", isDirectory: true)
        temporaryDirectory = base
            .appendingPathComponent("TiebaNativePrototype", isDirectory: true)
            .appendingPathComponent("Temp", isDirectory: true)

        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
        try? fileManager.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
    }

    public func cacheURL(for url: URL) -> URL {
        cacheDirectory.appendingPathComponent(fileName(for: url))
    }

    public func downloadMedia(from url: URL, referer: String? = nil) async throws -> URL {
        let destination = cacheURL(for: url)
        if fileManager.fileExists(atPath: destination.path) {
            return destination
        }

        let temporaryURL = try await downloadAndMove(from: url, referer: referer, to: destination)
        return temporaryURL
    }

    public func saveToTemporaryFile(from url: URL, referer: String? = nil) async throws -> URL {
        let destination = temporaryDirectory.appendingPathComponent(fileName(for: url))
        return try await downloadAndMove(from: url, referer: referer, to: destination)
    }

    public func clearCache() throws {
        let contents = try fileManager.contentsOfDirectory(
            at: cacheDirectory,
            includingPropertiesForKeys: nil
        )
        for url in contents {
            try fileManager.removeItem(at: url)
        }
    }

    private func downloadAndMove(
        from url: URL,
        referer: String?,
        to destination: URL
    ) async throws -> URL {
        let request = makeRequest(url: url, referer: referer)
        let (temporaryURL, response) = try await session.download(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200..<300).contains(httpResponse.statusCode) else {
            throw DownloadError.invalidResponse
        }

        try? fileManager.removeItem(at: destination)
        try fileManager.moveItem(at: temporaryURL, to: destination)
        return destination
    }

    private func makeRequest(url: URL, referer: String?) -> URLRequest {
        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        if let referer, !referer.isEmpty {
            request.setValue(referer, forHTTPHeaderField: "Referer")
        }
        return request
    }

    private func fileName(for url: URL) -> String {
        let ext = url.pathExtension.isEmpty ? "download" : url.pathExtension
        let base = url.lastPathComponent.isEmpty ? "media" : url.lastPathComponent
        let safeBase = base
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
        return "\(safeBase)-\(UUID().uuidString).\(ext)"
    }
}
