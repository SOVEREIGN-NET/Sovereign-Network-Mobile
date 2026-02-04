/**
 * AuthNavigator
 * Navigation stack for unauthenticated users
 * Shows SignIn, CreateIdentity, and RecoverIdentity screens with proper back button support
 */

import React from 'react';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useColorScheme } from 'react-native';
import { colors } from '../theme/tokens';
import { useTranslation } from '../i18n';
import type { Identity } from '../services/MockAuthService';
import SignInScreen from '../screens/SignInScreen';
import CreateIdentityScreen from '../screens/CreateIdentityScreen';
import RecoverIdentityScreen from '../screens/RecoverIdentityScreen';
import SeedPhraseScreen from '../screens/SeedPhraseScreen';

const Stack = createNativeStackNavigator();

export type AuthStackParamList = {
  SignIn: undefined;
  CreateIdentity: undefined;
  RecoverIdentity: undefined;
  SeedPhrase: {
    seedPhrases: string[];
    identity?: Identity;
  };
};

/**
 * AuthNavigatorContent component that uses translations
 */
const AuthNavigatorContent: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.bg_dark,
        },
        headerTintColor: colors.primary,
        headerTitleStyle: {
          fontWeight: 'bold',
          color: colors.text_primary,
        },
      } as any}
      initialRouteName="SignIn"
    >
      <Stack.Screen
        name="SignIn"
        component={SignInScreen as any}
        options={{ title: t.auth.signIn.title }}
      />
      <Stack.Screen
        name="CreateIdentity"
        component={CreateIdentityScreen as any}
        options={{ title: t.auth.createIdentity.title }}
      />
      <Stack.Screen
        name="RecoverIdentity"
        component={RecoverIdentityScreen as any}
        options={{ title: t.auth.recoverIdentity.title }}
      />
      <Stack.Screen
        name="SeedPhrase"
        component={SeedPhraseScreen as any}
        options={{ title: t.auth.seedPhrase.screenTitle }}
      />
    </Stack.Navigator>
  );
};

const AuthNavigator: React.FC = () => {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <NavigationContainer theme={theme}>
      <AuthNavigatorContent />
    </NavigationContainer>
  );
};

export default AuthNavigator;
