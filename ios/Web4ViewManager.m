#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(Web4ViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(domain, NSString)
RCT_EXPORT_VIEW_PROPERTY(embeddedApp, NSString)
RCT_EXPORT_VIEW_PROPERTY(nodeHost, NSString)
RCT_EXPORT_VIEW_PROPERTY(nodePort, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(cacheLimitMb, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(allowHttpsExternal, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(onLoadStart, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onLoadEnd, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onNavigation, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onError, RCTDirectEventBlock)
@end
