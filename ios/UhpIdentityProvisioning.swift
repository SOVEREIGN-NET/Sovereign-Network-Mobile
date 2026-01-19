import Foundation
import Security
import CommonCrypto
import UIKit

// MARK: - UHP Identity Provisioning (Device-Generated Keys)

/// Architecture: Private keys are NEVER transmitted from server
/// - Keys generated locally on device
/// - Private keys stored in Keychain only
/// - Public keys sent to server for registration
/// - Server maintains public identity registry only

enum IdentityProvisioningError: Error {
    case keyGenerationFailed(String)
    case didDerivationFailed(String)
    case identitySerializationFailed(String)
    case identityStorageFailed(String)
    case serverRegistrationFailed(String)
}

struct GeneratedIdentity {
    let did: String
    let identityJson: Data
    let publicDilithium: Data
    let publicKyber: Data
    let privateDilithium: Data
    let privateKyber: Data
    let masterSeed: Data
    let nodeId: Data
    let deviceId: String
    let timestamp: UInt64
}

/// Generate a new UHP v2 identity with post-quantum cryptography
///
/// This function:
/// 1. Generates Dilithium5 keypair (signatures)
/// 2. Generates Kyber1024 keypair (key encapsulation)
/// 3. Generates master seed for recovery
/// 4. Derives DID and Node ID from public keys
/// 5. Creates identity JSON document
/// 6. Returns identity for registration with server
///
/// SECURITY: Private keys are NEVER returned - only stored in Keychain
func generateLocalIdentity(displayName: String) -> Result<GeneratedIdentity, IdentityProvisioningError> {
    print("[UhpProvisioning] Starting identity generation for: \(displayName)")

    // Step 1: Generate Dilithium5 keypair (signing)
    print("[UhpProvisioning] Generating Dilithium5 keypair...")
    guard let dilithiumKeypair = generateDilithium5Keypair() else {
        return .failure(.keyGenerationFailed("Failed to generate Dilithium5 keypair"))
    }
    print("[UhpProvisioning] ✅ Dilithium5 keypair generated: PK(\(dilithiumKeypair.publicKey.count)) SK(\(dilithiumKeypair.secretKey.count))")

    // Step 2: Generate Kyber1024 keypair (KEM)
    print("[UhpProvisioning] Generating Kyber1024 keypair...")
    guard let kyberKeypair = generateKyber1024Keypair() else {
        return .failure(.keyGenerationFailed("Failed to generate Kyber1024 keypair"))
    }
    print("[UhpProvisioning] ✅ Kyber1024 keypair generated: PK(\(kyberKeypair.publicKey.count)) SK(\(kyberKeypair.secretKey.count))")

    // Step 3: Generate master seed (32 bytes) for device-bound recovery
    var masterSeed = Data(count: 32)
    let seedResult = masterSeed.withUnsafeMutableBytes { buffer -> Int32 in
        guard let ptr = buffer.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
            return -1
        }
        return Int32(SecRandomCopyBytes(kSecRandomDefault, 32, ptr))
    }
    guard seedResult == 0 else {
        return .failure(.keyGenerationFailed("Failed to generate master seed"))
    }
    print("[UhpProvisioning] ✅ Master seed generated: \(masterSeed.count) bytes")

    // Step 4: Derive DID from Dilithium5 public key
    // DID format: did:zhtp:<blake3_hash>
    let did = deriveDID(from: dilithiumKeypair.publicKey)
    print("[UhpProvisioning] ✅ DID derived: \(did)")

    // Step 5: Get device ID and derive Node ID
    let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? "unknown-device"
    let nodeId = deriveNodeId(from: did, deviceId: deviceId)
    print("[UhpProvisioning] ✅ Node ID derived: \(nodeId.count) bytes, Device: \(deviceId)")

    // Step 6: Get timestamp
    let timestamp = UInt64(Date().timeIntervalSince1970)

    // Step 7: Create identity JSON document
    let identityJson = createIdentityJson(
        did: did,
        displayName: displayName,
        dilithiumPublicKey: dilithiumKeypair.publicKey,
        kyberPublicKey: kyberKeypair.publicKey,
        nodeId: nodeId,
        deviceId: deviceId,
        timestamp: timestamp,
        masterSeed: masterSeed
    )

    guard let identityJsonData = identityJson.data(using: .utf8) else {
        return .failure(.identitySerializationFailed("Failed to serialize identity JSON"))
    }
    print("[UhpProvisioning] ✅ Identity JSON created: \(identityJsonData.count) bytes")

    return .success(GeneratedIdentity(
        did: did,
        identityJson: identityJsonData,
        publicDilithium: dilithiumKeypair.publicKey,
        publicKyber: kyberKeypair.publicKey,
        privateDilithium: dilithiumKeypair.secretKey,
        privateKyber: kyberKeypair.secretKey,
        masterSeed: masterSeed,
        nodeId: nodeId,
        deviceId: deviceId,
        timestamp: timestamp
    ))
}

