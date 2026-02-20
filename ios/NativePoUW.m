// NativePoUW.m
// React Native Bridge for PoUW (Proof-of-Useful-Work)

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(RCTPoUW, NSObject)

RCT_EXTERN_METHOD(verifyContent:(NSString *)contentId
                  bytes:(NSString *)bytes
                  providerId:(NSString *)providerId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(flush:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getPendingCount:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setNodeUrl:(NSString *)nodeUrl
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getChallenge:(NSString *)cap
                  maxBytes:(double)maxBytes
                  maxReceipts:(double)maxReceipts
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
