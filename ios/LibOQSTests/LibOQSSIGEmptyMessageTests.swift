import XCTest
@testable import SovereignNetworkMobile

final class LibOQSSIGEmptyMessageTests: XCTestCase {
    override func setUp() {
        super.setUp()
        LibOQS_Init()
    }

    override func tearDown() {
        LibOQS_Destroy()
        super.tearDown()
    }

    func testSignVerifyEmptyMessage() throws {
        let algorithm: LibOQSSIGAlgorithm = .mldsa65
        guard OQS_SIG_alg_is_enabled(algorithm.cString) == 1 else {
            throw XCTSkip("Algorithm not enabled in this build: \(algorithm.rawValue)")
        }

        let sig = try LibOQSSIG(algorithm: algorithm)
        let keypair = try sig.generateKeypair()
        let message = Data()
        let signature = try sig.sign(message: message, secretKey: keypair.secretKey)
        let isValid = try sig.verify(message: message, signature: signature, publicKey: keypair.publicKey)

        XCTAssertTrue(isValid)
    }
}
