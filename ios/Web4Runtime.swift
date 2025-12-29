import Foundation

@available(iOS 15.0, *)
final class Web4Runtime {
  private let manifestCache = Web4ManifestCache()
  private let blobCache: Web4BlobCache
  private let client: Web4Client

  init(cacheDir: URL, cacheLimitBytes: Int64, client: Web4Client) {
    self.blobCache = Web4BlobCache(baseDir: cacheDir, maxBytes: cacheLimitBytes)
    self.client = client
  }

  func resolveManifest(domain: String) async throws -> Web4Manifest {
    if let cached = manifestCache.get(domain: domain)?.1 {
      return cached
    }

    let resolve = try await client.resolveDomain(domain: domain)
    let manifest = try await client.fetchManifest(manifestCid: resolve.manifest_cid)

    let hydrated = Web4Manifest(
      domain: manifest.domain,
      version: manifest.version,
      previous_manifest: manifest.previous_manifest,
      spa: resolve.spa,
      spa_fallback: resolve.spa_fallback,
      files: manifest.files
    )
    manifestCache.put(domain: domain, manifestCid: resolve.manifest_cid, manifest: hydrated)
    return hydrated
  }

  func resolveFile(domain: String, path: String) async throws -> (mime: String, url: URL) {
    let manifest = try await resolveManifest(domain: domain)

    // Normalize path: "/" -> "/index.html"
    var normalizedPath = (path == "/" || path.isEmpty) ? "/index.html" : path

    // Try exact match first
    var fileEntry = manifest.files.first { $0.path == normalizedPath }

    // If not found and path starts with /, try without leading slash (manifest may not include it)
    if fileEntry == nil && normalizedPath.hasPrefix("/") {
      let pathWithoutSlash = String(normalizedPath.dropFirst())
      fileEntry = manifest.files.first { $0.path == pathWithoutSlash }
    }

    // Fallback to /index.html or index.html for SPA behavior
    if fileEntry == nil {
      fileEntry = manifest.files.first { $0.path == "/index.html" }
        ?? manifest.files.first { $0.path == "index.html" }
    }

    guard let entry = fileEntry else {
      throw NSError(domain: "Web4Runtime", code: 404, userInfo: [NSLocalizedDescriptionKey: "Not found: \(path)"])
    }

    if let cached = blobCache.get(cid: entry.cid) {
      return (entry.mime, cached)
    }

    let data = try await client.fetchBlob(cid: entry.cid)
    guard let file = blobCache.put(cid: entry.cid, data: data) else {
      throw NSError(domain: "Web4Runtime", code: -10, userInfo: [NSLocalizedDescriptionKey: "Cache write failed"])
    }
    return (entry.mime, file)
  }
}