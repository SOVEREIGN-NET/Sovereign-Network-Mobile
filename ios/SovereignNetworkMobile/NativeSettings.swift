import Foundation
import React

/**
 * Native Settings Module
 * Bridges React Native with iOS Settings.app and Android SharedPreferences
 * Allows reading/writing developer settings from native settings
 */
@objc(NativeSettings)
class NativeSettings: NSObject {

  /**
   * Get value from UserDefaults (iOS native settings)
   */
  @objc
  func getString(_ key: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let defaults = UserDefaults.standard
    if let value = defaults.string(forKey: key) {
      resolve(value)
    } else {
      resolve(NSNull())
    }
  }

  /**
   * Set string value in UserDefaults (iOS native settings)
   */
  @objc
  func setString(_ key: String, value: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let defaults = UserDefaults.standard
    defaults.set(value, forKey: key)
    defaults.synchronize()
    resolve(true)
  }

  /**
   * Get boolean value from UserDefaults
   */
  @objc
  func getBoolean(_ key: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let defaults = UserDefaults.standard
    if defaults.object(forKey: key) != nil {
      resolve(defaults.bool(forKey: key))
    } else {
      resolve(NSNull())
    }
  }

  /**
   * Set boolean value in UserDefaults
   */
  @objc
  func setBoolean(_ key: String, value: Bool, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let defaults = UserDefaults.standard
    defaults.set(value, forKey: key)
    defaults.synchronize()
    resolve(true)
  }

  /**
   * Get all developer settings
   */
  @objc
  func getAllSettings(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let defaults = UserDefaults.standard
    let useMockData = defaults.bool(forKey: "useMockData") // Default is false if not set

    let settings: [String: Any] = [
      "useMockData": useMockData
    ]

    resolve(settings)
  }

  /**
   * Update multiple settings at once
   */
  @objc
  func updateSettings(_ settings: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let defaults = UserDefaults.standard

    for (key, value) in settings {
      if let boolValue = value as? Bool {
        defaults.set(boolValue, forKey: key)
      } else if let stringValue = value as? String {
        defaults.set(stringValue, forKey: key)
      }
    }

    defaults.synchronize()
    resolve(true)
  }

  /**
   * Clear all developer settings
   */
  @objc
  func clearSettings(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let defaults = UserDefaults.standard
    defaults.removeObject(forKey: "useMockData")
    defaults.synchronize()
    resolve(true)
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
