// NativeLobbyAuth.m — RCT bridge declarations for NativeLobbyAuth.swift.

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NativeLobbyAuth, NSObject)

RCT_EXTERN_METHOD(opaqueRegisterStart:(NSString *)password
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(opaqueRegisterFinish:(NSString *)stateId
                  password:(NSString *)password
                  serverMsgB64:(NSString *)serverMsgB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(opaqueRegisterCancel:(NSString *)stateId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(opaqueLoginStart:(NSString *)password
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(opaqueLoginFinish:(NSString *)stateId
                  password:(NSString *)password
                  serverMsgB64:(NSString *)serverMsgB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(opaqueLoginCancel:(NSString *)stateId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(lobbyMacCompute:(NSString *)sessionKeyB64
                  method:(nonnull NSNumber *)method
                  uri:(NSString *)uri
                  bodyB64:(NSString *)bodyB64
                  seq:(nonnull NSNumber *)seq
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
