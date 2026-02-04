/**
 * DEPRECATED: Domain signing methods have been moved to NativeIdentityProvisioning.swift
 *
 * This file is kept for reference only. All domain transaction signing methods are now
 * implemented directly in the main class:
 * - signDomainRegisterTransaction()
 * - signDomainUpdateTransaction()
 *
 * These methods use ZhtpClient.buildDomainRegister() and ZhtpClient.buildDomainUpdate()
 * which need to be implemented in the lib-client Rust bindings.
 *
 * See: NativeIdentityProvisioning.swift lines ~818-930
 */
