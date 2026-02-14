package com.sovereignnetworkmobile.web4

import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class Web4ViewManager : SimpleViewManager<Web4ReactWebView>() {
    override fun getName() = "Web4View"

    override fun createViewInstance(reactContext: ThemedReactContext): Web4ReactWebView {
        return Web4ReactWebView(reactContext)
    }

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any>? {
        return MapBuilder.builder<String, Any>()
            .put("onLoadStart", MapBuilder.of("registrationName", "onLoadStart"))
            .put("onLoadEnd", MapBuilder.of("registrationName", "onLoadEnd"))
            .put("onError", MapBuilder.of("registrationName", "onError"))
            .put("onNavigation", MapBuilder.of("registrationName", "onNavigation"))
            .build()
    }

    @ReactProp(name = "domain")
    fun setDomain(view: Web4ReactWebView, domain: String?) = view.setDomain(domain)

    @ReactProp(name = "embeddedApp")
    fun setEmbeddedApp(view: Web4ReactWebView, app: String?) = view.setEmbeddedApp(app)

    @ReactProp(name = "nodeHost")
    fun setNodeHost(view: Web4ReactWebView, host: String?) = view.setNodeHost(host)

    @ReactProp(name = "nodePort", defaultInt = 0)
    fun setNodePort(view: Web4ReactWebView, port: Int) = view.setNodePort(port)

    @ReactProp(name = "cacheLimitMb", defaultInt = 150)
    fun setCacheLimit(view: Web4ReactWebView, limit: Int) = view.setCacheLimitMb(limit)

    @ReactProp(name = "allowHttpsExternal", defaultBoolean = false)
    fun setAllowHttpsExternal(view: Web4ReactWebView, allow: Boolean) = view.setAllowHttpsExternal(allow)
}
