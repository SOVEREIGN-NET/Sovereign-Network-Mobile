import Foundation

struct Web4ManifestFile: Decodable {
  let path: String
  let cid: String
  let mime: String
  let size: Int64

  private enum CodingKeys: String, CodingKey {
    case path
    case cid
    case mime
    case size
    case contentType = "content_type"
  }

  init(path: String, cid: String, mime: String, size: Int64) {
    self.path = path
    self.cid = cid
    self.mime = mime
    self.size = size
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    path = try container.decode(String.self, forKey: .path)
    cid = try container.decode(String.self, forKey: .cid)
    let decodedMime = try container.decodeIfPresent(String.self, forKey: .mime)
      ?? container.decodeIfPresent(String.self, forKey: .contentType)
    mime = decodedMime ?? "application/octet-stream"
    size = try container.decodeIfPresent(Int64.self, forKey: .size) ?? 0
  }
}

struct Web4Manifest: Decodable {
  let domain: String?
  let version: String?
  let previous_manifest: String?
  let spa: Bool?
  let spa_fallback: String?
  let files: [Web4ManifestFile]

  private enum CodingKeys: String, CodingKey {
    case domain
    case version
    case previous_manifest
    case spa
    case spa_fallback
    case files
  }

  private struct ManifestFileRecord: Decodable {
    let cid: String
    let mime: String?
    let content_type: String?
    let size: Int64?
  }

  init(
    domain: String?,
    version: String?,
    previous_manifest: String?,
    spa: Bool?,
    spa_fallback: String?,
    files: [Web4ManifestFile]
  ) {
    self.domain = domain
    self.version = version
    self.previous_manifest = previous_manifest
    self.spa = spa
    self.spa_fallback = spa_fallback
    self.files = files
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    domain = try container.decodeIfPresent(String.self, forKey: .domain)

    // Handle version as either String or Int64
    if let versionInt = try container.decodeIfPresent(Int64.self, forKey: .version) {
      version = String(versionInt)
    } else {
      version = try container.decodeIfPresent(String.self, forKey: .version)
    }

    previous_manifest = try container.decodeIfPresent(String.self, forKey: .previous_manifest)
    spa = try container.decodeIfPresent(Bool.self, forKey: .spa)
    spa_fallback = try container.decodeIfPresent(String.self, forKey: .spa_fallback)

    if let array = try? container.decode([Web4ManifestFile].self, forKey: .files) {
      files = array
    } else if let dict = try? container.decode([String: ManifestFileRecord].self, forKey: .files) {
      files = dict.map { path, value in
        Web4ManifestFile(
          path: path,
          cid: value.cid,
          mime: value.mime ?? value.content_type ?? "application/octet-stream",
          size: value.size ?? 0
        )
      }
    } else {
      files = []
    }
  }
}

struct Web4ResolveResponse: Decodable {
  let domain: String
  let manifest_cid: String?
  let version: String?
  let spa: Bool?
  let spa_fallback: String?

  private enum CodingKeys: String, CodingKey {
    case domain
    case web4_manifest_cid
    case manifest_cid
    case version
    case spa
    case spa_fallback
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    domain = try container.decode(String.self, forKey: .domain)

    // Try new field name first (web4_manifest_cid), then fall back to old name (manifest_cid)
    if let cid = try container.decodeIfPresent(String.self, forKey: .web4_manifest_cid) {
      manifest_cid = cid
    } else {
      manifest_cid = try container.decodeIfPresent(String.self, forKey: .manifest_cid)
    }

    // Handle version as either Int or String
    if let versionInt = try container.decodeIfPresent(Int64.self, forKey: .version) {
      version = String(versionInt)
    } else {
      version = try container.decodeIfPresent(String.self, forKey: .version)
    }

    spa = try container.decodeIfPresent(Bool.self, forKey: .spa)
    spa_fallback = try container.decodeIfPresent(String.self, forKey: .spa_fallback)
  }
}
