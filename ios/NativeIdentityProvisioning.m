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

@end
