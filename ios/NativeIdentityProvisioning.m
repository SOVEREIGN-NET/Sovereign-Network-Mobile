#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NativeIdentityProvisioning, NSObject)

RCT_EXTERN_METHOD(generateLocalIdentity:(NSString *)displayName
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(provisionIdentity:(NSString *)displayName
                  serverUrl:(NSString *)serverUrl
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(createRegistrationProof:(NSString *)displayName
                  didData:(NSDictionary *)didData
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(storeProvisionedIdentity:(NSString *)identityId
                  didData:(NSDictionary *)didData
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(restoreIdentityToHandleStore:(NSString *)identityId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getSeedPhraseForBackup:(NSString *)did
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(restoreIdentityFromPhrase:(NSString *)phrase
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(cleanKeystoreDirectory)

RCT_EXTERN_METHOD(signTokenCreateTransaction:(NSDictionary *)params
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(signTokenMintTransaction:(NSDictionary *)params
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(signTokenTransferTransaction:(NSDictionary *)params
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(signSovWalletTransferTransaction:(NSDictionary *)params
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(signDomainRegisterRequest:(NSDictionary *)params
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(signDomainUpdateRequest:(NSDictionary *)params
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(signDomainTransferRequest:(NSDictionary *)params
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(signMessage:(NSString *)message
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(signMessageForDid:(NSString *)did
                  message:(NSString *)message
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(signMessageFromSeed:(NSString *)phrase
                  message:(NSString *)message
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setFeeConfig:(NSString *)configJson
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(quoteFeeForTxHex:(NSString *)txHex
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getCurrentIdentityDid:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getLocalIdentity:(NSString *)identityIdOrDid
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
