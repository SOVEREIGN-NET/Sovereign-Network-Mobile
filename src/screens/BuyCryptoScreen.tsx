/**
 * BuyCryptoScreen
 * Coinme on-ramp integration — loads the Coinme widget in a WebView
 * so users can buy crypto with cash (US retail locations) or card.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { Text } from '../components';
import { colors, spacing, borderRadius } from '../theme/tokens';
import coinmeService from '../services/CoinmeService';

const BuyCryptoScreen = ({ navigation, route }: any) => {
  const walletAddress = route?.params?.walletAddress;
  const [widgetUrl, setWidgetUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    loadWidget();
  }, []);

  const loadWidget = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (coinmeService.isConfigured) {
        // Use authenticated session when credentials are available
        const session = await coinmeService.createWidgetSession({
          walletAddress,
          cryptocurrency: 'POL',
          fiatCurrency: 'USD',
        });
        setWidgetUrl(session.widgetUrl);
      } else {
        // Fallback: load widget directly (limited functionality)
        const url = coinmeService.buildDirectWidgetUrl({
          cryptocurrency: 'POL',
          walletAddress,
        });
        setWidgetUrl(url);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load';
      console.error('[BuyCryptoScreen] Widget load failed:', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      // Detect completion URLs from Coinme widget
      const { url } = navState;
      if (url.includes('status=complete') || url.includes('status=success')) {
        console.log('[BuyCryptoScreen] Transaction completed');
        navigation.goBack();
      }
    },
    [navigation],
  );

  if (loading && !widgetUrl) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.closeButton}
          >
            <Text style={styles.closeText}>X</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Buy Crypto</Text>
          <View style={styles.closeButton} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading Coinme...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.closeButton}
          >
            <Text style={styles.closeText}>X</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Buy Crypto</Text>
          <View style={styles.closeButton} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadWidget} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.closeButton}
        >
          <Text style={styles.closeText}>X</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Buy Crypto</Text>
        <View style={styles.closeButton} />
      </View>

      {widgetUrl && (
        <WebView
          ref={webViewRef}
          source={{ uri: widgetUrl }}
          style={styles.webview}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={syntheticEvent => {
            const { nativeEvent } = syntheticEvent;
            console.error('[BuyCryptoScreen] WebView error:', nativeEvent);
            setError('Failed to load payment page. Please try again.');
          }}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={styles.webviewLoading}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          )}
          // Allow Coinme to handle camera for ID verification
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
        />
      )}

      {loading && widgetUrl && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="small" color={colors.text_secondary} />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg_darkest,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.text_primary,
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.full,
  },
  closeText: {
    color: colors.text_secondary,
    fontSize: 18,
    fontWeight: '600',
  },
  webview: {
    flex: 1,
    backgroundColor: colors.bg_darkest,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  loadingText: {
    color: colors.text_secondary,
    marginTop: spacing.md,
    fontSize: 14,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.base,
  },
  retryText: {
    color: colors.text_primary,
    fontSize: 14,
    fontWeight: '600',
  },
  webviewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg_darkest,
  },
  overlay: {
    position: 'absolute',
    top: 60,
    right: spacing.md,
  },
});

export default BuyCryptoScreen;