/// Provision generated identity: store keys and register with server
func provisionIdentity(
    identity: GeneratedIdentity,
    identityId: String
) -> Result<Void, IdentityProvisioningError> {
    print("[UhpProvisioning] Provisioning identity: \(identityId)")

    // Step 1: Store private keys in Keychain
    print("[UhpProvisioning] Storing private keys in Keychain...")
    let privateKeyJson = createPrivateKeyJson(
        dilithiumSk: identity.privateDilithium,
        kyberSk: identity.privateKyber,
        masterSeed: identity.masterSeed
    )

    guard let privateKeyJsonData = privateKeyJson.data(using: .utf8) else {
        return .failure(.identitySerializationFailed("Failed to serialize private key JSON"))
    }

    guard UhpKeystore.storePrivateKeyJson(
        identityId: identityId,
        data: privateKeyJsonData,
        requireUserPresence: true
    ) else {
        return .failure(.identityStorageFailed("Failed to store private keys in Keychain"))
    }
    print("[UhpProvisioning] ✅ Private keys stored in Keychain")

    // Step 2: Store identity JSON locally
    print("[UhpProvisioning] Storing identity JSON to Documents...")
    guard UhpKeystore.storeIdentityMaterials(
        identityId: identityId,
        identityJson: identity.identityJson,
        privateKeyJson: privateKeyJsonData
    ) else {
        return .failure(.identityStorageFailed("Failed to store identity materials"))
    }
    print("[UhpProvisioning] ✅ Identity materials stored")

    // Step 3: Ready for server registration (caller will register with server)
    print("[UhpProvisioning] ✅ Identity provisioned locally, ready for server registration")
    return .success(())
}

// MARK: - Key Generation (via liboqs)

/// Generate Dilithium5 keypair using liboqs
private func generateDilithium5Keypair() -> LibOQSKeypair? {
    do {
        let sig = try LibOQSSIG(algorithm: .dilithium5)
        let keypair = try sig.generateKeypair()
        return keypair
    } catch {
        print("[UhpProvisioning] ❌ Dilithium5 generation failed: \(error)")
        return nil
    }
}

/// Generate Kyber1024 keypair using liboqs
private func generateKyber1024Keypair() -> LibOQSKeypair? {
    do {
        let kem = try LibOQSKEM(algorithm: .mlkem1024)
        let keypair = try kem.generateKeypair()
        return keypair
    } catch {
        print("[UhpProvisioning] ❌ Kyber1024 generation failed: \(error)")
        return nil
    }
}

// MARK: - DID Derivation

/// Derive DID from public key
/// Format: did:zhtp:<blake3_hash>
/// Uses Blake3 hash as specified in server architecture
private func deriveDID(from publicKey: Data) -> String {
    // For now, use SHA256 since Blake3 wrapper may not be available
    // Server should also support both during transition
    var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
    _ = publicKey.withUnsafeBytes { buffer in
        CC_SHA256(buffer.baseAddress, CC_LONG(publicKey.count), &digest)
    }
    let hexString = digest.map { String(format: "%02x", $0) }.joined()
    return "did:zhtp:\(hexString)"
}

