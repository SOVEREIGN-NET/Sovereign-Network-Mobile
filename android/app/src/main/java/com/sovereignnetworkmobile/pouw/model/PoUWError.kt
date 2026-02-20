package com.sovereignnetworkmobile.pouw.model

sealed class PoUWError(message: String) : Exception(message) {
    class InvalidContent : PoUWError("Invalid content")
    class VerificationFailed : PoUWError("Verification failed")
    class ChallengeExpired : PoUWError("Challenge expired")
    class NetworkError(cause: Throwable) : PoUWError("Network error: ${cause.message}")
    class SerializationError : PoUWError("Serialization failed")
    class StorageError(cause: Throwable) : PoUWError("Storage error: ${cause.message}")
    class SignatureError : PoUWError("Signature failed")
}
