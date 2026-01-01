import Foundation
import React

// MARK: - React Native Module for liboqs

@objc(LibOQS)
class LibOQS: NSObject {
    private static let liboqsInitialized: Void = {
        LibOQS_Init()
    }()

    override init() {
        super.init()
        _ = LibOQS.liboqsInitialized
    }

    // Use background queue for async operations
    private let queue = DispatchQueue(label: "com.sovereignnetwork.liboqs", qos: .userInitiated)

    // MARK: - KEM Operations

    /// Generate KEM keypair
    /// JavaScript API: await LibOQS.kemGenerateKeypair(algorithm)
    @objc
    func kemGenerateKeypair(
        _ algorithm: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            guard self != nil else {
                reject("LIBOQS_ERROR", "Module deallocated", nil)
                return
            }

            do {
                guard let algo = LibOQSKEMAlgorithm(rawValue: algorithm) else {
                    throw LibOQSError.algorithmNotSupported(algorithm)
                }

                let kem = try LibOQSKEM(algorithm: algo)
                let keypair = try kem.generateKeypair()

                resolve([
                    "publicKey": keypair.publicKey.base64EncodedString(),
                    "secretKey": keypair.secretKey.base64EncodedString(),
                    "algorithm": algorithm,
                    "publicKeyLength": kem.publicKeyLength,
                    "secretKeyLength": kem.secretKeyLength
                ])
            } catch let error as LibOQSError {
                reject("LIBOQS_ERROR", error.errorDescription ?? "Unknown error", error)
            } catch {
                reject("LIBOQS_ERROR", error.localizedDescription, error)
            }
        }
    }

    /// Encapsulate (encapsulator side)
    /// JavaScript API: await LibOQS.kemEncapsulate(algorithm, publicKeyBase64)
    @objc
    func kemEncapsulate(
        _ algorithm: String,
        publicKeyBase64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            guard self != nil else {
                reject("LIBOQS_ERROR", "Module deallocated", nil)
                return
            }

            do {
                guard let algo = LibOQSKEMAlgorithm(rawValue: algorithm) else {
                    throw LibOQSError.algorithmNotSupported(algorithm)
                }

                guard let publicKey = Data(base64Encoded: publicKeyBase64) else {
                    throw LibOQSError.invalidInput
                }

                let kem = try LibOQSKEM(algorithm: algo)
                let encaps = try kem.encapsulate(publicKey: publicKey)

                resolve([
                    "ciphertext": encaps.ciphertext.base64EncodedString(),
                    "sharedSecret": encaps.sharedSecret.base64EncodedString(),
                    "ciphertextLength": kem.ciphertextLength,
                    "sharedSecretLength": kem.sharedSecretLength
                ])
            } catch let error as LibOQSError {
                reject("LIBOQS_ERROR", error.errorDescription ?? "Unknown error", error)
            } catch {
                reject("LIBOQS_ERROR", error.localizedDescription, error)
            }
        }
    }

    /// Decapsulate (decapsulator side)
    /// JavaScript API: await LibOQS.kemDecapsulate(algorithm, ciphertextBase64, secretKeyBase64)
    @objc
    func kemDecapsulate(
        _ algorithm: String,
        ciphertextBase64: String,
        secretKeyBase64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            guard self != nil else {
                reject("LIBOQS_ERROR", "Module deallocated", nil)
                return
            }

            do {
                guard let algo = LibOQSKEMAlgorithm(rawValue: algorithm) else {
                    throw LibOQSError.algorithmNotSupported(algorithm)
                }

                guard let ciphertext = Data(base64Encoded: ciphertextBase64) else {
                    throw LibOQSError.invalidInput
                }

                guard let secretKey = Data(base64Encoded: secretKeyBase64) else {
                    throw LibOQSError.invalidInput
                }

                let kem = try LibOQSKEM(algorithm: algo)
                let sharedSecret = try kem.decapsulate(ciphertext: ciphertext, secretKey: secretKey)

                resolve([
                    "sharedSecret": sharedSecret.base64EncodedString(),
                    "sharedSecretLength": sharedSecret.count
                ])
            } catch let error as LibOQSError {
                reject("LIBOQS_ERROR", error.errorDescription ?? "Unknown error", error)
            } catch {
                reject("LIBOQS_ERROR", error.localizedDescription, error)
            }
        }
    }

    // MARK: - Signature Operations

    /// Generate signature keypair
    /// JavaScript API: await LibOQS.sigGenerateKeypair(algorithm)
    @objc
    func sigGenerateKeypair(
        _ algorithm: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            guard self != nil else {
                reject("LIBOQS_ERROR", "Module deallocated", nil)
                return
            }

            do {
                guard let algo = LibOQSSIGAlgorithm(rawValue: algorithm) else {
                    throw LibOQSError.algorithmNotSupported(algorithm)
                }

                let sig = try LibOQSSIG(algorithm: algo)
                let keypair = try sig.generateKeypair()

                resolve([
                    "publicKey": keypair.publicKey.base64EncodedString(),
                    "secretKey": keypair.secretKey.base64EncodedString(),
                    "algorithm": algorithm,
                    "publicKeyLength": sig.publicKeyLength,
                    "secretKeyLength": sig.secretKeyLength
                ])
            } catch let error as LibOQSError {
                reject("LIBOQS_ERROR", error.errorDescription ?? "Unknown error", error)
            } catch {
                reject("LIBOQS_ERROR", error.localizedDescription, error)
            }
        }
    }

    /// Sign a message
    /// JavaScript API: await LibOQS.sigSign(algorithm, messageBase64, secretKeyBase64)
    @objc
    func sigSign(
        _ algorithm: String,
        messageBase64: String,
        secretKeyBase64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            guard self != nil else {
                reject("LIBOQS_ERROR", "Module deallocated", nil)
                return
            }

            do {
                guard let algo = LibOQSSIGAlgorithm(rawValue: algorithm) else {
                    throw LibOQSError.algorithmNotSupported(algorithm)
                }

                guard let message = Data(base64Encoded: messageBase64) else {
                    throw LibOQSError.invalidInput
                }

                guard let secretKey = Data(base64Encoded: secretKeyBase64) else {
                    throw LibOQSError.invalidInput
                }

                let sig = try LibOQSSIG(algorithm: algo)
                let signature = try sig.sign(message: message, secretKey: secretKey)

                resolve([
                    "signature": signature.base64EncodedString(),
                    "signatureLength": signature.count
                ])
            } catch let error as LibOQSError {
                reject("LIBOQS_ERROR", error.errorDescription ?? "Unknown error", error)
            } catch {
                reject("LIBOQS_ERROR", error.localizedDescription, error)
            }
        }
    }

    /// Verify a signature
    /// JavaScript API: await LibOQS.sigVerify(algorithm, messageBase64, signatureBase64, publicKeyBase64)
    @objc
    func sigVerify(
        _ algorithm: String,
        messageBase64: String,
        signatureBase64: String,
        publicKeyBase64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async { [weak self] in
            guard self != nil else {
                reject("LIBOQS_ERROR", "Module deallocated", nil)
                return
            }

            do {
                guard let algo = LibOQSSIGAlgorithm(rawValue: algorithm) else {
                    throw LibOQSError.algorithmNotSupported(algorithm)
                }

                guard let message = Data(base64Encoded: messageBase64) else {
                    throw LibOQSError.invalidInput
                }

                guard let signature = Data(base64Encoded: signatureBase64) else {
                    throw LibOQSError.invalidInput
                }

                guard let publicKey = Data(base64Encoded: publicKeyBase64) else {
                    throw LibOQSError.invalidInput
                }

                let sig = try LibOQSSIG(algorithm: algo)
                let isValid = try sig.verify(message: message, signature: signature, publicKey: publicKey)

                resolve([
                    "valid": isValid
                ])
            } catch let error as LibOQSError {
                reject("LIBOQS_ERROR", error.errorDescription ?? "Unknown error", error)
            } catch {
                reject("LIBOQS_ERROR", error.localizedDescription, error)
            }
        }
    }

    // MARK: - Utility Methods

    /// Get list of supported KEM algorithms
    /// JavaScript API: await LibOQS.getSupportedKEMAlgorithms()
    @objc
    func getSupportedKEMAlgorithms(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let algorithms = LibOQSKEMAlgorithm.allCases
            .filter { OQS_KEM_alg_is_enabled($0.cString) == 1 }
            .map { $0.rawValue }
        resolve(algorithms)
    }

    /// Get list of supported signature algorithms
    /// JavaScript API: await LibOQS.getSupportedSIGAlgorithms()
    @objc
    func getSupportedSIGAlgorithms(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let algorithms = LibOQSSIGAlgorithm.allCases
            .filter { OQS_SIG_alg_is_enabled($0.cString) == 1 }
            .map { $0.rawValue }
        resolve(algorithms)
    }

    /// Get library version
    /// JavaScript API: await LibOQS.getVersion()
    @objc
    func getVersion(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        if let version = OQS_version() {
            resolve(String(cString: version))
        } else {
            resolve("unknown")
        }
    }

    // MARK: - Module Configuration

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}