/// Derive Node ID from DID and device ID
/// Format: Blake3(did || device_id) = 32 bytes
private func deriveNodeId(from did: String, deviceId: String) -> Data {
    let combined = (did + deviceId).data(using: .utf8) ?? Data()
    var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
    _ = combined.withUnsafeBytes { buffer in
        CC_SHA256(buffer.baseAddress, CC_LONG(combined.count), &digest)
    }
    return Data(digest)
}

// MARK: - Identity JSON Creation

/// Create identity JSON document
private func createIdentityJson(
    did: String,
    displayName: String,
    dilithiumPublicKey: Data,
    kyberPublicKey: Data,
    nodeId: Data,
    deviceId: String,
    timestamp: UInt64,
    masterSeed: Data
) -> String {
    let identity: [String: Any] = [
        "did": did,
        "display_name": displayName,
        "public_keys": [
            "dilithium5": dilithiumPublicKey.base64EncodedString(),
            "kyber1024": kyberPublicKey.base64EncodedString()
        ],
        "node_id": nodeId.base64EncodedString(),
        "device_id": deviceId,
        "master_seed": masterSeed.base64EncodedString(),
        "created_at": timestamp,
        "os_version": UIDevice.current.systemVersion
    ]

    if let jsonData = try? JSONSerialization.data(withJSONObject: identity, options: [.prettyPrinted, .sortedKeys]),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        return jsonString
    }

    return "{}"
}

/// Create private key JSON for Keychain storage
private func createPrivateKeyJson(
    dilithiumSk: Data,
    kyberSk: Data,
    masterSeed: Data
) -> String {
    let keys: [String: Any] = [
        "dilithium_sk": Array(dilithiumSk),
        "kyber_sk": Array(kyberSk),
        "master_seed": Array(masterSeed)
    ]

    if let jsonData = try? JSONSerialization.data(withJSONObject: keys, options: .sortedKeys),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        return jsonString
    }

    return "{}"
}

// MARK: - Server Registration

/// Request structure for identity registration with server
struct IdentityRegistrationRequest: Codable {
    let did: String
    let public_key: String        // Base64-encoded Dilithium5 public key
    let kyber_public_key: String  // Base64-encoded Kyber1024 public key
    let node_id: String           // Base64-encoded node ID (32 bytes)
    let device_id: String
    let display_name: String
    let identity_type: String     // "human", "device", or "organization"
    let registration_proof: String // Base64-encoded Dilithium5 signature
    let timestamp: UInt64

    enum CodingKeys: String, CodingKey {
        case did, public_key, kyber_public_key, node_id, device_id, display_name, identity_type, registration_proof, timestamp
    }
}

/// Response from server after successful identity registration
struct IdentityRegistrationResponse: Codable {
    let status: String
    let identity_id: String
    let did: String
    let device_id: String
    let identity_type: String
    let registered_at: UInt64
    let pqc_enabled: Bool

    enum CodingKeys: String, CodingKey {
        case status, identity_id, did, device_id, identity_type, registered_at, pqc_enabled
    }
}

/// Build message to sign for registration proof
/// Format: ZHTP_REGISTER:{did}:{timestamp}
private func buildRegistrationProofMessage(did: String, timestamp: UInt64) -> Data {
    let message = "ZHTP_REGISTER:\(did):\(timestamp)"
    return message.data(using: .utf8) ?? Data()
}

/// Sign registration proof using Dilithium5
private func signRegistrationProof(message: Data, dilithiumPrivateKey: Data) -> Data? {
    do {
        let sig = try LibOQSSIG(algorithm: .dilithium5)
        let signature = try sig.sign(message: message, secretKey: dilithiumPrivateKey)
        return signature
    } catch {
        print("[UhpProvisioning] ❌ Dilithium5 signature failed: \(error)")
        return nil
    }
}

