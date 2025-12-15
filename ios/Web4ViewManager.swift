import Foundation
import React

@objc(Web4ViewManager)
@available(iOS 15.0, *)
final class Web4ViewManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func view() -> UIView! {
    return Web4View()
  }
}
