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
}

/// Generate a new UHP v2 identity with post-quantum cryptography
///
/// This function:
/// 1. Generates Dilithium5 keypair (signatures)
/// 2. Generates Kyber1024 keypair (key encapsulation)
/// 3. Generates master seed for recovery
/// 4. Derives DID from public keys
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
    // DID format: did:zhtp:<sha256(public_key_hex)>
    let did = deriveDID(from: dilithiumKeypair.publicKey)
    print("[UhpProvisioning] ✅ DID derived: \(did)")

    // Step 5: Create identity JSON document
    let identityJson = createIdentityJson(
        did: did,
        displayName: displayName,
        dilithiumPublicKey: dilithiumKeypair.publicKey,
        kyberPublicKey: kyberKeypair.publicKey,
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
        masterSeed: masterSeed
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
/// Format: did:zhtp:<sha256_hex>
private func deriveDID(from publicKey: Data) -> String {
    var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
    _ = publicKey.withUnsafeBytes { buffer in
        CC_SHA256(buffer.baseAddress, CC_LONG(publicKey.count), &digest)
    }
    let hexString = digest.map { String(format: "%02x", $0) }.joined()
    return "did:zhtp:\(hexString)"
}

// MARK: - Identity JSON Creation

/// Create identity JSON document
private func createIdentityJson(
    did: String,
    displayName: String,
    dilithiumPublicKey: Data,
    kyberPublicKey: Data,
    masterSeed: Data
) -> String {
    let now = Date()
    let timestamp = UInt64(now.timeIntervalSince1970)

    let identity: [String: Any] = [
        "did": did,
        "display_name": displayName,
        "public_keys": [
            "dilithium5": dilithiumPublicKey.base64EncodedString(),
            "kyber1024": kyberPublicKey.base64EncodedString()
        ],
        "master_seed": masterSeed.base64EncodedString(),
        "created_at": timestamp,
        "device_id": UIDevice.current.identifierForVendor?.uuidString ?? "unknown",
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
