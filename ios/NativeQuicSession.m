// NativeQuicSession.m — RCT bridge declarations for NativeQuicSession.swift.

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(NativeQuicSession, RCTEventEmitter)

RCT_EXTERN_METHOD(openSession:(NSString *)identityDid
                  host:(NSString *)host
                  port:(nonnull NSNumber *)port
                  alpn:(nonnull NSNumber *)alpn
                  sni:(NSString *)sni
                  spkiPinHex:(NSString *)spkiPinHex
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(closeSession:(NSString *)sessionId)

RCT_EXTERN_METHOD(rpc:(NSString *)sessionId
                  method:(NSString *)method
                  path:(NSString *)path
                  headersJson:(NSString *)headersJson
                  bodyB64:(NSString *)bodyB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(openInbound:(NSString *)sessionId
                  path:(NSString *)path
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(closeInbound:(NSString *)streamId)

@end
