// NativeMessaging.m — RCT bridge declarations for NativeMessaging.swift.

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NativeMessaging, NSObject)

// Session lifecycle

RCT_EXTERN_METHOD(initiateSession:(NSString *)localDid
                  remoteDid:(NSString *)remoteDid
                  remoteKyberPkB64:(NSString *)remoteKyberPkB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(acceptSession:(NSString *)localDid
                  remoteDid:(NSString *)remoteDid
                  kyberCtB64:(NSString *)kyberCtB64
                  localKyberSkB64:(NSString *)localKyberSkB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(rekeySession:(NSString *)sessionId
                  remoteKyberPkB64:(NSString *)remoteKyberPkB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(acceptRekey:(NSString *)sessionId
                  kyberCtB64:(NSString *)kyberCtB64
                  localKyberSkB64:(NSString *)localKyberSkB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(freeSession:(NSString *)sessionId)

// Session inspection

RCT_EXTERN_METHOD(getSessionInfo:(NSString *)sessionId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(serializeSession:(NSString *)sessionId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deserializeSession:(NSString *)sessionB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// Sealing

RCT_EXTERN_METHOD(sealText:(NSString *)sessionId
                  text:(NSString *)text
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(sealBinary:(NSString *)sessionId
                  contentTypeTag:(nonnull NSNumber *)contentTypeTag
                  dataB64:(NSString *)dataB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(sealKeyExchange:(NSString *)senderDid
                  recipientDid:(NSString *)recipientDid
                  kyberCtB64:(NSString *)kyberCtB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// Open / sign / verify

RCT_EXTERN_METHOD(envelopeOpen:(NSString *)envelopeB64
                  chainKeyB64:(NSString *)chainKeyB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(envelopeOpenText:(NSString *)envelopeB64
                  chainKeyB64:(NSString *)chainKeyB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(envelopeSign:(NSString *)envelopeB64
                  dilithiumSkB64:(NSString *)dilithiumSkB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(envelopeVerify:(NSString *)envelopeB64
                  dilithiumPkB64:(NSString *)dilithiumPkB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// Wire format / inspection

RCT_EXTERN_METHOD(envelopeToHex:(NSString *)envelopeB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(envelopeFromHex:(NSString *)hex
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(envelopeDescribe:(NSString *)envelopeB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// Identity-aware variants

RCT_EXTERN_METHOD(sealTextSigned:(NSString *)sessionId
                  text:(NSString *)text
                  senderDid:(NSString *)senderDid
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(sealBinarySigned:(NSString *)sessionId
                  contentTypeTag:(nonnull NSNumber *)contentTypeTag
                  dataB64:(NSString *)dataB64
                  senderDid:(NSString *)senderDid
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(sealKeyExchangeSigned:(NSString *)senderDid
                  recipientDid:(NSString *)recipientDid
                  kyberCtB64:(NSString *)kyberCtB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(acceptSessionWithIdentity:(NSString *)localDid
                  remoteDid:(NSString *)remoteDid
                  kyberCtB64:(NSString *)kyberCtB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(acceptRekeyWithIdentity:(NSString *)sessionId
                  kyberCtB64:(NSString *)kyberCtB64
                  localDid:(NSString *)localDid
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(envelopeOpenVerified:(NSString *)envelopeB64
                  chainKeyB64:(NSString *)chainKeyB64
                  peerDilithiumPkB64:(NSString *)peerDilithiumPkB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(envelopeOpenVerifiedText:(NSString *)envelopeB64
                  chainKeyB64:(NSString *)chainKeyB64
                  peerDilithiumPkB64:(NSString *)peerDilithiumPkB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(acceptEnvelopeWithIdentity:(NSString *)localDid
                  remoteDid:(NSString *)remoteDid
                  envelopeB64:(NSString *)envelopeB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(acceptRekeyEnvelopeWithIdentity:(NSString *)sessionId
                  envelopeB64:(NSString *)envelopeB64
                  localDid:(NSString *)localDid
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
