import React from 'react';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useColorScheme } from 'react-native';
import { colors } from '../theme/tokens';

// Screens
import DashboardScreen from '../screens/DashboardScreen';
import IdentityScreen from '../screens/IdentityScreen';
import WalletScreen from '../screens/WalletScreen';
import DAOScreen from '../screens/DAOScreen';
import BrowserScreen from '../screens/BrowserScreen';
import SendTokensScreen from '../screens/SendTokensScreen';
import ReceiveTokensScreen from '../screens/ReceiveTokensScreen';
import ProposalDetailScreen from '../screens/ProposalDetailScreen';
import ClaimUBIScreen from '../screens/ClaimUBIScreen';
import StakeTokensScreen from '../screens/StakeTokensScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const DashboardStack = () => {
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
    >
      <Stack.Screen
        name="DashboardMain"
        component={DashboardScreen}
        options={{ title: 'ZHTP Dashboard' }}
      />
      <Stack.Screen
        name="ClaimUBI"
        component={ClaimUBIScreen}
        options={{ title: 'Claim UBI', headerBackTitle: 'Back' }}
      />
    </Stack.Navigator>
  );
};

const IdentityStack = () => {
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
      }}
    >
      <Stack.Screen
        name="IdentityMain"
        component={IdentityScreen}
        options={{ title: 'ZK-DID Identity' }}
      />
    </Stack.Navigator>
  );
};

const WalletStack = () => {
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
      }}
    >
      <Stack.Screen
        name="WalletMain"
        component={WalletScreen}
        options={{ title: 'Quantum Wallet' }}
      />
      <Stack.Screen
        name="SendTokens"
        component={SendTokensScreen}
        options={{ title: 'Send ZHTP', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="ReceiveTokens"
        component={ReceiveTokensScreen}
        options={{ title: 'Receive ZHTP', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="StakeTokens"
        component={StakeTokensScreen}
        options={{ title: 'Stake ZHTP', headerBackTitle: 'Back' }}
      />
    </Stack.Navigator>
  );
};

const DAOStack = () => {
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
      }}
    >
      <Stack.Screen
        name="DAOMain"
        component={DAOScreen}
        options={{ title: 'DAO Governance' }}
      />
      <Stack.Screen
        name="ProposalDetail"
        component={ProposalDetailScreen}
        options={{ title: 'Proposal Details', headerBackTitle: 'Back' }}
      />
    </Stack.Navigator>
  );
};

const BrowserStack = () => {
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
      }}
    >
      <Stack.Screen
        name="BrowserMain"
        component={BrowserScreen}
        options={{ title: 'Web4 Browser' }}
      />
    </Stack.Navigator>
  );
};

const RootNavigator = () => {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <NavigationContainer theme={theme}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.bg_dark,
            borderTopColor: colors.primary,
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.text_tertiary,
        }}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardStack}
          options={{
            title: 'Home',
            tabBarLabel: 'Home',
            tabBarTestID: 'tab-dashboard',
          }}
        />
        <Tab.Screen
          name="Identity"
          component={IdentityStack}
          options={{
            title: 'Identity',
            tabBarLabel: 'Identity',
            tabBarTestID: 'tab-identity',
          }}
        />
        <Tab.Screen
          name="Wallet"
          component={WalletStack}
          options={{
            title: 'Wallet',
            tabBarLabel: 'Wallet',
            tabBarTestID: 'tab-wallet',
          }}
        />
        <Tab.Screen
          name="DAO"
          component={DAOStack}
          options={{
            title: 'DAO',
            tabBarLabel: 'DAO',
            tabBarTestID: 'tab-dao',
          }}
        />
        <Tab.Screen
          name="Browser"
          component={BrowserStack}
          options={{
            title: 'Web4',
            tabBarLabel: 'Web4',
            tabBarTestID: 'tab-browser',
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
