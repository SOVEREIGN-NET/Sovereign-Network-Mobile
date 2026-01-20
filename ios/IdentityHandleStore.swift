// IdentityHandleStore.swift
// Thread-safe store for managing Identity object lifecycle
// Prevents Identity objects from being deallocated while signing operations are in progress

import Foundation

/// Thread-safe store for maintaining Identity object references
///
/// The Rust lib-client keeps opaque IdentityHandle pointers that reference
/// Identity objects. This store ensures those objects remain in memory for
/// the lifetime of their usage, preventing premature deallocation.
///
/// Uses Any to avoid circular dependencies with ZhtpClient.swift
///
/// Usage:
/// ```swift
/// let identity = try ZhtpClient.generateIdentity(deviceId: "device-123")
/// try IdentityHandleStore.shared.store(identity: identity, did: identity.did)
/// // Later, retrieve for signing:
/// if let identity = IdentityHandleStore.shared.retrieve(by: did) as? Identity {
///     let signature = try identity.signUhpChallenge(challenge)
/// }
/// ```
public class IdentityHandleStore {
    public static let shared = IdentityHandleStore()

    private var identities: [String: Any] = [:]
    private let queue = DispatchQueue(label: "com.sovereign.identity-handle-store", attributes: .concurrent)

    private init() {}

    /// Store an identity by its DID and optional identity_id
    ///
    /// - Parameters:
    ///   - identity: The Identity object to store (type Any to avoid circular dependency)
    ///   - did: Optional DID identifier. If not provided, extracts from Identity.did if possible
    ///   - identityId: Optional identity_id hash for lookup during handshake
    public func store(identity: Any, did: String? = nil, identityId: String? = nil) throws {
        let actualDid: String

        if let did = did {
            actualDid = did
        } else if let id = identity as? Identity {
            actualDid = id.did
        } else {
            throw NSError(domain: "IdentityHandleStore", code: -1, userInfo: [
                NSLocalizedDescriptionKey: "Cannot determine DID: provide did parameter or pass an Identity object"
            ])
        }

        queue.sync(flags: .barrier) {
            // Store by DID (primary key)
            identities[actualDid] = identity

            // Also store by identity_id hash if provided (for handshake lookup)
            if let idHash = identityId {
                identities[idHash] = identity
            }
        }
    }

    /// Retrieve an identity by its DID
    ///
    /// - Parameters:
    ///   - did: The DID of the identity to retrieve
    /// - Returns: The Identity object as Any, or nil if not found
    public func retrieve(by did: String) -> Any? {
        return queue.sync {
            identities[did]
        }
    }

    /// Remove an identity from the store
    ///
    /// - Parameters:
    ///   - did: The DID of the identity to remove
    public func remove(by did: String) {
        queue.sync(flags: .barrier) {
            identities.removeValue(forKey: did)
        }
    }

    /// Check if an identity exists in the store
    ///
    /// - Parameters:
    ///   - did: The DID to check
    /// - Returns: True if the identity exists
    public func exists(by did: String) -> Bool {
        return queue.sync {
            identities[did] != nil
        }
    }

    /// Get the count of stored identities
    public var count: Int {
        return queue.sync {
            identities.count
        }
    }

    /// Clear all stored identities
    public func clear() {
        queue.sync(flags: .barrier) {
            identities.removeAll()
        }
    }
}
