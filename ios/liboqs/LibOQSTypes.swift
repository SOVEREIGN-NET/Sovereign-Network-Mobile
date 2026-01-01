import Foundation

// MARK: - KEM Algorithm Identifiers

enum LibOQSKEMAlgorithm: String, CaseIterable {
    // NIST Standardized
    case mlkem768 = "ML-KEM-768"
    case mlkem1024 = "ML-KEM-1024"

    // Compatibility names
    case kyber768 = "Kyber768"
    case kyber1024 = "Kyber1024"

    // Additional KEM algorithms
    case frodokem640aes = "FrodoKEM-640-AES"
    case frodokem640shake = "FrodoKEM-640-SHAKE"
    case frodokem976aes = "FrodoKEM-976-AES"
    case frodokem976shake = "FrodoKEM-976-SHAKE"

    var cString: UnsafePointer<CChar> {
        return (self.rawValue as NSString).utf8String!
    }
}

// MARK: - Signature Algorithm Identifiers

enum LibOQSSIGAlgorithm: String, CaseIterable {
    // NIST Standardized
    case mldsa65 = "ML-DSA-65"
    case mldsa87 = "ML-DSA-87"

    // Compatibility names
    case dilithium3 = "Dilithium3"
    case dilithium5 = "Dilithium5"

    // Additional signature algorithms
    case falcon512 = "Falcon-512"
    case falcon1024 = "Falcon-1024"
    case sphincssha2128f = "SPHINCS+-SHA2-128f"
    case sphincssha2256f = "SPHINCS+-SHA2-256f"

    var cString: UnsafePointer<CChar> {
        return (self.rawValue as NSString).utf8String!
    }
}

// MARK: - Cryptographic Result Types

struct LibOQSKeypair {
    let publicKey: Data
    let secretKey: Data
}

struct LibOQSEncapsulation {
    let ciphertext: Data
    let sharedSecret: Data
}

// MARK: - Error Types

enum LibOQSError: LocalizedError {
    case algorithmNotSupported(String)
    case operationFailed(String)
    case memoryAllocationFailed
    case invalidKeyLength
    case invalidInput
    case moduleDeallocated
    case invalidOperation

    var errorDescription: String? {
        switch self {
        case .algorithmNotSupported(let alg):
            return "Algorithm not supported: \(alg)"
        case .operationFailed(let reason):
            return "Operation failed: \(reason)"
        case .memoryAllocationFailed:
            return "Memory allocation failed"
        case .invalidKeyLength:
            return "Invalid key length"
        case .invalidInput:
            return "Invalid input data"
        case .moduleDeallocated:
            return "Module was deallocated"
        case .invalidOperation:
            return "Invalid operation"
        }
    }

    var recoverySuggestion: String? {
        switch self {
        case .algorithmNotSupported:
            return "Verify the algorithm name is correct"
        case .memoryAllocationFailed:
            return "Check available memory"
        case .invalidKeyLength:
            return "Ensure key length matches algorithm requirements"
        case .invalidInput:
            return "Verify input data format (base64 for bridge, Data for Swift)"
        default:
            return nil
        }
    }
}
