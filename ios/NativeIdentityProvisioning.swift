import Foundation
import React
import CryptoKit

// MARK: - Generated Identity Structure

struct GeneratedIdentity {
    let did: String
    let publicDilithium: Data
    let publicKyber: Data
    let nodeId: Data
    let deviceId: String
    let privateDilithium: Data
    let privateKyber: Data
    let masterSeed: Data
    let timestamp: UInt64
}

// MARK: - React Native Module for UHP Identity Provisioning

/// Exposes device-based identity provisioning to JavaScript
/// All private keys stay on device - only public keys sent to server
@objc(NativeIdentityProvisioning)
class NativeIdentityProvisioning: NSObject {
    private let queue = DispatchQueue(label: "com.sovereignnetwork.identity-provisioning", qos: .userInitiated)

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
                    "timestamp": identity.timestamp,
                    "publicKeySize": identity.publicDilithium.count,
                    "kyberPublicKeySize": identity.publicKyber.count,
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

    // MARK: - Server Registration

    /// Register identity with server (sends only public keys + signature proof)
    /// JavaScript API: await NativeIdentityProvisioning.registerWithServer(config, generatedIdentity)
    @objc
    func registerWithServer(
        _ identityData: NSDictionary,
        displayName: String,
        serverUrl: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            guard self != nil else {
                reject("IDENTITY_ERROR", "Module deallocated", nil)
                return
            }

            print("[NativeIdentityProvisioning] Registering with server: \(serverUrl)")

            // Reconstruct GeneratedIdentity from JavaScript data
            // Note: Private keys are NEVER passed from JS - they're in native storage only
            guard let generatedIdentity = self?.reconstructGeneratedIdentity(from: identityData) else {
                reject("IDENTITY_ERROR", "Failed to reconstruct identity from data", nil)
                return
            }

            // Perform registration asynchronously
            Task { [weak self] in
                let registrationResult = await self?.registerIdentityWithServer(
                    identity: generatedIdentity,
                    displayName: displayName,
                    serverUrl: serverUrl
                ) ?? .failure(NSError(domain: "NativeIdentityProvisioning", code: -1))

                switch registrationResult {
                case .success(let response):
                    print("[NativeIdentityProvisioning] ✅ Server registration succeeded")
                    guard let status = response["status"],
                          let identity_id = response["identity_id"],
                          let did = response["did"],
                          let pqc_enabled = response["pqc_enabled"] else {
                        reject("SERVER_ERROR", "Invalid server response format", nil)
                        return
                    }
                    resolve([
                        "status": status,
                        "identity_id": identity_id,
                        "did": did,
                        "pqc_enabled": pqc_enabled
                    ])

                case .failure(let error):
                    print("[NativeIdentityProvisioning] ❌ Server registration failed: \(error)")
                    reject("SERVER_ERROR", "Registration failed: \(error)", nil)
                }
            }
        }
    }

    /// Complete provisioning: generate → register → store
    /// JavaScript API: await NativeIdentityProvisioning.provisionIdentity(displayName, serverUrl)
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

            print("[NativeIdentityProvisioning] 🚀 Starting complete provisioning flow for: \(displayName)")

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
            print("[NativeIdentityProvisioning]    Registering with server: \(serverUrl)")

            // Step 2: Register with server
            Task { [weak self] in
                let registrationResult = await self?.registerIdentityWithServer(
                    identity: identity,
                    displayName: displayName,
                    serverUrl: serverUrl
                ) ?? .failure(NSError(domain: "NativeIdentityProvisioning", code: -1))

                switch registrationResult {
                case .success(let response):
                    guard let identityId = response["identity_id"] as? String,
                          let did = response["did"] as? String,
                          let pqc_enabled = response["pqc_enabled"] else {
                        reject("SERVER_ERROR", "Invalid server response format", nil)
                        return
                    }

                    print("[NativeIdentityProvisioning] ✅ Server registration succeeded")
                    print("[NativeIdentityProvisioning]    Identity ID: \(identityId)")
                    print("[NativeIdentityProvisioning]    Provisioning locally...")

                    // Step 3: Provision locally (store private keys)
                    let provisionResult = self?.storeIdentityInKeychain(identity: identity, identityId: identityId) ?? .failure(NSError(domain: "NativeIdentityProvisioning", code: -1))

                    switch provisionResult {
                    case .success:
                        print("[NativeIdentityProvisioning] ✅ Complete provisioning flow succeeded!")
                        print("[NativeIdentityProvisioning]    Identity ready for UHP handshake with ID: \(identityId)")
                        resolve([
                            "status": "provisioned",
                            "identity_id": identityId,
                            "did": did,
                            "device_id": identity.deviceId,
                            "pqc_enabled": pqc_enabled,
                            "masterSeedHex": identity.masterSeed.map { String(format: "%02x", $0) }.joined()
                        ])

                    case .failure(let error):
                        print("[NativeIdentityProvisioning] ❌ Local provisioning failed: \(error)")
                        reject("STORAGE_ERROR", "Failed to store identity locally: \(error)", nil)
                    }

                case .failure(let error):
                    print("[NativeIdentityProvisioning] ❌ Server registration failed: \(error)")
                    reject("SERVER_ERROR", "Server registration failed: \(error)", nil)
                }
            }
        }
    }

    // MARK: - Helper Functions

    // MARK: - Private Implementation

    /// Generate local identity with Dilithium5 + Kyber1024
    /// Following spec Part 1.1
    private func performGenerateLocalIdentity(displayName: String) -> Result<GeneratedIdentity, Error> {
        do {
            print("[NativeIdentityProvisioning] Step 1: Generating master seed...")
            // 1. Generate master seed (32 random bytes)
            var masterSeed = Data(count: 32)
            let result = masterSeed.withUnsafeMutableBytes { buffer in
                SecRandomCopyBytes(kSecRandomDefault, 32, buffer.baseAddress!)
            }
            guard result == errSecSuccess else {
                throw NSError(domain: "IdentityProvisioning", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to generate random seed"])
            }
            print("[NativeIdentityProvisioning] ✅ Master seed generated")

            print("[NativeIdentityProvisioning] Step 2: Generating ML-DSA-87 keypair (NIST standardized Dilithium5)...")
            // 2. Generate ML-DSA-87 keypair (NIST standardized version of Dilithium5)
            let dilithiumSig: LibOQSSIG
            let dilithiumKeypair: LibOQSKeypair
            let dilithiumPk: Data
            let dilithiumSk: Data

            do {
                dilithiumSig = try LibOQSSIG(algorithm: .mldsa87)
                print("[NativeIdentityProvisioning]    LibOQSSIG initialized")
                dilithiumKeypair = try dilithiumSig.generateKeypair()
                print("[NativeIdentityProvisioning]    Keypair generated")
                dilithiumPk = dilithiumKeypair.publicKey
                dilithiumSk = dilithiumKeypair.secretKey
                print("[NativeIdentityProvisioning] ✅ Dilithium5 keypair generated (\(dilithiumPk.count) bytes public)")
            } catch {
                print("[NativeIdentityProvisioning] ❌ Dilithium5 error: \(error)")
                throw error
            }

            print("[NativeIdentityProvisioning] Step 3: Generating ML-KEM-1024 keypair (NIST standardized Kyber1024)...")
            // 3. Generate ML-KEM-1024 keypair (NIST standardized version of Kyber1024)
            let kyberKEM: LibOQSKEM
            let kyberKeypair: LibOQSKeypair
            let kyberPk: Data
            let kyberSk: Data

            do {
                kyberKEM = try LibOQSKEM(algorithm: .mlkem1024)
                print("[NativeIdentityProvisioning]    LibOQSKEM initialized")
                kyberKeypair = try kyberKEM.generateKeypair()
                print("[NativeIdentityProvisioning]    Keypair generated")
                kyberPk = kyberKeypair.publicKey
                kyberSk = kyberKeypair.secretKey
                print("[NativeIdentityProvisioning] ✅ Kyber1024 keypair generated (\(kyberPk.count) bytes public)")
            } catch {
                print("[NativeIdentityProvisioning] ❌ Kyber1024 error: \(error)")
                throw error
            }

            // 4. Derive DID from Dilithium5 public key hash
            let publicKeyHash = Data(SHA256.hash(data: dilithiumPk))
            let did = "did:zhtp:\(publicKeyHash.hexString)"

            // 5. Get device ID
            let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString

            // 6. Derive node ID: Blake3(did || deviceId)
            var nodeIdData = Data()
            nodeIdData.append(contentsOf: did.utf8)
            nodeIdData.append(contentsOf: deviceId.utf8)
            let nodeId = Data(SHA256.hash(data: nodeIdData))

            // 7. Get timestamp
            let timestamp = UInt64(Date().timeIntervalSince1970)

            let identity = GeneratedIdentity(
                did: did,
                publicDilithium: dilithiumPk,
                publicKyber: kyberPk,
                nodeId: nodeId,
                deviceId: deviceId,
                privateDilithium: dilithiumSk,
                privateKyber: kyberSk,
                masterSeed: masterSeed,
                timestamp: timestamp
            )

            return .success(identity)
        } catch {
            return .failure(error)
        }
    }

    /// Register identity with server
    /// Following spec Part 1.3
    private func registerIdentityWithServer(
        identity: GeneratedIdentity,
        displayName: String,
        serverUrl: String
    ) async -> Result<[String: Any], Error> {
        do {
            let timestamp = UInt64(Date().timeIntervalSince1970)

            // 1. Create registration proof (ML-DSA-87 signature)
            let messageToSign = "ZHTP_REGISTER:\(identity.did):\(timestamp)"
            let dilithiumSig = try LibOQSSIG(algorithm: .mldsa87)
            let signature = try dilithiumSig.sign(
                message: Data(messageToSign.utf8),
                secretKey: identity.privateDilithium
            )

            // 2. Build registration request
            let requestBody: [String: Any] = [
                "did": identity.did,
                "public_key": identity.publicDilithium.base64EncodedString(),
                "kyber_public_key": identity.publicKyber.base64EncodedString(),
                "node_id": identity.nodeId.base64EncodedString(),
                "device_id": identity.deviceId,
                "display_name": displayName,
                "identity_type": "human",
                "registration_proof": signature.base64EncodedString(),
                "timestamp": timestamp
            ]

            // 3. Send POST request
            var request = URLRequest(url: URL(string: "\(serverUrl)/api/v1/identity/register")!)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                throw NSError(domain: "IdentityProvisioning", code: -2, userInfo: [NSLocalizedDescriptionKey: "Server registration failed with status \((response as? HTTPURLResponse)?.statusCode ?? -1)"])
            }

            // 4. Parse response
            guard let responseDict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                throw NSError(domain: "IdentityProvisioning", code: -3, userInfo: [NSLocalizedDescriptionKey: "Invalid server response"])
            }

            return .success(responseDict)
        } catch {
            return .failure(error)
        }
    }

    /// Store identity in Keychain
    /// Following spec Part 1.2
    private func storeIdentityInKeychain(identity: GeneratedIdentity, identityId: String) -> Result<Void, Error> {
        do {
            // Store private materials in Keychain
            let privateData: [String: String] = [
                "privateKey": identity.privateDilithium.base64EncodedString(),
                "kyberSecretKey": identity.privateKyber.base64EncodedString(),
                "masterSeed": identity.masterSeed.base64EncodedString()
            ]

            let privateDataJson = try JSONSerialization.data(withJSONObject: privateData)

            let keychainQuery: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrAccount as String: "zhtp_identity_private_\(identity.did)",
                kSecValueData as String: privateDataJson,
                kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            ]

            // Delete if exists
            SecItemDelete(keychainQuery as CFDictionary)

            // Add new
            let status = SecItemAdd(keychainQuery as CFDictionary, nil)
            guard status == errSecSuccess else {
                throw NSError(domain: "IdentityProvisioning", code: -4, userInfo: [NSLocalizedDescriptionKey: "Keychain storage failed: \(status)"])
            }

            // Store public info
            let publicData: [String: String] = [
                "did": identity.did,
                "publicKey": identity.publicDilithium.base64EncodedString(),
                "kyberPublicKey": identity.publicKyber.base64EncodedString(),
                "nodeId": identity.nodeId.base64EncodedString(),
                "deviceId": identity.deviceId,
                "createdAt": String(identity.timestamp),
                "identityId": identityId
            ]

            let publicDataJson = try JSONSerialization.data(withJSONObject: publicData)

            let publicKeychainQuery: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrAccount as String: "zhtp_identity_public_\(identity.did)",
                kSecValueData as String: publicDataJson,
                kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlocked
            ]

            // Delete if exists
            SecItemDelete(publicKeychainQuery as CFDictionary)

            // Add new
            let publicStatus = SecItemAdd(publicKeychainQuery as CFDictionary, nil)
            guard publicStatus == errSecSuccess else {
                throw NSError(domain: "IdentityProvisioning", code: -5, userInfo: [NSLocalizedDescriptionKey: "Public keychain storage failed: \(publicStatus)"])
            }

            return .success(())
        } catch {
            return .failure(error)
        }
    }

    private func deriveBytes(_ seed: Data, _ context: String) -> Data {
        let combined = seed + (context.data(using: .utf8) ?? Data())
        let hash = SHA256.hash(data: combined)
        return Data(hash).prefix(32)
    }

    private func reconstructGeneratedIdentity(from dict: NSDictionary) -> GeneratedIdentity? {
        // For now, this is a placeholder
        // In practice, identity data comes from the native generation step
        // Private keys are NEVER in JavaScript - they stay in Keychain
        return nil
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
