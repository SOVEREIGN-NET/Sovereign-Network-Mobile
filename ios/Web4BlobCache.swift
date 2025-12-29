import Foundation
import CommonCrypto

final class Web4BlobCache {
  private let cacheDir: URL
  private let maxBytes: Int64
  private let fileManager = FileManager.default
  private let lock = NSLock()

  init(baseDir: URL, maxBytes: Int64 = 150 * 1024 * 1024) {
    self.cacheDir = baseDir
    self.maxBytes = maxBytes
    try? fileManager.createDirectory(at: cacheDir, withIntermediateDirectories: true)
  }

  func get(cid: String) -> URL? {
    let file = fileURL(for: cid)
    guard fileManager.fileExists(atPath: file.path) else { return nil }
    updateAccessTime(url: file)
    return file
  }

  func put(cid: String, data: Data) -> URL? {
    lock.lock()
    defer { lock.unlock() }
    let url = fileURL(for: cid)
    do {
      try data.write(to: url, options: .atomic)
      updateAccessTime(url: url)
      enforceLimit()
      return url
    } catch {
      return nil
    }
  }

  private func enforceLimit() {
    var total: Int64 = 0
    let files = (try? fileManager.contentsOfDirectory(at: cacheDir, includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey])) ?? []
    for file in files {
      let size = (try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize.map(Int64.init)) ?? 0
      total += size
    }
    if total <= maxBytes { return }
    let sorted = files.sorted {
      let a = (try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date.distantPast
      let b = (try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date.distantPast
      return a < b
    }
    var remaining = total
    for file in sorted {
      if remaining <= maxBytes { break }
      let size = (try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize.map(Int64.init)) ?? 0
      try? fileManager.removeItem(at: file)
      remaining -= size
    }
  }

  private func updateAccessTime(url: URL) {
    try? fileManager.setAttributes([.modificationDate: Date()], ofItemAtPath: url.path)
  }

  private func fileURL(for cid: String) -> URL {
    let name = sha1(cid) + ".blob"
    return cacheDir.appendingPathComponent(name)
  }

  private func sha1(_ string: String) -> String {
    let data = Data(string.utf8)
    var digest = [UInt8](repeating: 0, count: Int(CC_SHA1_DIGEST_LENGTH))
    data.withUnsafeBytes {
      _ = CC_SHA1($0.baseAddress, CC_LONG(data.count), &digest)
    }
    return digest.map { String(format: "%02x", $0) }.joined()
  }
}