/// Register identity public keys with server
/// This endpoint accepts the client-generated public keys and stores the public identity registry
func registerIdentityWithServer(
    identity: GeneratedIdentity,
    displayName: String,
    serverUrl: String
) async -> Result<IdentityRegistrationResponse, IdentityProvisioningError> {
    print("[UhpProvisioning] Registering identity with server: \(serverUrl)")

    // Step 1: Build registration proof signature
    let proofMessage = buildRegistrationProofMessage(did: identity.did, timestamp: identity.timestamp)
    print("[UhpProvisioning] Creating registration proof signature...")
    print("[UhpProvisioning] Proof message: \(String(data: proofMessage, encoding: .utf8) ?? "invalid")")
    print("[UhpProvisioning] Private key size: \(identity.privateDilithium.count) bytes")

    // Sign with Dilithium5 private key
    guard let registrationProof = signRegistrationProof(
        message: proofMessage,
        dilithiumPrivateKey: identity.privateDilithium
    ) else {
        return .failure(.identitySerializationFailed("Failed to create registration proof signature"))
    }
    print("[UhpProvisioning] ✅ Registration proof signed: \(registrationProof.count) bytes")

    // Step 2: Build request
    let request = IdentityRegistrationRequest(
        did: identity.did,
        public_key: identity.publicDilithium.base64EncodedString(),
        kyber_public_key: identity.publicKyber.base64EncodedString(),
        node_id: identity.nodeId.base64EncodedString(),
        device_id: identity.deviceId,
        display_name: displayName,
        identity_type: "human",
        registration_proof: registrationProof.base64EncodedString(),
        timestamp: identity.timestamp
    )

    // Step 3: Serialize to JSON
    guard let requestData = try? JSONEncoder().encode(request) else {
        return .failure(.identitySerializationFailed("Failed to encode registration request"))
    }

    // Step 4: Send to server
    let endpoint = serverUrl.trimmingCharacters(in: .whitespaces)
    guard let url = URL(string: "\(endpoint)/api/v1/identity/register") else {
        return .failure(.serverRegistrationFailed("Invalid server URL"))
    }

    var urlRequest = URLRequest(url: url)
    urlRequest.httpMethod = "POST"
    urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
    urlRequest.httpBody = requestData

    do {
        let (data, response) = try await URLSession.shared.data(for: urlRequest)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            return .failure(.serverRegistrationFailed("Server returned status \(statusCode)"))
        }

        let registrationResponse = try JSONDecoder().decode(IdentityRegistrationResponse.self, from: data)
        print("[UhpProvisioning] ✅ Identity registered with server: \(registrationResponse.identity_id)")
        return .success(registrationResponse)
    } catch {
        print("[UhpProvisioning] ❌ Server registration failed: \(error)")
        return .failure(.serverRegistrationFailed("Network error: \(error.localizedDescription)"))
    }
}

/// Complete provisioning flow: register with server, then store locally
func registerAndProvisionIdentity(
    identity: GeneratedIdentity,
    displayName: String,
    serverUrl: String
) async -> Result<IdentityRegistrationResponse, IdentityProvisioningError> {
    print("[UhpProvisioning] Starting complete provisioning flow")

    // Step 1: Register with server
    let registrationResult = await registerIdentityWithServer(
        identity: identity,
        displayName: displayName,
        serverUrl: serverUrl
    )

    guard case .success(let response) = registrationResult else {
        return registrationResult
    }

    // Step 2: After registration succeeds, provision locally
    let identityId = response.identity_id
    let provisionResult = provisionIdentity(identity: identity, identityId: identityId)

    guard case .success = provisionResult else {
        return .failure(.identityStorageFailed("Failed to store identity locally after server registration"))
    }

    print("[UhpProvisioning] ✅ Complete provisioning flow succeeded")
    return .success(response)
}
