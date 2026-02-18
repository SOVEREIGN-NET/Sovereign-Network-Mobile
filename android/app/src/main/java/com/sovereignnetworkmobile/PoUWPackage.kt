package com.sovereignnetworkmobile

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * React Package for PoUW (Proof-of-Useful-Work)
 * Phase 4: React Native Bridge
 *
 * Registers the PoUWModule with React Native's module system.
 *
 * Usage: Add to MainApplication.kt's getPackages() method:
 * ```kotlin
 * override fun getPackages(): List<ReactPackage> {
 *     return PackageList(this).packages.apply {
 *         add(PoUWPackage())
 *     }
 * }
 * ```
 */
class PoUWPackage : ReactPackage {

    /**
     * Create native modules for React Native
     */
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(PoUWModule(reactContext))
    }

    /**
     * Create view managers (none for PoUW)
     */
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
