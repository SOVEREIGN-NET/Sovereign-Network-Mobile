import React from 'react';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useColorScheme, View } from 'react-native';
import { colors } from '../theme/tokens';

// Screens
import DashboardScreen from '../screens/DashboardScreen';
import IdentityScreen from '../screens/IdentityScreen';
import ProfileEditScreen from '../screens/ProfileEditScreen';
import IdentitySettingsScreen from '../screens/IdentitySettingsScreen';
import WalletScreen from '../screens/WalletScreen';
import DAOScreen from '../screens/DAOScreen';
import BrowserScreen from '../screens/BrowserScreen';
import SendTokensScreen from '../screens/SendTokensScreen';
import ReceiveTokensScreen from '../screens/ReceiveTokensScreen';
import ConfirmTransactionScreen from '../screens/ConfirmTransactionScreen';
import ProposalDetailScreen from '../screens/ProposalDetailScreen';
import CreateProposalScreen from '../screens/CreateProposalScreen';
import TreasuryStatusScreen from '../screens/TreasuryStatusScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ClaimUBIScreen from '../screens/ClaimUBIScreen';
import StakeTokensScreen from '../screens/StakeTokensScreen';
import BackupIdentityScreen from '../screens/BackupIdentityScreen';
import BiometricVerificationScreen from '../screens/BiometricVerificationScreen';

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
      <Stack.Screen
        name="ProfileEdit"
        component={ProfileEditScreen}
        options={{ title: 'Edit Profile', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="IdentitySettings"
        component={IdentitySettingsScreen}
        options={{ title: 'Identity Settings', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="AppSettings"
        component={SettingsScreen}
        options={{ title: 'App Settings', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ title: 'Wallets', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="BackupIdentity"
        component={BackupIdentityScreen as any}
        options={{ title: 'Backup Identity', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="BiometricVerification"
        component={BiometricVerificationScreen as any}
        options={{ title: 'Biometric Authentication', headerBackTitle: 'Back' }}
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
      <Stack.Screen
        name="ConfirmTransaction"
        component={ConfirmTransactionScreen}
        options={{ title: 'Confirm Transaction', headerBackTitle: 'Back' }}
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
      <Stack.Screen
        name="CreateProposal"
        component={CreateProposalScreen}
        options={{ title: 'Create Proposal', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="TreasuryStatus"
        component={TreasuryStatusScreen}
        options={{ title: 'Treasury Status', headerBackTitle: 'Back' }}
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

// Tab Icon Components - Simple geometric icons using Views
const HomeIcon = ({ color }: { color: string }) => (
  <View style={{ width: 24, height: 24, justifyContent: 'center', alignItems: 'center' }}>
    <View style={{ width: 14, height: 12, borderWidth: 1.5, borderColor: color, borderTopWidth: 0 }} />
    <View style={{ width: 8, height: 8, borderWidth: 1.5, borderColor: color, marginTop: -6, marginLeft: 3 }} />
  </View>
);

const UserIcon = ({ color }: { color: string }) => (
  <View style={{ width: 24, height: 24, justifyContent: 'center', alignItems: 'center' }}>
    <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: color }} />
    <View style={{ width: 12, height: 8, borderWidth: 1.5, borderColor: color, borderTopWidth: 0, marginTop: 2 }} />
  </View>
);

const BriefcaseIcon = ({ color }: { color: string }) => (
  <View style={{ width: 24, height: 24, justifyContent: 'center', alignItems: 'center' }}>
    <View style={{ width: 14, height: 10, borderWidth: 1.5, borderColor: color }} />
    <View style={{ width: 6, height: 4, borderWidth: 1, borderColor: color, position: 'absolute', top: 0, left: 9 }} />
  </View>
);

const VoteIcon = ({ color }: { color: string }) => (
  <View style={{ width: 24, height: 24, justifyContent: 'center', alignItems: 'center' }}>
    <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: color }} />
    <View style={{ width: 1.5, height: 6, backgroundColor: color, position: 'absolute', bottom: 2 }} />
  </View>
);

const GlobeIcon = ({ color }: { color: string }) => (
  <View style={{ width: 24, height: 24, justifyContent: 'center', alignItems: 'center' }}>
    <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: color }} />
    <View style={{ width: 14, height: 1, backgroundColor: color, position: 'absolute' }} />
  </View>
);

const RootNavigator = () => {
  const scheme = useColorScheme();
  const navTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.bg_dark,
            borderTopColor: colors.border,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.text_secondary,
        } as any}
      >
        <Tab.Screen
          name="DashboardTab"
          component={DashboardStack}
          options={{
            title: 'Dashboard',
            tabBarLabel: 'Dashboard',
            tabBarIcon: HomeIcon,
          } as any}
        />
        <Tab.Screen
          name="IdentityTab"
          component={IdentityStack}
          options={{
            title: 'Identity',
            tabBarLabel: 'Identity',
            tabBarIcon: UserIcon,
          } as any}
        />
        <Tab.Screen
          name="WalletTab"
          component={WalletStack}
          options={{
            title: 'Wallet',
            tabBarLabel: 'Wallet',
            tabBarIcon: BriefcaseIcon,
          } as any}
        />
        <Tab.Screen
          name="DAOTab"
          component={DAOStack}
          options={{
            title: 'DAO',
            tabBarLabel: 'DAO',
            tabBarIcon: VoteIcon,
          } as any}
        />
        <Tab.Screen
          name="BrowserTab"
          component={BrowserStack}
          options={{
            title: 'Browser',
            tabBarLabel: 'Browser',
            tabBarIcon: GlobeIcon,
          } as any}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
