#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LibOQS, NSObject)

// KEM Operations
RCT_EXTERN_METHOD(kemGenerateKeypair:(NSString *)algorithm
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(kemEncapsulate:(NSString *)algorithm
                  publicKeyBase64:(NSString *)publicKeyBase64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(kemDecapsulate:(NSString *)algorithm
                  ciphertextBase64:(NSString *)ciphertextBase64
                  secretKeyBase64:(NSString *)secretKeyBase64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// Signature Operations
RCT_EXTERN_METHOD(sigGenerateKeypair:(NSString *)algorithm
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(sigSign:(NSString *)algorithm
                  messageBase64:(NSString *)messageBase64
                  secretKeyBase64:(NSString *)secretKeyBase64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(sigVerify:(NSString *)algorithm
                  messageBase64:(NSString *)messageBase64
                  signatureBase64:(NSString *)signatureBase64
                  publicKeyBase64:(NSString *)publicKeyBase64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// Utility Methods
RCT_EXTERN_METHOD(getSupportedKEMAlgorithms:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getSupportedSIGAlgorithms:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getVersion:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
