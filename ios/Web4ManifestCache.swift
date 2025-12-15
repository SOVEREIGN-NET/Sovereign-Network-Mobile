import Foundation

final class Web4ManifestCache {
  private var cache: [String: (manifestCid: String, manifest: Web4Manifest)] = [:]
  private let lock = NSLock()

  func get(domain: String) -> (String, Web4Manifest)? {
    lock.lock(); defer { lock.unlock() }
    return cache[domain]
  }

  func put(domain: String, manifestCid: String, manifest: Web4Manifest) {
    lock.lock(); defer { lock.unlock() }
    cache[domain] = (manifestCid, manifest)
  }
}
