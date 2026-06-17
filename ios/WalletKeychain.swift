/**
 * WalletKeychain.swift
 * Secure storage for the master seed phrase in iOS Keychain
 * Each wallet seed (primary, ubs, savings) stored encrypted separately
 */

import Foundation
import Security

typealias RCTPromiseResolveBlock = (Any?) -> Void
typealias RCTPromiseRejectBlock = (String?, String?, Error?) -> Void

@objc(WalletKeychain)
class WalletKeychain: NSObject {
    private let keychainService = "com.sovereignnetwork.wallet.seeds"

    // MARK: - Keychain Storage

    /**
     * Store master seed phrase securely in Keychain
     * @param key - Unique key (e.g., "wallet_{identityId}_{walletType}")
     * @param value - 24-word seed phrase
     * @return true if successful
     */
    @objc(storeSecureString:value:withResolver:withRejecter:)
    func storeSecureString(
        _ key: String,
        value: String,
        withResolver resolve: @escaping RCTPromiseResolveBlock,
        withRejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            guard let data = value.data(using: .utf8) else {
                reject("ENCODE_ERROR", "Failed to encode seed phrase", nil)
                return
            }

            // Delete existing entry if present
            let deleteQuery: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: self.keychainService,
                kSecAttrAccount as String: key,
            ]
            SecItemDelete(deleteQuery as CFDictionary)

            // Add new entry
            let addQuery: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: self.keychainService,
                kSecAttrAccount as String: key,
                kSecValueData as String: data,
                kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            ]

            let status = SecItemAdd(addQuery as CFDictionary, nil)

            if status == errSecSuccess {
                print("[WalletKeychain] ✅ Stored seed phrase for key: \(key)")
                resolve(true)
            } else {
                print("[WalletKeychain] ❌ Failed to store seed: \(status)")
                reject("KEYCHAIN_ERROR", "Failed to store in Keychain: \(status)", nil)
            }
        }
    }

    /**
     * Retrieve master seed phrase from Keychain
     * @param key - Unique key (e.g., "wallet_{identityId}_{walletType}")
     * @return Seed phrase string or null if not found
     */
    @objc(getSecureString:withResolver:withRejecter:)
    func getSecureString(
        _ key: String,
        withResolver resolve: @escaping RCTPromiseResolveBlock,
        withRejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: self.keychainService,
                kSecAttrAccount as String: key,
                kSecReturnData as String: true,
            ]

            var result: AnyObject?
            let status = SecItemCopyMatching(query as CFDictionary, &result)

            if status == errSecSuccess, let data = result as? Data {
                if let seedPhrase = String(data: data, encoding: .utf8) {
                    print("[WalletKeychain] ✅ Retrieved seed phrase for key: \(key)")
                    resolve(seedPhrase)
                } else {
                    print("[WalletKeychain] ⚠️ Failed to decode seed phrase")
                    resolve(NSNull())
                }
            } else if status == errSecItemNotFound {
                print("[WalletKeychain] ⚠️ Seed phrase not found for key: \(key)")
                resolve(NSNull())
            } else {
                print("[WalletKeychain] ❌ Failed to retrieve seed: \(status)")
                reject("KEYCHAIN_ERROR", "Failed to retrieve from Keychain: \(status)", nil)
            }
        }
    }

    /**
     * Delete master seed phrase from Keychain
     * @param key - Unique key
     * @return true if successful or not found
     */
    @objc(deleteSecureString:withResolver:withRejecter:)
    func deleteSecureString(
        _ key: String,
        withResolver resolve: @escaping RCTPromiseResolveBlock,
        withRejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: self.keychainService,
                kSecAttrAccount as String: key,
            ]

            let status = SecItemDelete(query as CFDictionary)

            if status == errSecSuccess || status == errSecItemNotFound {
                print("[WalletKeychain] ✅ Deleted seed phrase for key: \(key)")
                resolve(true)
            } else {
                print("[WalletKeychain] ❌ Failed to delete seed: \(status)")
                reject("KEYCHAIN_ERROR", "Failed to delete from Keychain: \(status)", nil)
            }
        }
    }

    /**
     * Delete all wallet seeds for an identity
     * @param identityId - Identity to clean up
     * @return Number of entries deleted
     */
    @objc(deleteAllSeedsForIdentity:withResolver:withRejecter:)
    func deleteAllSeedsForIdentity(
        _ identityId: String,
        withResolver resolve: @escaping RCTPromiseResolveBlock,
        withRejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            let walletTypes = ["primary", "ubs", "savings"]
            var deletedCount = 0

            for walletType in walletTypes {
                let key = "wallet_\(identityId)_\(walletType)"
                let query: [String: Any] = [
                    kSecClass as String: kSecClassGenericPassword,
                    kSecAttrService as String: self.keychainService,
                    kSecAttrAccount as String: key,
                ]

                let status = SecItemDelete(query as CFDictionary)
                if status == errSecSuccess || status == errSecItemNotFound {
                    deletedCount += 1
                }
            }

            print("[WalletKeychain] ✅ Deleted \(deletedCount) wallet seeds for identity: \(identityId)")
            resolve(deletedCount)
        }
    }
}
