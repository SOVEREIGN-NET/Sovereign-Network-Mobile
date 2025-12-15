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
import ProfileEditScreen from '../screens/ProfileEditScreen';
import IdentitySettingsScreen from '../screens/IdentitySettingsScreen';
import WalletSettingsScreen from '../screens/WalletSettingsScreen';
import DAOScreen from '../screens/DAOScreen';
import SIDScreen from '../screens/SIDScreen';
import HistoryScreen from '../screens/HistoryScreen';
import BookmarksScreen from '../screens/BookmarksScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
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
import BrowserScreen from '../screens/BrowserScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const DashboardStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      } as any}
    >
      <Stack.Screen
        name="DashboardMain"
        component={DashboardScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="Browser"
        component={BrowserScreen}
        options={{
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="ClaimUBI"
        component={ClaimUBIScreen}
        options={{
          title: 'Claim UBI',
          headerBackTitle: 'Back',
        }}
      />
    </Stack.Navigator>
  );
};


const SIDStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="SIDMain"
        component={SIDScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="History"
        component={HistoryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Bookmarks"
        component={BookmarksScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SendTokens"
        component={SendTokensScreen}
        options={{
          headerShown: true,
          title: 'Send SOV',
          headerBackTitle: '',
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
        }}
      />
      <Stack.Screen
        name="ReceiveTokens"
        component={ReceiveTokensScreen}
        options={{
          headerShown: true,
          title: 'Receive SOV',
          headerBackTitle: '',
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
        }}
      />
      <Stack.Screen
        name="StakeTokens"
        component={StakeTokensScreen}
        options={{
          headerShown: true,
          title: 'Stake SOV',
          headerBackTitle: '',
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
        }}
      />
      <Stack.Screen
        name="ConfirmTransaction"
        component={ConfirmTransactionScreen}
        options={{
          headerShown: true,
          title: 'Confirm Transaction',
          headerBackTitle: '',
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
        }}
      />
      <Stack.Screen
        name="WalletSettings"
        component={WalletSettingsScreen}
        options={{
          headerShown: true,
          title: 'Wallet Settings',
          headerBackTitle: '',
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
        }}
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
        name="BackupIdentity"
        component={BackupIdentityScreen as any}
        options={{ title: 'Backup Identity', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="BiometricVerification"
        component={BiometricVerificationScreen as any}
        options={{ title: 'Biometric Authentication', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          headerShown: true,
          title: 'Profile',
          headerBackTitle: '',
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
        }}
      />
    </Stack.Navigator>
  );
};

const DAOStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="DAOMain"
        component={DAOScreen}
        options={{ headerShown: false }}
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


// Tab Icon Components - Simple geometric icons using Views
const HomeIcon = ({ color }: { color: string }) => (
  <View style={{ width: 24, height: 24, justifyContent: 'center', alignItems: 'center' }}>
    <View style={{ width: 14, height: 12, borderWidth: 1.5, borderColor: color, borderTopWidth: 0 }} />
    <View style={{ width: 8, height: 8, borderWidth: 1.5, borderColor: color, marginTop: -6, marginLeft: 3 }} />
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
          name="DAOTab"
          component={DAOStack}
          options={{
            title: 'DAO',
            tabBarLabel: 'DAO',
            tabBarIcon: VoteIcon,
          } as any}
        />
        <Tab.Screen
        name="SIDTab"
        component={SIDStack}
        options={{
          title: 'SID',
          tabBarLabel: 'SID',
          tabBarIcon: BriefcaseIcon,
          unmountOnBlur: true,
        } as any}
      />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
