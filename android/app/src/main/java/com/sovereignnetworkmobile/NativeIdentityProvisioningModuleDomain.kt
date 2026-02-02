/**
 * NativeIdentityProvisioning Domain Signing Methods - INTEGRATED
 *
 * Domain transaction signing methods have been integrated directly into:
 * NativeIdentityProvisioning.kt
 *
 * Methods:
 * - signDomainRegisterTransaction(params: ReadableMap, promise: Promise)
 * - signDomainUpdateTransaction(params: ReadableMap, promise: Promise)
 *
 * Pattern matches token signing:
 * 1. Extract parameters from ReadableMap
 * 2. Get identity via getLatestIdentity()
 * 3. Call nativeBuildDomainRegister/nativeBuildDomainUpdate JNI functions
 * 4. Resolve with hex-encoded signed transaction
 *
 * JNI Declarations:
 * - nativeBuildDomainRegister(identityJson: String, domain: String, durationDays: Int, chainId: Int): String?
 * - nativeBuildDomainUpdate(identityJson: String, domain: String, contentCid: String, chainId: Int): String?
 *
 * Private keys remain in Rust lib-client and never reach Kotlin/JavaScript layer.
 */
