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

            // SECURITY: Do NOT store private keys even temporarily
            // Private keys stay in Rust lib-client Identity objects
            // Temp metadata only (public data) is stored for reference
            do {
                let tempKeyJson: [String: Any] = [
                    "did": identity.did,
                    "device_id": identity.deviceId,
                    "node_id": Data(identity.nodeId).base64EncodedString(),
                    "public_key": Data(identity.publicKey).base64EncodedString(),
                    "kyber_public_key": Data(identity.kyberPublicKey).base64EncodedString(),
                    "timestamp": identity.createdAt,
                    "identity_type": "human"
                    // Note: NO dilithium_sk, kyber_sk - these stay in Rust
                ]
                let tempData = try JSONSerialization.data(withJSONObject: tempKeyJson)
                let tempQuery: [String: Any] = [
                    kSecClass as String: kSecClassGenericPassword,
                    kSecAttrService as String: "com.sovereign.zhtp",
                    kSecAttrAccount as String: "temp_identity_\(identity.did)",
                    kSecValueData as String: tempData,
                    kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
                ]
                SecItemDelete(tempQuery as CFDictionary)
                SecItemAdd(tempQuery as CFDictionary, nil)
                print("[NativeIdentityProvisioning]    ✅ Identity metadata stored (private keys stay in Rust)")
            } catch {
                print("[NativeIdentityProvisioning]    ⚠️ Failed to backup identity metadata: \(error)")
            }

            // Return generated identity - TypeScript will handle server registration via QUIC
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

                // Step 1: Write identity materials to Documents keystore for UhpHandshake
                print("[NativeIdentityProvisioning]    Step 1: Writing identity to Documents...")
                let documentsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                print("[NativeIdentityProvisioning]    Documents directory: \(documentsDir.path)")

                let keystoreDir = documentsDir.appendingPathComponent("keystore").appendingPathComponent(identityId)
                print("[NativeIdentityProvisioning]    Target keystore dir: \(keystoreDir.path)")

                // Create keystore directory
                try FileManager.default.createDirectory(at: keystoreDir, withIntermediateDirectories: true, attributes: nil)
                print("[NativeIdentityProvisioning]    ✅ Keystore directory created")

                // Prepare identity JSON for UhpHandshake
                let identityJson: [String: Any] = [
                    "did": identity.did,
                    "identity_id": identityId,
                    "device_id": identity.deviceId,
                    "node_id": Data(identity.nodeId).base64EncodedString(),
                    "public_key": Data(identity.publicKey).base64EncodedString(),
                    "kyber_public_key": Data(identity.kyberPublicKey).base64EncodedString(),
                    "timestamp": identity.createdAt,
                    "identity_type": "human"
                ]

                let jsonData = try JSONSerialization.data(withJSONObject: identityJson, options: .prettyPrinted)
                let identityFile = keystoreDir.appendingPathComponent("user_identity.json")
                print("[NativeIdentityProvisioning]    Writing identity JSON to: \(identityFile.path)")
                try jsonData.write(to: identityFile, options: .atomic)

                // Verify file was written
                if FileManager.default.fileExists(atPath: identityFile.path) {
                    print("[NativeIdentityProvisioning]    ✅ Identity file verified to exist at: \(identityFile.path)")
                } else {
                    print("[NativeIdentityProvisioning]    ⚠️ VERIFICATION FAILED: Identity file not found after write!")
                }

                print("[NativeIdentityProvisioning]    ✅ Identity materials written to: \(keystoreDir.path)")

                // SECURITY: Do NOT store private keys in Keychain
                // Private keys stay in Rust lib-client Identity objects via IdentityHandleStore
                // This maintains the "keys never leave the crypto boundary" architecture

                // Store lib-client Identity in handle store for UhpHandshake to use
                // Store with both DID and identity_id for dual lookup capability
                if let libIdentity = identity.libClientIdentity {
                    do {
                        try IdentityHandleStore.shared.store(identity: libIdentity, identityId: identityId)
                        print("[NativeIdentityProvisioning]    ✅ Identity stored in handle store for handshake")
                        print("[NativeIdentityProvisioning]       - Keys: DID + identity_id hash")

                        // Also serialize and store the Identity JSON for restoration on app launch
                        let identityJson = try ZhtpClient.serializeIdentity(libIdentity as! Identity)
                        let serializedData = identityJson.data(using: .utf8) ?? Data()

                        let serializedKeychainQuery: [String: Any] = [
                            kSecClass as String: kSecClassGenericPassword,
                            kSecAttrService as String: "com.sovereign.zhtp",
                            kSecAttrAccount as String: "identity_serialized_\(identityId)",
                            kSecValueData as String: serializedData,
                            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
                        ]

                        SecItemDelete(serializedKeychainQuery as CFDictionary)
                        let status = SecItemAdd(serializedKeychainQuery as CFDictionary, nil)
                        if status == errSecSuccess {
                            print("[NativeIdentityProvisioning]    ✅ Serialized Identity stored in Keychain")
                        } else {
                            print("[NativeIdentityProvisioning]    ⚠️ Failed to store serialized Identity: \(status)")
                        }
                    } catch {
                        print("[NativeIdentityProvisioning]    ⚠️ Warning: Failed to store identity: \(error)")
                    }
                }

                // Step 2 (formerly Step 3): Store the identity metadata in Keychain for quick lookup
                let publicData: [String: String] = [
                    "did": identity.did,
                    "identityId": identityId,
                    "timestamp": String(Date().timeIntervalSince1970)
                ]

                let publicDataJson = try JSONSerialization.data(withJSONObject: publicData)

                let publicKeychainQuery: [String: Any] = [
                    kSecClass as String: kSecClassGenericPassword,
                    kSecAttrService as String: "com.sovereign.zhtp",
                    kSecAttrAccount as String: "zhtp_identity_provisioned_\(identityId)",
                    kSecValueData as String: publicDataJson,
                    kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlocked
                ]

                // Delete if exists
                SecItemDelete(publicKeychainQuery as CFDictionary)

                // Add new
                let status = SecItemAdd(publicKeychainQuery as CFDictionary, nil)
                guard status == errSecSuccess else {
                    throw NSError(domain: "IdentityProvisioning", code: -5, userInfo: [NSLocalizedDescriptionKey: "Keychain storage failed: \(status)"])
                }

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

    // MARK: - Cleanup Functions

    /// Clean all identity data (Documents keystore + Keychain + cached identities)
    /// JavaScript API: NativeIdentityProvisioning.cleanKeystoreDirectory()
    @objc
    func cleanKeystoreDirectory() {
        queue.async {
            do {
                // Step 1: Clean Documents keystore directory
                guard let documentsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
                    print("[NativeIdentityProvisioning] ❌ Failed to get Documents directory")
                    return
                }

                let keystoreDir = documentsDir.appendingPathComponent("keystore")
                if FileManager.default.fileExists(atPath: keystoreDir.path) {
                    try FileManager.default.removeItem(at: keystoreDir)
                    print("[NativeIdentityProvisioning] ✅ Cleaned Documents/keystore directory")
                }

                // Step 2: Clean all Keychain entries
                _ = UhpKeystore.deleteAllPrivateKeys()

                // Step 3: Clear cached identities
                self.cachedIdentities.removeAll()
                print("[NativeIdentityProvisioning] ✅ All identity data cleaned")
            } catch {
                print("[NativeIdentityProvisioning] ❌ Cleanup failed: \(error)")
            }
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

    // MARK: - Unified Domain Transaction Signing

    /// UNIFIED: Sign domain transactions with Dilithium keypair
    /// Private key remains in Keychain - never reaches JavaScript
    /// Routes to appropriate lib-client FFI based on domain transaction type
    @objc
    func signDomainTransaction(
        _ txType: String,
        params: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            do {
                print("[NativeIdentityProvisioning] Signing domain transaction of type: \(txType)")

                // Get the current identity from handle store once
                guard let identityAny = IdentityHandleStore.shared.getLatestIdentity(),
                      let identity = identityAny as? Identity else {
                    reject("NO_IDENTITY", "No active identity for signing", nil)
                    return
                }

                // Route to appropriate lib-client FFI based on domain transaction type
                let hexSignedTx: String

                switch txType {
                case "domain_register":
                    guard let domain = params["domain"] as? String,
                          let durationDays = params["durationDays"] as? NSNumber else {
                        reject("INVALID_PARAMS", "Missing domain register parameters", nil)
                        return
                    }
                    hexSignedTx = try ZhtpClient.buildDomainRegister(
                        domain: domain,
                        durationDays: UInt32(durationDays.uint32Value),
                        using: identity,
                        chainId: 0x02
                    )

                case "domain_update":
                    guard let domain = params["domain"] as? String,
                          let contentCid = params["contentCid"] as? String else {
                        reject("INVALID_PARAMS", "Missing domain update parameters", nil)
                        return
                    }
                    hexSignedTx = try ZhtpClient.buildDomainUpdate(
                        domain: domain,
                        contentCid: contentCid,
                        using: identity,
                        chainId: 0x02
                    )

                default:
                    reject("INVALID_TX_TYPE", "Unknown domain transaction type: \(txType)", nil)
                    return
                }

                print("[NativeIdentityProvisioning] ✓ \(txType) signed successfully")
                print("[NativeIdentityProvisioning] Hex tx length: \(hexSignedTx.count)")

                resolve(["signed_tx": hexSignedTx])

            } catch {
                print("[NativeIdentityProvisioning] ❌ Domain transaction signing failed: \(error)")
                reject("SIGNING_ERROR", "Failed to sign \(txType) transaction: \(error)", nil)
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
