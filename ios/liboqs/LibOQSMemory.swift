import Foundation

// MARK: - Memory Management Utilities

final class LibOQSMemory {
    /// Allocate memory using liboqs allocator
    static func alloc(size: Int) -> UnsafeMutableRawPointer? {
        return OQS_MEM_malloc(size)
    }

    /// Securely free memory: zero then deallocate
    /// Always use for sensitive data (keys, shared secrets)
    static func secureFree(_ pointer: UnsafeMutableRawPointer?, size: Int) {
        guard let ptr = pointer else { return }
        OQS_MEM_secure_free(ptr, size)
    }

    /// Free without cleansing (for non-sensitive data)
    static func insecureFree(_ pointer: UnsafeMutableRawPointer?) {
        guard let ptr = pointer else { return }
        OQS_MEM_insecure_free(ptr)
    }

    /// Constant-time memory comparison
    static func secureCompare(_ a: UnsafeRawPointer?, _ b: UnsafeRawPointer?, _ len: Int) -> Bool {
        guard let a = a, let b = b else { return false }
        return OQS_MEM_secure_bcmp(a, b, len) == 0
    }

    // MARK: - RAII Secure Buffer Wrapper

    /// Automatic RAII buffer for secure memory management
    /// Allocates on init, cleanses and frees on deinit
    /// Ensures cleanup even if error is thrown
    class SecureBuffer {
        private let pointer: UnsafeMutableRawPointer
        private let size: Int
        private let isSecure: Bool

        /// Initialize secure buffer with given size
        /// - Parameter size: Number of bytes to allocate
        /// - Returns: nil if allocation failed
        init?(size: Int, secure: Bool = true) {
            guard size > 0 else { return nil }

            guard let ptr = LibOQSMemory.alloc(size: size) else {
                return nil
            }

            self.pointer = ptr
            self.size = size
            self.isSecure = secure
        }

        deinit {
            if isSecure {
                LibOQSMemory.secureFree(pointer, size: size)
            } else {
                LibOQSMemory.insecureFree(pointer)
            }
        }

        /// Get raw pointer for passing to C functions
        var raw: UnsafeMutableRawPointer {
            return pointer
        }

        /// Get typed pointer (UInt8)
        var bytes: UnsafeMutablePointer<UInt8> {
            return pointer.assumingMemoryBound(to: UInt8.self)
        }

        /// Convert buffer contents to Swift Data
        func toData() -> Data {
            return Data(bytes: pointer, count: size)
        }

        /// Get buffer size
        var count: Int {
            return size
        }

        /// Fill buffer with zeros (for non-secure buffers that need explicit cleanup)
        func zero() {
            memset(pointer, 0, size)
        }
    }
}

// MARK: - Thread-Safe Initialization

private let oqsInitLock = NSLock()
private var oqsInitialized = false

/// Initialize liboqs library (thread-safe)
/// Call once at app startup
func LibOQS_Init() {
    oqsInitLock.lock()
    defer { oqsInitLock.unlock() }

    guard !oqsInitialized else { return }
    OQS_init()
    oqsInitialized = true
}

/// Clean up liboqs library
/// Call once at app shutdown
func LibOQS_Destroy() {
    oqsInitLock.lock()
    defer { oqsInitLock.unlock() }

    guard oqsInitialized else { return }
    OQS_destroy()
    oqsInitialized = false
}

/// Per-thread cleanup for liboqs
/// Call before exiting thread if thread was used for OQS operations
func LibOQS_ThreadStop() {
    OQS_thread_stop()
}
