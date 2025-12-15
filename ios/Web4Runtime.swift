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
      print("[Web4Runtime] Using cached manifest for \(domain), files: \(cached.files.count)")
      return cached
    }
    let resolve = try await client.resolveDomain(domain: domain)
    print("[Web4Runtime] Resolved domain \(domain) -> manifest_cid: \(resolve.manifest_cid)")
    let manifest = try await client.fetchManifest(manifestCid: resolve.manifest_cid)
    print("[Web4Runtime] Fetched manifest, files count: \(manifest.files.count)")
    for file in manifest.files {
      print("[Web4Runtime]   file: path=\(file.path), cid=\(file.cid), mime=\(file.mime)")
    }
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
    let normalizedPath = (path == "/" || path.isEmpty) ? "/index.html" : path
    print("[Web4Runtime] resolveFile: path=\(path) -> normalizedPath=\(normalizedPath)")
    print("[Web4Runtime] resolveFile: manifest has \(manifest.files.count) files")

    // Try exact match first, then fallback to /index.html for SPA behavior
    let fileEntry = manifest.files.first { $0.path == normalizedPath }
      ?? manifest.files.first { $0.path == "/index.html" }

    guard let entry = fileEntry else {
      print("[Web4Runtime] resolveFile: no file found for \(normalizedPath) or /index.html")
      throw NSError(domain: "Web4Runtime", code: 404, userInfo: [NSLocalizedDescriptionKey: "Not found: \(path)"])
    }
    print("[Web4Runtime] resolveFile: found entry cid=\(entry.cid), mime=\(entry.mime)")

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