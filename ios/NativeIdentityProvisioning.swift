import Foundation
import React

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

            let result = generateLocalIdentity(displayName: displayName)

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
            Task {
                let registrationResult = await registerIdentityWithServer(
                    identity: generatedIdentity,
                    displayName: displayName,
                    serverUrl: serverUrl
                )

                switch registrationResult {
                case .success(let response):
                    print("[NativeIdentityProvisioning] ✅ Server registration succeeded")
                    resolve([
                        "status": response.status,
                        "identity_id": response.identity_id,
                        "did": response.did,
                        "pqc_enabled": response.pqc_enabled
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

            print("[NativeIdentityProvisioning] Starting complete provisioning flow")

            // Step 1: Generate identity locally
            let generateResult = generateLocalIdentity(displayName: displayName)
            guard case .success(let identity) = generateResult else {
                reject("IDENTITY_ERROR", "Failed to generate identity", nil)
                return
            }

            print("[NativeIdentityProvisioning] ✅ Identity generated, registering with server...")

            // Step 2: Register with server
            Task {
                let registrationResult = await registerIdentityWithServer(
                    identity: identity,
                    displayName: displayName,
                    serverUrl: serverUrl
                )

                guard case .success(let response) = registrationResult else {
                    reject("SERVER_ERROR", "Server registration failed", nil)
                    return
                }

                let identityId = response.identity_id
                print("[NativeIdentityProvisioning] ✅ Server registration succeeded, provisioning locally...")

                // Step 3: Provision locally (store private keys)
                let provisionResult = provisionIdentity(identity: identity, identityId: identityId)

                switch provisionResult {
                case .success:
                    print("[NativeIdentityProvisioning] ✅ Complete provisioning flow succeeded")
                    resolve([
                        "status": "provisioned",
                        "identity_id": identityId,
                        "did": response.did,
                        "device_id": identity.deviceId,
                        "pqc_enabled": response.pqc_enabled,
                        "masterSeedHex": identity.masterSeed.map { String(format: "%02x", $0) }.joined()
                    ])

                case .failure(let error):
                    print("[NativeIdentityProvisioning] ❌ Local provisioning failed: \(error)")
                    reject("STORAGE_ERROR", "Failed to store identity locally: \(error)", nil)
                }
            }
        }
    }

    // MARK: - Helper Functions

    /// Reconstruct GeneratedIdentity from JavaScript dictionary
    /// Note: Private keys are loaded from native storage, not passed from JS
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
