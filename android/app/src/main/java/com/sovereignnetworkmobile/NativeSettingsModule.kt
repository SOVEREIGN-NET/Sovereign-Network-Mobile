package com.sovereignnetworkmobile

import android.content.Context
import android.content.SharedPreferences
import com.facebook.react.bridge.*

/**
 * Native Settings Module for Android
 * Provides access to SharedPreferences for developer settings
 * Syncs with native Android Settings preferences
 */
class NativeSettingsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private val sharedPreferences: SharedPreferences =
      reactContext.getSharedPreferences("sovereign_settings", Context.MODE_PRIVATE)

  override fun getName(): String {
    return "NativeSettings"
  }

  /**
   * Get string value from SharedPreferences
   */
  @ReactMethod
  fun getString(key: String, promise: Promise) {
    try {
      val value = sharedPreferences.getString(key, null)
      if (value != null) {
        promise.resolve(value)
      } else {
        promise.resolve(null)
      }
    } catch (e: Exception) {
      promise.reject("GET_STRING_ERROR", e.message)
    }
  }

  /**
   * Set string value in SharedPreferences
   */
  @ReactMethod
  fun setString(key: String, value: String, promise: Promise) {
    try {
      sharedPreferences.edit().putString(key, value).apply()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SET_STRING_ERROR", e.message)
    }
  }

  /**
   * Get boolean value from SharedPreferences
   */
  @ReactMethod
  fun getBoolean(key: String, promise: Promise) {
    try {
      val hasKey = sharedPreferences.contains(key)
      if (hasKey) {
        val value = sharedPreferences.getBoolean(key, false)
        promise.resolve(value)
      } else {
        promise.resolve(null)
      }
    } catch (e: Exception) {
      promise.reject("GET_BOOLEAN_ERROR", e.message)
    }
  }

  /**
   * Set boolean value in SharedPreferences
   */
  @ReactMethod
  fun setBoolean(key: String, value: Boolean, promise: Promise) {
    try {
      sharedPreferences.edit().putBoolean(key, value).apply()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SET_BOOLEAN_ERROR", e.message)
    }
  }

  /**
   * Get all developer settings
   */
  @ReactMethod
  fun getAllSettings(promise: Promise) {
    try {
      val useMockData = sharedPreferences.getBoolean("useMockData", true)
      val nodeUrl = sharedPreferences.getString("nodeUrl", "http://192.168.1.31:9333")

      val settings = WritableNativeMap()
      settings.putBoolean("useMockData", useMockData)
      settings.putString("nodeUrl", nodeUrl ?: "http://192.168.1.31:9333")

      promise.resolve(settings)
    } catch (e: Exception) {
      promise.reject("GET_ALL_SETTINGS_ERROR", e.message)
    }
  }

  /**
   * Update multiple settings at once
   */
  @ReactMethod
  fun updateSettings(settings: ReadableMap, promise: Promise) {
    try {
      val editor = sharedPreferences.edit()

      val iterator = settings.keySetIterator()
      while (iterator.hasNextKey()) {
        val key = iterator.nextKey()

        when {
          settings.isNull(key) -> editor.remove(key)
          else -> {
            try {
              val boolValue = settings.getBoolean(key)
              editor.putBoolean(key, boolValue)
            } catch (e: Exception) {
              try {
                val stringValue = settings.getString(key)
                if (stringValue != null) {
                  editor.putString(key, stringValue)
                }
              } catch (e2: Exception) {
                // Skip values that can't be converted
              }
            }
          }
        }
      }

      editor.apply()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("UPDATE_SETTINGS_ERROR", e.message)
    }
  }

  /**
   * Clear all developer settings
   */
  @ReactMethod
  fun clearSettings(promise: Promise) {
    try {
      sharedPreferences.edit().remove("useMockData").remove("nodeUrl").apply()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("CLEAR_SETTINGS_ERROR", e.message)
    }
  }
}
