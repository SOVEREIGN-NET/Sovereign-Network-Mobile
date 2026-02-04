#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NativeZhtpApi, NSObject)

RCT_EXTERN_METHOD(signIn:(NSString *)identityId
                  password:(NSString *)password
                  nodeUrl:(NSString *)nodeUrl
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(createIdentity:(NSString *)displayName
                  password:(NSString *)password
                  identityType:(NSString *)identityType
                  nodeUrl:(NSString *)nodeUrl
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(testConnection:(NSString *)nodeUrl
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getProtocolInfo:(NSString *)nodeUrl
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(recoverWithSeed:(NSString *)seedPhrase
                  nodeUrl:(NSString *)nodeUrl
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(recoverWithBackup:(NSString *)backupData
                  password:(NSString *)password
                  nodeUrl:(NSString *)nodeUrl
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(recoverWithSocial:(NSArray *)guardianIds
                  nodeUrl:(NSString *)nodeUrl
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
