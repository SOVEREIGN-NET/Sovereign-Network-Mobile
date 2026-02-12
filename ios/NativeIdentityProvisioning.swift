import Foundation
import React
import CryptoKit

// MARK: - Generated Identity Structure (now uses lib-client)

class GeneratedIdentity {
    let did: String
    let publicKey: [UInt8]
    let privateKey: [UInt8]
    let kyberPublicKey: [UInt8]
    let kyberSecretKey: [UInt8]
    let nodeId: [UInt8]
    let deviceId: String
    let masterSeed: [UInt8]
    let createdAt: UInt64
    let timestamp: UInt64
    var libClientIdentity: Any?  // Store the original lib-client Identity for signing (type Any to avoid import issues)

    init(did: String, publicKey: [UInt8], privateKey: [UInt8], kyberPublicKey: [UInt8],
         kyberSecretKey: [UInt8], nodeId: [UInt8], deviceId: String, masterSeed: [UInt8],
         createdAt: UInt64, timestamp: UInt64, libClientIdentity: Any? = nil) {
        self.did = did
        self.publicKey = publicKey
        self.privateKey = privateKey
        self.kyberPublicKey = kyberPublicKey
        self.kyberSecretKey = kyberSecretKey
        self.nodeId = nodeId
        self.deviceId = deviceId
        self.masterSeed = masterSeed
        self.createdAt = createdAt
        self.timestamp = timestamp
        self.libClientIdentity = libClientIdentity
    }
}

// MARK: - React Native Module for UHP Identity Provisioning

/// Exposes device-based identity provisioning to JavaScript
/// All private keys stay on device - only public keys sent to server
@objc(NativeIdentityProvisioning)
class NativeIdentityProvisioning: NSObject {
    private let queue = DispatchQueue(label: "com.sovereignnetwork.identity-provisioning", qos: .userInitiated)
    private var cachedIdentities: [String: GeneratedIdentity] = [:]  // Cache for temporary storage

    // MARK: - Identity Generation

