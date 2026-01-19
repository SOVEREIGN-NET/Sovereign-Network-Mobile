#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NativeIdentityProvisioning, NSObject)

RCT_EXTERN_METHOD(generateLocalIdentity:(NSString *)displayName
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(registerWithServer:(NSDictionary *)identityData
                  displayName:(NSString *)displayName
                  serverUrl:(NSString *)serverUrl
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(provisionIdentity:(NSString *)displayName
                  serverUrl:(NSString *)serverUrl
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
