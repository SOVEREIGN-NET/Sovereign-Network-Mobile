/**
 * ZHTP Web4 Mobile App
 * React Native cross-platform application for Web4 decentralized internet
 */

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar, View } from 'react-native';
import {
  AuthProvider,
  AuthContext,
  ThemeProvider,
  useTheme,
  ApiProvider,
} from './src/context';
import RootNavigator from './src/navigation/RootNavigator';
import { colors } from './src/theme';
import { Text } from './src/components'; // NavigationContainer is handled by each navigator
import { useTranslation } from './src/i18n';
import { config } from './src/config';
import { installLogGuard } from './src/utils/logging';
import { useNodeConnectionStatus } from './src/hooks/useNodeConnectionStatus';
import { useChainReregistration } from './src/hooks/useChainReregistration';

installLogGuard();

/**
 * AppContent component that uses auth context to determine which navigator to show
 */
function AppContent() {
  const { t } = useTranslation();
  const authContext = React.useContext(AuthContext);

  if (!authContext) {
    // This shouldn't happen if AuthProvider is properly wrapping the app
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
        <Text>{t.app.error}</Text>
      </View>
    );
  }

  const { isBootstrapping, currentIdentity, setCurrentIdentity } = authContext;

  // Connection status for chain detection
  const { isConnected } = useNodeConnectionStatus(true);

  // Transparent chain re-registration
  const { status: chainStatus } = useChainReregistration(
    isConnected,
    currentIdentity,
    setCurrentIdentity,
  );

  // Show loading indicator while checking auth state
  if (isBootstrapping) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg_darkest,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text variant="h2" style={{ color: colors.primary }}>
          {t.app.title}
        </Text>
        <Text
          variant="body"
          style={{
            color: colors.text_secondary,
            marginTop: 16,
          }}
        >
          {t.app.loading}
        </Text>
      </View>
    );
  }

  // Show syncing state during chain re-registration (spec: section 4)
  if (chainStatus === 'syncing') {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg_darkest,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text variant="h2" style={{ color: colors.primary }}>
          {t.app.title}
        </Text>
        <Text
          variant="body"
          style={{
            color: colors.text_secondary,
            marginTop: 16,
          }}
        >
          Syncing your account...
        </Text>
      </View>
    );
  }

  // Show appropriate navigator based on auth state
  // Always show RootNavigator - individual screens handle auth state
  // This allows guests to browse public content (trending apps, explorer, DAO)
  return <RootNavigator />;
}

/**
 * App content with theme context available
 */
function AppWithTheme() {
  const { colors: themeColors } = useTheme();

  return (
    <>
      <StatusBar
        barStyle="light-content"
        backgroundColor={themeColors.bg_darkest}
      />
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </>
  );
}

/**
 * Root App component with providers
 */
function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ApiProvider zhtpNodeUrl={config.ZHTP_NODE_URL}>
          <AppWithTheme />
        </ApiProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default App;