    /// Generate local identity with Dilithium5 + Kyber1024
    /// JavaScript API: await NativeIdentityProvisioning.generateLocalIdentity(displayName)
    @objc
    func generateLocalIdentity(
        _ displayName: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            guard self != nil else {
                reject("IDENTITY_ERROR", "Module deallocated", nil)
                return
            }

            print("[NativeIdentityProvisioning] Generating identity for: \(displayName)")

            let result = self?.performGenerateLocalIdentity(displayName: displayName) ?? .failure(NSError(domain: "NativeIdentityProvisioning", code: -1))

            switch result {
            case .success(let identity):
                print("[NativeIdentityProvisioning] ✅ Identity generated successfully")

                // Return only PUBLIC information to JavaScript
                // Private keys are stored in Keychain only
                resolve([
                    "did": identity.did,
                    "deviceId": identity.deviceId,
                    "timestamp": identity.createdAt,
                    "publicKeySize": identity.publicKey.count,
                    "kyberPublicKeySize": identity.kyberPublicKey.count,
                    "nodeIdSize": identity.nodeId.count,
                    // For display/backup only - user should write this down
                    "masterSeedHex": identity.masterSeed.map { String(format: "%02x", $0) }.joined()
                ])

            case .failure(let error):
                print("[NativeIdentityProvisioning] ❌ Generation failed: \(error)")
                reject("IDENTITY_ERROR", "Identity generation failed: \(error)", nil)
            }
        }
    }


    /// Generate identity locally - TypeScript handles server registration via QUIC
    /// JavaScript API: await NativeIdentityProvisioning.provisionIdentity(displayName)
    @objc
    func provisionIdentity(
        _ displayName: String,
        serverUrl: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            guard self != nil else {
                reject("IDENTITY_ERROR", "Module deallocated", nil)
                return
            }

            print("[NativeIdentityProvisioning] 🚀 Starting identity generation for: \(displayName)")

            // Step 1: Generate identity locally
            let generateResult = self?.performGenerateLocalIdentity(displayName: displayName) ?? .failure(NSError(domain: "NativeIdentityProvisioning", code: -1))
            guard case .success(let identity) = generateResult else {
                print("[NativeIdentityProvisioning] ❌ Generation failed")
                reject("IDENTITY_ERROR", "Failed to generate identity", nil)
                return
            }

            print("[NativeIdentityProvisioning] ✅ Identity generated:")
            print("[NativeIdentityProvisioning]    DID: \(identity.did)")
            print("[NativeIdentityProvisioning]    Device: \(identity.deviceId)")

            // Cache identity for use by other methods
            self?.cachedIdentities[identity.did] = identity

            // Store lib-client Identity in handle store to keep it alive for signing operations
            if let libIdentity = identity.libClientIdentity {
                do {
                    try IdentityHandleStore.shared.store(identity: libIdentity)
                    print("[NativeIdentityProvisioning]    ✅ Identity stored in handle store")
                } catch {
                    print("[NativeIdentityProvisioning]    ⚠️ Failed to store identity in handle store: \(error)")
                }
            }

            // Return generated identity - TypeScript will handle server registration via QUIC
            // Private keys stay in Rust lib-client; persistent storage happens in storeProvisionedIdentity()
            resolve([
                "status": "generated",
                "did": identity.did,
                "deviceId": identity.deviceId,
                "publicDilithium": Data(identity.publicKey).base64EncodedString(),
                "publicKyber": Data(identity.kyberPublicKey).base64EncodedString(),
                "timestamp": identity.createdAt,
                "masterSeedHex": identity.masterSeed.map { String(format: "%02x", $0) }.joined()
            ])
        }
    }

    /// Create registration proof for QUIC POST to server
    /// Called by TypeScript to get signature data for server registration
    /// JavaScript API: await NativeIdentityProvisioning.createRegistrationProof(displayName, didData)
    @objc
    func createRegistrationProof(
        _ displayName: String,
        didData: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            guard self != nil else {
                reject("IDENTITY_ERROR", "Module deallocated", nil)
                return
            }

            print("[NativeIdentityProvisioning] 📝 Creating registration proof...")

            // Get the DID from didData
            guard let did = didData["did"] as? String else {
                reject("IDENTITY_ERROR", "Missing DID in didData", nil)
                return
            }

            // Retrieve cached identity
            guard let identity = self?.cachedIdentities[did] else {
                reject("IDENTITY_ERROR", "Identity not found - call provisionIdentity first", nil)
                return
            }

            do {
                let timestamp = UInt64(Date().timeIntervalSince1970)

                // Create registration proof using lib-client (Rust pqcrypto-dilithium)
                // This is compatible with server verification unlike liboqs
                guard let libIdentity = identity.libClientIdentity else {
                    reject("IDENTITY_ERROR", "lib-client Identity not available", nil)
                    return
                }

                let signature = try ZhtpClient.signRegistrationProof(
                    identity: libIdentity as! Identity,
                    timestamp: timestamp
                )

                print("[NativeIdentityProvisioning] ✅ Registration proof signed")
                print("[NativeIdentityProvisioning]    Signature length: \(signature.count) bytes")
                print("[NativeIdentityProvisioning]    Signature (hex): \(signature.map { String(format: "%02x", $0) }.joined())")
                print("[NativeIdentityProvisioning]    DID: \(identity.did)")
                print("[NativeIdentityProvisioning]    Timestamp: \(timestamp)")

                // Return proof data for TypeScript to send via QUIC
                resolve([
                    "did": identity.did,
                    "public_key": Data(identity.publicKey).base64EncodedString(),
                    "kyber_public_key": Data(identity.kyberPublicKey).base64EncodedString(),
                    "node_id": Data(identity.nodeId).base64EncodedString(),
                    "device_id": identity.deviceId,
                    "display_name": displayName,
                    "identity_type": "human",
                    "registration_proof": Data(signature).base64EncodedString(),
                    "timestamp": timestamp
                ])
            } catch {
                print("[NativeIdentityProvisioning] ❌ Proof creation failed: \(error)")
                reject("IDENTITY_ERROR", "Failed to create proof: \(error)", nil)
            }
        }
    }

    /// Store provisioned identity in Keychain after server registration
    /// Called by TypeScript after successful server registration
    /// JavaScript API: await NativeIdentityProvisioning.storeProvisionedIdentity(identityId, didData)
    @objc
    func storeProvisionedIdentity(
        _ identityId: String,
        didData: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            guard self != nil else {
                reject("IDENTITY_ERROR", "Module deallocated", nil)
                return
            }

            print("[NativeIdentityProvisioning] 📦 Storing provisioned identity in Keychain and Documents...")
            print("[NativeIdentityProvisioning] 📦 Identity ID: \(identityId)")

            do {
                let did = didData["did"] as? String ?? ""
                print("[NativeIdentityProvisioning] 📦 Looking for cached identity: \(did)")
                print("[NativeIdentityProvisioning] 📦 Total cached identities available: \(self?.cachedIdentities.count ?? 0)")

                // Try to retrieve from memory cache first
                var generatedIdentity = self?.cachedIdentities[did]

                if generatedIdentity != nil {
                    print("[NativeIdentityProvisioning] ✅ Identity found in memory cache")
                } else {
                    print("[NativeIdentityProvisioning] ⚠️ Identity NOT in memory cache")
                    print("[NativeIdentityProvisioning]    Cache keys available: \(self?.cachedIdentities.keys.joined(separator: ", ") ?? "EMPTY")")
                }

                guard let identity = generatedIdentity else {
                    throw NSError(domain: "IdentityProvisioning", code: -3, userInfo: [NSLocalizedDescriptionKey: "Cached identity not found"])
                }

                // Store lib-client Identity in handle store (in-memory, for signing)
                // and serialize to Keychain (persistent, for restore on app launch)
                // Private keys stay in Rust — this matches Android's EncryptedSharedPreferences model
                guard let libIdentity = identity.libClientIdentity else {
                    throw NSError(domain: "IdentityProvisioning", code: -4, userInfo: [NSLocalizedDescriptionKey: "lib-client Identity not available"])
                }

                try IdentityHandleStore.shared.store(identity: libIdentity, identityId: identityId)
                print("[NativeIdentityProvisioning]    ✅ Identity stored in handle store")

                let serializedJson = try ZhtpClient.serializeIdentity(libIdentity as! Identity)
                let serializedData = serializedJson.data(using: .utf8) ?? Data()

                let serializedKeychainQuery: [String: Any] = [
                    kSecClass as String: kSecClassGenericPassword,
                    kSecAttrService as String: "com.sovereign.zhtp",
                    kSecAttrAccount as String: "identity_serialized_\(identityId)",
                    kSecValueData as String: serializedData,
                    kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
                ]

                SecItemDelete(serializedKeychainQuery as CFDictionary)
                let status = SecItemAdd(serializedKeychainQuery as CFDictionary, nil)
                guard status == errSecSuccess else {
                    throw NSError(domain: "IdentityProvisioning", code: -5, userInfo: [NSLocalizedDescriptionKey: "Keychain storage failed: \(status)"])
                }
                print("[NativeIdentityProvisioning]    ✅ Serialized Identity stored in Keychain")

                print("[NativeIdentityProvisioning] ✅ Identity provisioned and stored!")
                resolve([
                    "status": "provisioned",
                    "identity_id": identityId
                ])
            } catch {
                print("[NativeIdentityProvisioning] ❌ Storage failed: \(error)")
                reject("STORAGE_ERROR", "Failed to store identity: \(error)", nil)
            }
        }
    }

    // MARK: - Master Seed Phrase (Backup/Recovery)

    /// Get 24-word master seed phrase for backup (derived locally from lib-client)
    /// JavaScript API: await NativeIdentityProvisioning.getSeedPhraseForBackup(did)
    @objc
    func getSeedPhraseForBackup(
        _ did: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            guard self != nil else {
                reject("IDENTITY_ERROR", "Module deallocated", nil)
                return
            }

            if let cached = self?.cachedIdentities[did], let libIdentity = cached.libClientIdentity as? Identity {
                do {
                    let phrase = try ZhtpClient.getSeedPhrase(libIdentity)
                    resolve(phrase)
                    return
                } catch {
                    reject("IDENTITY_ERROR", "Failed to get seed phrase: \(error)", nil)
                    return
                }
            }

            if let stored = IdentityHandleStore.shared.retrieve(by: did) as? Identity {
                do {
                    let phrase = try ZhtpClient.getSeedPhrase(stored)
                    resolve(phrase)
                    return
                } catch {
                    reject("IDENTITY_ERROR", "Failed to get seed phrase: \(error)", nil)
                    return
                }
            }

            reject("IDENTITY_ERROR", "Identity not found for seed phrase", nil)
        }
    }

    /// Restore identity from a 24-word master seed phrase
    /// JavaScript API: await NativeIdentityProvisioning.restoreIdentityFromPhrase(phrase)
    @objc
    func restoreIdentityFromPhrase(
        _ phrase: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            guard self != nil else {
                reject("IDENTITY_ERROR", "Module deallocated", nil)
                return
            }

            do {
                let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
                let identity = try ZhtpClient.restoreIdentityFromPhrase(phrase, deviceId: deviceId)

                let generatedIdentity = GeneratedIdentity(
                    did: identity.did,
                    publicKey: identity.publicKey,
                    privateKey: [],
                    kyberPublicKey: identity.kyberPublicKey,
                    kyberSecretKey: [],
                    nodeId: identity.nodeId,
                    deviceId: identity.deviceId,
                    masterSeed: [],
                    createdAt: identity.createdAt,
                    timestamp: UInt64(Date().timeIntervalSince1970),
                    libClientIdentity: identity
                )

                self?.cachedIdentities[identity.did] = generatedIdentity

                do {
                    try IdentityHandleStore.shared.store(identity: identity)
                } catch {
                    print("[NativeIdentityProvisioning] ⚠️ Failed to store restored identity in handle store: \(error)")
                }

                resolve([
                    "status": "restored",
                    "did": identity.did,
                    "deviceId": identity.deviceId,
                    "publicDilithium": Data(identity.publicKey).base64EncodedString(),
                    "publicKyber": Data(identity.kyberPublicKey).base64EncodedString(),
                    "createdAt": identity.createdAt,
                    "identityType": "human"
                ])
            } catch {
                reject("IDENTITY_ERROR", "Failed to restore identity from seed phrase: \(error)", nil)
            }
        }
    }

    // MARK: - Cleanup Functions

    /// Clean all identity data (Keychain + handle store + cached identities)
    /// JavaScript API: NativeIdentityProvisioning.cleanKeystoreDirectory()
    @objc
    func cleanKeystoreDirectory() {
        queue.async {
            // Clean all Keychain entries (identity_serialized_*, private_key_*, temp_identity_*, etc.)
            _ = UhpKeystore.deleteAllPrivateKeys()

            // Clear in-memory caches
            IdentityHandleStore.shared.clear()
            self.cachedIdentities.removeAll()
            print("[NativeIdentityProvisioning] ✅ All identity data cleaned")
        }
    }

    // MARK: - Helper Functions

    // MARK: - Private Implementation

    /// Generate local identity with Dilithium5 + Kyber1024
    /// Following spec Part 1.1
    private func performGenerateLocalIdentity(displayName: String) -> Result<GeneratedIdentity, Error> {
        do {
            print("[NativeIdentityProvisioning] 🚀 Generating identity using lib-client (Rust, same crypto as server)...")

            // Get device ID
            let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString

            // Use lib-client to generate identity with pqcrypto-dilithium (compatible with server)
            // This replaces liboqs which was incompatible
            let identity = try ZhtpClient.generateIdentity(deviceId: deviceId)

            print("[NativeIdentityProvisioning] ✅ Identity generated with lib-client")
            print("[NativeIdentityProvisioning]    DID: \(identity.did)")
            print("[NativeIdentityProvisioning]    Device ID: \(deviceId)")
            print("[NativeIdentityProvisioning]    Created at: \(identity.createdAt)")

            let timestamp = UInt64(Date().timeIntervalSince1970)
            let generatedIdentity = GeneratedIdentity(
                did: identity.did,
                publicKey: identity.publicKey,
                privateKey: [],  // Private keys stay in Rust, not exposed
                kyberPublicKey: identity.kyberPublicKey,
                kyberSecretKey: [],  // Private keys stay in Rust, not exposed
                nodeId: identity.nodeId,
                deviceId: identity.deviceId,
                masterSeed: [],  // Master seed stays in Rust, not exposed
                createdAt: identity.createdAt,
                timestamp: timestamp,
                libClientIdentity: identity
            )

            return .success(generatedIdentity)
        } catch {
            print("[NativeIdentityProvisioning] ❌ Identity generation failed: \(error)")
            return .failure(error)
        }
    }


    private func deriveBytes(_ seed: Data, _ context: String) -> Data {
        let combined = seed + (context.data(using: .utf8) ?? Data())
        let hash = SHA256.hash(data: combined)
        return Data(hash).prefix(32)
    }


    // MARK: - Identity Restoration (for app launch/login)

    /// Restore lib-client Identity from Keychain and populate handle store
    /// Called during login to ensure fresh Rust objects are available for handshakes
    /// JavaScript API: await NativeIdentityProvisioning.restoreIdentityToHandleStore(identityId)
    @objc
    func restoreIdentityToHandleStore(
        _ identityId: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            guard self != nil else {
                reject("IDENTITY_ERROR", "Module deallocated", nil)
                return
            }

            print("[NativeIdentityProvisioning] 🔄 Restoring Identity to handle store for ID: \(identityId)")

            // Load serialized Identity JSON from Keychain
            let keychainQuery: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: "com.sovereign.zhtp",
                kSecAttrAccount as String: "identity_serialized_\(identityId)",
                kSecReturnData as String: true
            ]

            var result: CFTypeRef?
            let status = SecItemCopyMatching(keychainQuery as CFDictionary, &result)

            guard status == errSecSuccess, let data = result as? Data else {
                print("[NativeIdentityProvisioning] ⚠️ Serialized Identity not found in Keychain: \(status)")
                print("[NativeIdentityProvisioning] 💡 This can happen if identity was provisioned before serialization feature was added")
                print("[NativeIdentityProvisioning] 📝 Skipping handle store restoration - UhpHandshake will use Keychain fallback")

                // Non-fatal: Return success with indication that restoration was skipped
                // UhpHandshake will fall back to Keychain-stored identity materials
                resolve([
                    "status": "skipped",
                    "identity_id": identityId,
                    "reason": "serialized_identity_not_found"
                ])
                return
            }

            guard let jsonString = String(data: data, encoding: .utf8) else {
                print("[NativeIdentityProvisioning] ⚠️ Failed to decode Identity JSON from Keychain data")
                resolve([
                    "status": "skipped",
                    "identity_id": identityId,
                    "reason": "json_decode_failed"
                ])
                return
            }

            do {
                // Deserialize the Identity
                let identity = try ZhtpClient.deserializeIdentity(jsonString)
                print("[NativeIdentityProvisioning] ✅ Deserialized Identity: \(identity.did)")

                // Store in handle store with identity_id for handshake lookups
                try IdentityHandleStore.shared.store(identity: identity, identityId: identityId)
                print("[NativeIdentityProvisioning] ✅ Identity restored to handle store")

                resolve([
                    "status": "restored",
                    "identity_id": identityId,
                    "did": identity.did
                ])
            } catch {
                print("[NativeIdentityProvisioning] ⚠️ Restoration failed: \(error)")
                print("[NativeIdentityProvisioning] 💡 UhpHandshake will use Keychain fallback")

                // Non-fatal: Return success with indication that restoration failed
                resolve([
                    "status": "skipped",
                    "identity_id": identityId,
                    "reason": "deserialization_failed",
                    "error": error.localizedDescription
                ])
            }
        }
    }

    // MARK: - Local Identity Lookup

    /// Check if an identity exists locally (handle store or Keychain)
    /// JavaScript API: await NativeIdentityProvisioning.getLocalIdentity(identityIdOrDid)
    @objc
    func getLocalIdentity(
        _ identityIdOrDid: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async {
            let trimmed = identityIdOrDid.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty {
                resolve([
                    "status": "missing",
                    "reason": "empty_identity_id"
                ])
                return
            }

            // Normalize: strip did:zhtp: prefix to get raw identity ID
            let identityId = trimmed.hasPrefix("did:zhtp:") ? String(trimmed.dropFirst(9)) : trimmed

            // 1. Handle store lookup (by full DID, then by raw identity ID)
            if let identity = IdentityHandleStore.shared.retrieve(by: trimmed) as? Identity {
                resolve([
                    "status": "found",
                    "identity_id": identityId,
                    "did": identity.did,
                    "device_id": identity.deviceId,
                    "created_at": NSNumber(value: identity.createdAt)
                ])
                return
            }

            if trimmed != identityId,
               let identity = IdentityHandleStore.shared.retrieve(by: identityId) as? Identity {
                resolve([
                    "status": "found",
                    "identity_id": identityId,
                    "did": identity.did,
                    "device_id": identity.deviceId,
                    "created_at": NSNumber(value: identity.createdAt)
                ])
                return
            }

            // 2. Auto-restore (getLatestIdentity reads from Keychain on cache miss)
            if let identity = IdentityHandleStore.shared.getLatestIdentity() as? Identity {
                let matchesDid = identity.did == trimmed
                let matchesId = identity.did.hasSuffix(identityId)
                if matchesDid || matchesId {
                    resolve([
                        "status": "found",
                        "identity_id": identityId,
                        "did": identity.did,
                        "device_id": identity.deviceId,
                        "created_at": NSNumber(value: identity.createdAt)
                    ])
                    return
                }
            }

            // 3. Direct Keychain lookup by identity ID
            let keychainQuery: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: "com.sovereign.zhtp",
                kSecAttrAccount as String: "identity_serialized_\(identityId)",
                kSecReturnData as String: true
            ]

            var result: CFTypeRef?
            let status = SecItemCopyMatching(keychainQuery as CFDictionary, &result)

            if status == errSecSuccess,
               let data = result as? Data,
               let jsonString = String(data: data, encoding: .utf8) {
                do {
                    let identity = try ZhtpClient.deserializeIdentity(jsonString)
                    // Cache in handle store for future lookups
                    try? IdentityHandleStore.shared.store(identity: identity, identityId: identityId)

                    resolve([
                        "status": "found",
                        "identity_id": identityId,
                        "did": identity.did,
                        "device_id": identity.deviceId,
                        "created_at": NSNumber(value: identity.createdAt)
                    ])
                    return
                } catch {
                    print("[NativeIdentityProvisioning] getLocalIdentity deserialization failed: \(error)")
                }
            }

            resolve([
                "status": "missing",
                "reason": "identity_materials_not_found"
            ])
        }
    }

    // MARK: - Token Transaction Signing

    /// Sign a token creation transaction with Dilithium keypair
    /// Private key remains in Keychain - never reaches JavaScript
    /// Returns hex-encoded signed transaction
    @objc
    func signTokenCreateTransaction(
        _ params: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            do {
                guard let name = params["name"] as? String,
                      let symbol = params["symbol"] as? String,
                      let decimals = params["decimals"] as? NSNumber else {
                    reject("INVALID_PARAMS", "Missing required token parameters", nil)
                    return
                }

                // Parse initialSupply - accept both String and NSNumber
                // String is preferred to preserve exact value without float precision loss
                var initialSupplyValue: UInt64 = 0
                if let supplyStr = params["initialSupply"] as? String {
                    guard let parsed = UInt64(supplyStr) else {
                        reject("INVALID_PARAMS", "initialSupply must be a valid integer string", nil)
                        return
                    }
                    initialSupplyValue = parsed
                } else if let supplyNum = params["initialSupply"] as? NSNumber {
                    initialSupplyValue = supplyNum.uint64Value
                } else {
                    reject("INVALID_PARAMS", "initialSupply is required (string or number)", nil)
                    return
                }

                // Parse maxSupply - accept both String, NSNumber, or nil
                var maxSupplyValue: UInt64? = nil
                if let maxStr = params["maxSupply"] as? String {
                    if !maxStr.isEmpty, let parsed = UInt64(maxStr) {
                        maxSupplyValue = parsed
                    }
                } else if let maxNum = params["maxSupply"] as? NSNumber {
                    maxSupplyValue = maxNum.uint64Value
                }

                print("[NativeIdentityProvisioning] Building signed token create transaction")
                print("[NativeIdentityProvisioning]   Name: \(name)")
                print("[NativeIdentityProvisioning]   Symbol: \(symbol)")
                print("[NativeIdentityProvisioning]   Supply: \(initialSupplyValue) (parsed from string)")

                // Get the current identity from handle store
                guard let identityAny = IdentityHandleStore.shared.getLatestIdentity(),
                      let identity = identityAny as? Identity else {
                    reject("NO_IDENTITY", "No active identity for signing", nil)
                    return
                }

                // Use lib-client FFI to build and sign the full transaction
                // FFI handles: bincode serialization, signing, Transaction wrapping, hex encoding
                let hexSignedTx = try ZhtpClient.buildTokenCreate(
                    name: name,
                    symbol: symbol,
                    initialSupply: initialSupplyValue,
                    decimals: decimals.uint8Value,
                    using: identity,
                    chainId: 0x02  // testnet
                )

                print("[NativeIdentityProvisioning] Token create transaction built and signed")
                print("[NativeIdentityProvisioning] Hex tx length: \(hexSignedTx.count)")
                print("[NativeIdentityProvisioning] DID: \(identity.did)")

                // Print full hex without emojis for easy copy-paste
                let chunkSize = 1000
                var offset = 0
                while offset < hexSignedTx.count {
                    let startIndex = hexSignedTx.index(hexSignedTx.startIndex, offsetBy: offset)
                    let endIndex = hexSignedTx.index(startIndex, offsetBy: min(chunkSize, hexSignedTx.count - offset), limitedBy: hexSignedTx.endIndex) ?? hexSignedTx.endIndex
                    let chunk = String(hexSignedTx[startIndex..<endIndex])
                    print(chunk)
                    offset += chunkSize
                }

                resolve(["signed_tx": hexSignedTx])

            } catch {
                print("[NativeIdentityProvisioning] ❌ Token signing failed: \(error)")
                reject("SIGNING_ERROR", "Failed to sign token transaction: \(error)", nil)
            }
        }
    }

    /// Sign a token mint transaction with Dilithium keypair
    @objc
    func signTokenMintTransaction(
        _ params: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            do {
                guard let tokenId = params["tokenId"] as? String,
                      let recipientDid = params["recipientDid"] as? String else {
                    reject("INVALID_PARAMS", "Missing required mint parameters", nil)
                    return
                }

                // Parse amount - accept both String and Number
                // String is preferred to preserve exact value without float precision loss
                var amountValue: UInt64 = 0
                if let amountStr = params["amount"] as? String {
                    guard let parsed = UInt64(amountStr) else {
                        reject("INVALID_PARAMS", "amount must be a valid integer string", nil)
                        return
                    }
                    amountValue = parsed
                } else if let amountNum = params["amount"] as? NSNumber {
                    amountValue = amountNum.uint64Value
                } else {
                    reject("INVALID_PARAMS", "amount must be a string or number", nil)
                    return
                }

                print("[NativeIdentityProvisioning] Building signed token mint transaction")
                print("[NativeIdentityProvisioning]   Token ID: \(tokenId)")
                print("[NativeIdentityProvisioning]   Amount: \(amountValue)")
                print("[NativeIdentityProvisioning]   Recipient: \(recipientDid)")

                guard let identityAny = IdentityHandleStore.shared.getLatestIdentity(),
                      let identity = identityAny as? Identity else {
                    reject("NO_IDENTITY", "No active identity for signing", nil)
                    return
                }

                // Parse token ID and recipient DID from hex strings
                guard let tokenIdData = Data(fromHexString: tokenId),
                      let recipientPubkey = Data(fromHexString: recipientDid) else {
                    reject("INVALID_PARAMS", "Invalid token ID or recipient DID format", nil)
                    return
                }

                // Use lib-client FFI to build and sign the full transaction
                let hexSignedTx = try ZhtpClient.buildTokenMint(
                    tokenId: tokenIdData,
                    toPublicKey: recipientPubkey,
                    amount: amountValue,
                    using: identity,
                    chainId: 0x02  // testnet
                )

                print("[NativeIdentityProvisioning] Token mint transaction built and signed")
                print("[NativeIdentityProvisioning] Hex tx length: \(hexSignedTx.count)")

                // Print full hex without emojis for easy copy-paste
                let chunkSize = 1000
                var offset = 0
                while offset < hexSignedTx.count {
                    let startIndex = hexSignedTx.index(hexSignedTx.startIndex, offsetBy: offset)
                    let endIndex = hexSignedTx.index(startIndex, offsetBy: min(chunkSize, hexSignedTx.count - offset), limitedBy: hexSignedTx.endIndex) ?? hexSignedTx.endIndex
                    let chunk = String(hexSignedTx[startIndex..<endIndex])
                    print(chunk)
                    offset += chunkSize
                }

                resolve(["signed_tx": hexSignedTx])

            } catch {
                print("[NativeIdentityProvisioning] ❌ Mint signing failed: \(error)")
                reject("SIGNING_ERROR", "Failed to sign mint transaction: \(error)", nil)
            }
        }
    }

    /// Sign a token transfer transaction with Dilithium keypair
    @objc
    func signTokenTransferTransaction(
        _ params: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            do {
                guard let tokenId = params["tokenId"] as? String,
                      let toAddress = params["toAddress"] as? String else {
                    reject("INVALID_PARAMS", "Missing required transfer parameters", nil)
                    return
                }

                // Parse amount - accept both String and Number
                // String is preferred to preserve exact value without float precision loss
                var amountValue: UInt64 = 0
                if let amountStr = params["amount"] as? String {
                    guard let parsed = UInt64(amountStr) else {
                        reject("INVALID_PARAMS", "amount must be a valid integer string", nil)
                        return
                    }
                    amountValue = parsed
                } else if let amountNum = params["amount"] as? NSNumber {
                    amountValue = amountNum.uint64Value
                } else {
                    reject("INVALID_PARAMS", "amount must be a string or number", nil)
                    return
                }

                print("[NativeIdentityProvisioning] Building signed token transfer transaction")
                print("[NativeIdentityProvisioning]   Token ID: \(tokenId)")
                print("[NativeIdentityProvisioning]   Amount: \(amountValue)")
                print("[NativeIdentityProvisioning]   To: \(toAddress)")

                guard let identityAny = IdentityHandleStore.shared.getLatestIdentity(),
                      let identity = identityAny as? Identity else {
                    reject("NO_IDENTITY", "No active identity for signing", nil)
                    return
                }

                // Parse token ID and recipient address from hex strings
                guard let tokenIdData = Data(fromHexString: tokenId),
                      let toPubkey = Data(fromHexString: toAddress) else {
                    reject("INVALID_PARAMS", "Invalid token ID or recipient address format", nil)
                    return
                }

                // Use lib-client FFI to build and sign the full transaction
                let hexSignedTx = try ZhtpClient.buildTokenTransfer(
                    tokenId: tokenIdData,
                    toPublicKey: toPubkey,
                    amount: amountValue,
                    using: identity,
                    chainId: 0x02  // testnet
                )

                print("[NativeIdentityProvisioning] Token transfer transaction built and signed")
                print("[NativeIdentityProvisioning] Hex tx length: \(hexSignedTx.count)")

                // Print full hex without emojis for easy copy-paste
                let chunkSize = 1000
                var offset = 0
                while offset < hexSignedTx.count {
                    let startIndex = hexSignedTx.index(hexSignedTx.startIndex, offsetBy: offset)
                    let endIndex = hexSignedTx.index(startIndex, offsetBy: min(chunkSize, hexSignedTx.count - offset), limitedBy: hexSignedTx.endIndex) ?? hexSignedTx.endIndex
                    let chunk = String(hexSignedTx[startIndex..<endIndex])
                    print(chunk)
                    offset += chunkSize
                }

                resolve(["signed_tx": hexSignedTx])

            } catch {
                print("[NativeIdentityProvisioning] ❌ Transfer signing failed: \(error)")
                reject("SIGNING_ERROR", "Failed to sign transfer transaction: \(error)", nil)
            }
        }
    }

    /// Sign a SOV wallet-to-wallet transfer transaction with Dilithium keypair
    /// Uses wallet IDs (32 bytes each) instead of token_id + pubkey
    @objc
    func signSovWalletTransferTransaction(
        _ params: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            do {
                guard let fromWalletIdHex = params["fromWalletId"] as? String,
                      let toWalletIdHex = params["toWalletId"] as? String else {
                    reject("INVALID_PARAMS", "Missing required SOV transfer parameters (fromWalletId, toWalletId)", nil)
                    return
                }

                // Parse amount - accept both String and Number
                var amountValue: UInt64 = 0
                if let amountStr = params["amount"] as? String {
                    guard let parsed = UInt64(amountStr) else {
                        reject("INVALID_PARAMS", "amount must be a valid integer string", nil)
                        return
                    }
                    amountValue = parsed
                } else if let amountNum = params["amount"] as? NSNumber {
                    amountValue = amountNum.uint64Value
                } else {
                    reject("INVALID_PARAMS", "amount must be a string or number", nil)
                    return
                }

                // Validate and decode wallet IDs (must be 64 hex chars = 32 bytes each)
                guard let fromWalletId = Data(fromHexString: fromWalletIdHex), fromWalletId.count == 32 else {
                    reject("INVALID_PARAMS", "fromWalletId must be 64 hex characters (32 bytes)", nil)
                    return
                }
                guard let toWalletId = Data(fromHexString: toWalletIdHex), toWalletId.count == 32 else {
                    reject("INVALID_PARAMS", "toWalletId must be 64 hex characters (32 bytes)", nil)
                    return
                }

                print("[NativeIdentityProvisioning] Building signed SOV wallet transfer transaction")
                print("[NativeIdentityProvisioning]   From: \(fromWalletIdHex)")
                print("[NativeIdentityProvisioning]   To: \(toWalletIdHex)")
                print("[NativeIdentityProvisioning]   Amount: \(amountValue)")

                guard let identityAny = IdentityHandleStore.shared.getLatestIdentity(),
                      let identity = identityAny as? Identity else {
                    reject("NO_IDENTITY", "No active identity for signing", nil)
                    return
                }

                let hexSignedTx = try ZhtpClient.buildSovWalletTransfer(
                    fromWalletId: fromWalletId,
                    toWalletId: toWalletId,
                    amount: amountValue,
                    using: identity,
                    chainId: 0x02  // testnet
                )

                print("[NativeIdentityProvisioning] SOV wallet transfer transaction built and signed")
                print("[NativeIdentityProvisioning] Hex tx length: \(hexSignedTx.count)")

                resolve(["signed_tx": hexSignedTx])

            } catch {
                print("[NativeIdentityProvisioning] ❌ SOV wallet transfer signing failed: \(error)")
                reject("SIGNING_ERROR", "Failed to sign SOV wallet transfer transaction: \(error)", nil)
            }
        }
    }

    // MARK: - Fee Config

    @objc
    func setFeeConfig(
        _ configJson: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async {
            do {
                let (updatedAt, chainHeight) = try ZhtpClient.setFeeConfig(json: configJson)
                print("[NativeIdentityProvisioning] Fee config set: updatedAt=\(updatedAt) chainHeight=\(chainHeight)")
                resolve([
                    "ok": true,
                    "updatedAt": NSNumber(value: updatedAt),
                    "chainHeight": NSNumber(value: chainHeight),
                ])
            } catch {
                print("[NativeIdentityProvisioning] ❌ Fee config failed: \(error)")
                reject("FEE_CONFIG_ERROR", "Failed to set fee config: \(error)", error)
            }
        }
    }

    @objc
    func quoteFeeForTxHex(
        _ txHex: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async {
            let fee = ZhtpClient.quoteFeeForTx(txHex: txHex)
            resolve(NSNumber(value: fee))
        }
    }

    // MARK: - Unified Domain Request Building

    /// UNIFIED: Build domain requests with Dilithium-signed payloads
    /// Private key remains in Keychain - never reaches JavaScript
    /// Routes to appropriate lib-client FFI based on domain request type
    @objc
    func signDomainRequest(
        _ requestType: String,
        params: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            do {
                print("[NativeIdentityProvisioning] Building domain request of type: \(requestType)")

                guard let identityAny = IdentityHandleStore.shared.getLatestIdentity(),
                      let identity = identityAny as? Identity else {
                    reject("NO_IDENTITY", "No active identity for signing", nil)
                    return
                }

                let requestJson: String

                switch requestType {
                case "domain_register":
                    guard let domain = params["domain"] as? String else {
                        reject("INVALID_PARAMS", "Missing domain parameter", nil)
                        return
                    }
                    requestJson = try ZhtpClient.buildDomainRegisterRequest(
                        domain: domain,
                        using: identity
                    )

                case "domain_update":
                    guard let domain = params["domain"] as? String,
                          let newManifestCid = params["newManifestCid"] as? String else {
                        reject("INVALID_PARAMS", "Missing domain update parameters", nil)
                        return
                    }
                    requestJson = try ZhtpClient.buildDomainUpdateRequest(
                        domain: domain,
                        newManifestCid: newManifestCid,
                        using: identity
                    )

                case "domain_transfer":
                    guard let domain = params["domain"] as? String,
                          let toOwnerDid = params["toOwnerDid"] as? String else {
                        reject("INVALID_PARAMS", "Missing domain transfer parameters", nil)
                        return
                    }
                    requestJson = try ZhtpClient.buildDomainTransferRequest(
                        domain: domain,
                        toOwnerDid: toOwnerDid,
                        using: identity
                    )

                default:
                    reject("INVALID_REQUEST_TYPE", "Unknown domain request type: \(requestType)", nil)
                    return
                }

                print("[NativeIdentityProvisioning] ✓ \(requestType) built successfully")

                resolve(["request_json": requestJson])

            } catch {
                print("[NativeIdentityProvisioning] ❌ Domain request failed: \(error)")
                reject("SIGNING_ERROR", "Failed to build \(requestType) request: \(error)", nil)
            }
        }
    }

    // MARK: - Domain Requests (RN-friendly wrappers)

    /// Build domain register request (RN)
    @objc
    func signDomainRegisterRequest(
        _ params: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        self.signDomainRequest("domain_register", params: params, resolve: resolve, reject: reject)
    }

    /// Build domain update request (RN)
    @objc
    func signDomainUpdateRequest(
        _ params: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        self.signDomainRequest("domain_update", params: params, resolve: resolve, reject: reject)
    }

    /// Build domain transfer request (RN)
    @objc
    func signDomainTransferRequest(
        _ params: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        self.signDomainRequest("domain_transfer", params: params, resolve: resolve, reject: reject)
    }

    // MARK: - Generic Message Signing (Dilithium)

    /// Sign an arbitrary message and return hex signature
    @objc
    func signMessage(
        _ message: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            _ = self
            do {
                guard let identityAny = IdentityHandleStore.shared.getLatestIdentity(),
                      let identity = identityAny as? Identity else {
                    reject("NO_IDENTITY", "No active identity for signing", nil)
                    return
                }

                let data = Data(message.utf8)
                let signature = try ZhtpClient.signData(data, using: identity)
                let hex = signature.map { String(format: "%02x", $0) }.joined()
                resolve(["signature": hex])
            } catch {
                reject("SIGNING_ERROR", "Failed to sign message: \(error)", nil)
            }
        }
    }

    /// Sign an arbitrary message using a cached identity by DID
    @objc
    func signMessageForDid(
        _ did: String,
        message: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            guard let identity = self?.cachedIdentities[did]?.libClientIdentity as? Identity else {
                reject("NO_IDENTITY", "Cached identity not found for DID", nil)
                return
            }
            do {
                let data = Data(message.utf8)
                let signature = try ZhtpClient.signData(data, using: identity)
                let hex = signature.map { String(format: "%02x", $0) }.joined()
                resolve(["signature": hex])
            } catch {
                reject("SIGNING_ERROR", "Failed to sign message for DID: \(error)", nil)
            }
        }
    }

    /// Sign a message using a seed phrase (restores identity internally)
    /// This path is used for one-time seed migration. Do not log seed or message contents.
    @objc
    func signMessageFromSeed(
        _ phrase: String,
        message: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async {
            do {
                let startedAt = Date()
                let wordCount = phrase.split(whereSeparator: { $0.isWhitespace }).count
                NSLog("[NativeIdentityProvisioning] signMessageFromSeed start (words=%d messageLen=%d)", wordCount, message.count)

                let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
                let identity = try ZhtpClient.restoreIdentityFromPhrase(phrase, deviceId: deviceId)
                NSLog("[NativeIdentityProvisioning] signMessageFromSeed restored identity")

#if DEBUG
                // Preflight: prove signing works at all (without logging sensitive data).
                // If this hangs, the issue is inside the Rust signing path, not the message size.
                NSLog("[NativeIdentityProvisioning] signMessageFromSeed probe signing (len=1)")
                let probeSig = try ZhtpClient.signData(Data([0x01]), using: identity)
                NSLog("[NativeIdentityProvisioning] signMessageFromSeed probe signed (sigLen=%d)", probeSig.count)
#endif

                let data = Data(message.utf8)
                NSLog("[NativeIdentityProvisioning] signMessageFromSeed signing")

                let signature = try ZhtpClient.signData(data, using: identity)
                NSLog("[NativeIdentityProvisioning] signMessageFromSeed signed (sigLen=%d elapsedMs=%d)", signature.count, Int(Date().timeIntervalSince(startedAt) * 1000))

                let hex = signature.map { String(format: "%02x", $0) }.joined()
                resolve(["signature": hex])
            } catch {
                reject("SIGNING_ERROR", "Failed to sign message from seed: \(error)", nil)
            }
        }
    }

    // MARK: - Current Identity DID

    @objc
    func getCurrentIdentityDid(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async {
            if let identity = IdentityHandleStore.shared.getLatestIdentity() as? Identity {
                resolve(identity.did)
            } else {
                resolve(NSNull())
            }
        }
    }

    // MARK: - Module Configuration

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}

// MARK: - Extensions

extension Data {
    var hexString: String {
        map { String(format: "%02x", $0) }.joined()
    }
}

extension Array where Element == UInt8 {
    var hexString: String {
        map { String(format: "%02x", $0) }.joined()
    }
}

extension Data {
    init?(fromHexString hexString: String) {
        let hexString = hexString.hasPrefix("0x") ? String(hexString.dropFirst(2)) : hexString
        let chars = Array(hexString)
        guard chars.count % 2 == 0 else { return nil }

        var data = Data()
        for i in stride(from: 0, to: chars.count, by: 2) {
            let hex = String([chars[i], chars[i + 1]])
            guard let byte = UInt8(hex, radix: 16) else { return nil }
            data.append(byte)
        }
        self = data
    }
}
