// NativePoUW.m
// React Native Bridge for PoUW (Proof-of-Useful-Work)

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(RCTPoUW, NSObject)

RCT_EXTERN_METHOD(verifyContent:(id)contentId
                  bytes:(id)bytes
                  providerId:(id)providerId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(flush:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getPendingCount:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setNodeUrl:(id)nodeUrl
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getChallenge:(id)cap
                  maxBytes:(double)maxBytes
                  maxReceipts:(double)maxReceipts
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
