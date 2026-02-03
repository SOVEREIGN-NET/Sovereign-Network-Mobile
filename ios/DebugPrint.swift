import Foundation

// Centralized logging control for native iOS code.
// Default: only errors. Enable verbose in DEBUG by setting:
// UserDefaults.standard.set(true, forKey: "zhtp_verbose_logs")

enum ZhtpLog {
  static var verboseEnabled: Bool {
#if DEBUG
    return UserDefaults.standard.bool(forKey: "zhtp_verbose_logs")
#else
    return false
#endif
  }

  static func shouldLog(_ message: String) -> Bool {
    if verboseEnabled { return true }
    let lower = message.lowercased()
    return lower.contains("error") || lower.contains("failed") || message.contains("❌")
  }
}

// Override Swift.print within this module to honor log level.
public func print(_ items: Any..., separator: String = " ", terminator: String = "\n") {
  let message = items.map { String(describing: $0) }.joined(separator: separator)
  if ZhtpLog.shouldLog(message) {
    Swift.print(message, terminator: terminator)
  }
}
