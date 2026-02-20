# iOS PoUW Unit Tests (Phase 6)

Comprehensive unit test suite for the iOS Proof-of-Useful-Work (PoUW) modules.

## Test Files

### Core Test Files

| File | Description | Target Coverage |
|------|-------------|-----------------|
| `VerifierEngineTests.swift` | Tests hash, merkle, and signature verification | >95% |
| `ReceiptStoreTests.swift` | Tests Core Data persistence operations | >95% |
| `SubmissionClientTests.swift` | Tests QUIC communication and rate limiting | >90% |
| `PoUWControllerTests.swift` | Integration tests for the main controller | >90% |
| `ReceiptStateTests.swift` | Tests receipt state enum and transitions | 100% |
| `PoUWErrorTests.swift` | Tests error types and localized descriptions | 100% |

### Supporting Files

| File | Description |
|------|-------------|
| `PoUWMocks.swift` | Mock implementations for all protocols |

## Mock Classes

### MockVerifierEngine
- Mock implementation of `VerifierEngineProtocol`
- Configurable return values for all verification methods
- Call tracking for verification testing

### MockIdentitySigner
- Mock implementation of `IdentitySignerProtocol`
- Configurable mock DID, node ID, and public key
- Deterministic signature generation for testing

### MockReceiptStore
- In-memory mock of `ReceiptStoreProtocol`
- Supports all CRUD operations
- Error injection for failure testing

### MockSubmissionClient
- Mock implementation of `SubmissionClientProtocol`
- Configurable challenge token and submission responses
- Rate limiting simulation

## Running Tests

### Xcode
```bash
# Run all tests
Cmd+U

# Run specific test class
Select test class → Cmd+U

# Run individual test
Click diamond next to test method
```

### Command Line
```bash
# Navigate to iOS directory
cd ios

# Run tests via xcodebuild
xcodebuild test \
  -project SovereignNetworkMobile.xcodeproj \
  -scheme SovereignNetworkMobile \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -only-testing:SovereignNetworkMobileTests/PoUWTests
```

## Test Coverage Areas

### VerifierEngine Tests
- ✅ Hash verification (valid/invalid/empty)
- ✅ Merkle proof verification (single/multi-level)
- ✅ Signature verification edge cases
- ✅ Content verification integration
- ✅ Performance benchmarks (10k operations)

### ReceiptStore Tests
- ✅ Save and retrieve operations
- ✅ FIFO ordering with timestamp
- ✅ Retry count prioritization
- ✅ State transitions (queued → submitted → accepted/rejected)
- ✅ Batch state updates
- ✅ Deduplication by nonce
- ✅ Cleanup of old terminal receipts
- ✅ Error handling

### SubmissionClient Tests
- ✅ Challenge fetching
- ✅ Batch submission
- ✅ Rate limiting (window-based)
- ✅ Challenge validation (expiry)
- ✅ Batch validation (size, state)
- ✅ Error propagation

### PoUWController Tests
- ✅ Full verify-and-record flow
- ✅ Batch processing
- ✅ Flush receipts (success/partial/failure)
- ✅ Identity not found handling
- ✅ Verification failure handling
- ✅ Network error handling with retry state
- ✅ Pending count queries
- ✅ Cleanup operations

### ReceiptState Tests
- ✅ Raw value serialization
- ✅ isTerminal property
- ✅ canRetry property
- ✅ isPendingSubmission property
- ✅ Description localization
- ✅ State transition validation

### PoUWError Tests
- ✅ Error descriptions
- ✅ Recovery suggestions
- ✅ LocalizedError conformance
- ✅ Associated value handling

## Test Dependencies

### Required Frameworks
- `XCTest` - Testing framework
- `CryptoKit` - Hash computation
- `CoreData` - Persistence testing

### Module Imports
```swift
@testable import SovereignNetworkMobile
```

### FFI Dependencies (for integration tests)
- Blake3 hash function via `uhp_blake3`
- LibOQS for Dilithium signature verification

## Coverage Report Generation

```bash
# Generate coverage report
xcodebuild test \
  -project SovereignNetworkMobile.xcodeproj \
  -scheme SovereignNetworkMobile \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -enableCodeCoverage YES

# View report in Xcode
Open Report Navigator → Coverage
```

## Adding New Tests

1. Create test method in appropriate test class
2. Use `XCTestCase` naming convention: `test<Feature>_<Scenario>()`
3. Follow Given-When-Then structure:
   ```swift
   func testFeature_Scenario() {
       // Given: Setup conditions
       let input = ...
       
       // When: Execute action
       let result = ...
       
       // Then: Verify outcomes
       XCTAssertEqual(result, expected)
   }
   ```
4. Reset mock state in `tearDown()` if needed
5. Run tests to verify pass

## Continuous Integration

Tests should be run on:
- iOS Simulator (latest version)
- iOS Simulator (minimum supported version)
- Physical device (when available)

## Known Limitations

1. **Dilithium Signature Tests**: Valid signature tests require actual LibOQS integration and are covered in `LibOQSTests`
2. **QUIC Network Tests**: Full network tests require mock server or are tested via `MockSubmissionClient`
3. **Core Data Persistence**: Uses in-memory store for test isolation

## Related Documentation

- `DOMAIN_IMPLEMENTATION_SUMMARY.md` - Implementation overview
- `DOMAIN_REGISTRATION_IMPLEMENTATION.md` - Registration details
- `PoUWParityTests.swift` - Cross-platform compatibility requirements
