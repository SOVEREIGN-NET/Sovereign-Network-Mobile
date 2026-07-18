import React, { useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  NavigationContainer,
  NavigationContainerRef,
  DefaultTheme,
  DarkTheme,
  Theme as NavigationTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Linking, View } from 'react-native';
import { parseBrowserAuthLink } from '../services/BrowserAuthService';
import { useTheme } from '../context/ThemeContext';
import { colors } from '../theme/tokens';
import { RootStackParamList } from '../types/navigation';

// Screens
import DashboardScreen from '../screens/DashboardScreen';
import Web4SearchResultsScreen from '../screens/Web4SearchResultsScreen';
import DappsScreen from '../screens/DappsScreen';
import DappsSearchResultsScreen from '../screens/DappsSearchResultsScreen';
import AppDetailScreen from '../screens/AppDetailScreen';
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
import BrowserAuthScreen from '../screens/BrowserAuthScreen';
import QRScanScreen from '../screens/QRScanScreen';
import BiometricVerificationScreen from '../screens/BiometricVerificationScreen';
import BrowserScreen from '../screens/BrowserScreen';
import ProfileScreen from '../screens/ProfileScreen';
import TokenCreatorScreen from '../screens/TokenCreatorScreen';
import TokenManagementScreen from '../screens/TokenManagementScreen';
import MyTokensScreen from '../screens/MyTokensScreen';
import TokenDetailScreen from '../screens/TokenDetailScreen';
import MyDomainsScreen from '../screens/MyDomainsScreen';
import DeveloperPortalScreen from '../screens/DeveloperPortalScreen';
import RegisterDaoScreen from '../screens/RegisterDaoScreen';
import OperateNodesScreen from '../screens/OperateNodesScreen';
import UploadDappScreen from '../screens/UploadDappScreen';
import DomainDetailScreen from '../screens/DomainDetailScreen';
import MyStorageScreen from '../screens/MyStorageScreen';
import WelfareDaoDetailScreen from '../screens/WelfareDaoDetailScreen';
import ExplorerDashboardScreen from '../screens/explorer/ExplorerDashboardScreen';
import OracleDashboardScreen from '../screens/oracle/OracleDashboardScreen';
import SovSwapHomeScreen from '../screens/sovswap/SovSwapHomeScreen';
import SovSwapDaoDetailScreen from '../screens/sovswap/SovSwapDaoDetailScreen';
import SovSwapMarketDetailScreen from '../screens/sovswap/SovSwapMarketDetailScreen';
import {
  ArrowIcon,
  SearchIcon as SovereignSearchIcon,
} from '../components';
import BlockDetailScreen from '../screens/explorer/BlockDetailScreen';
import TransactionDetailScreen from '../screens/explorer/TransactionDetailScreen';
import IdentityDetailScreen from '../screens/explorer/IdentityDetailScreen';
import WalletDetailScreen from '../screens/explorer/WalletDetailScreen';
import NetworkTopologyScreen from '../screens/explorer/NetworkTopologyScreen';
import SearchScreen from '../screens/explorer/SearchScreen';
import PoUWScreen from '../screens/PoUWScreen';
import SignInScreen from '../screens/SignInScreen';
import CreateIdentityScreen from '../screens/CreateIdentityScreen';
import SeedPhraseScreen from '../screens/SeedPhraseScreen';
import RecoverIdentityScreen from '../screens/RecoverIdentityScreen';
import MigrationSeedScreen from '../screens/MigrationSeedScreen';
import BuyCryptoScreen from '../screens/BuyCryptoScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const DashboardStack = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false } as any}>
      <Stack.Screen name="DashboardMain" component={DashboardScreen} />
      <Stack.Screen name="Web4SearchResults" component={Web4SearchResultsScreen} />
      <Stack.Screen
        name="Browser"
        component={BrowserScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="ClaimUBI" component={ClaimUBIScreen} options={{ title: 'Claim UBS' }} />
      <Stack.Screen name="ExplorerDashboard" component={ExplorerDashboardScreen} />
      <Stack.Screen name="Dapps" component={DappsScreen} />
      <Stack.Screen name="DappsSearchResults" component={DappsSearchResultsScreen} />
      <Stack.Screen name="DeveloperPortal" component={DeveloperPortalScreen} />
      <Stack.Screen name="UploadDapp" component={UploadDappScreen} />
      <Stack.Screen name="RegisterDao" component={RegisterDaoScreen} />
      <Stack.Screen name="BlockDetail" component={BlockDetailScreen} />
      <Stack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
      <Stack.Screen name="IdentityDetail" component={IdentityDetailScreen} />
      <Stack.Screen name="WalletDetail" component={WalletDetailScreen} />
      <Stack.Screen name="ExplorerSearch" component={SearchScreen} />
      <Stack.Screen name="NetworkTopology" component={NetworkTopologyScreen} />
      <Stack.Screen name="OracleDashboard" component={OracleDashboardScreen} />
      <Stack.Screen
        name="MyDomains"
        component={MyDomainsScreen}
        options={{
          headerShown: true,
          title: 'My Domains',
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="DomainDetail"
        component={DomainDetailScreen}
        options={{
          headerShown: true,
          title: 'Domain Details',
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
        }}
      />
      <Stack.Screen
        name="MyStorage"
        component={MyStorageScreen}
        options={{
          headerShown: false,
          presentation: 'modal',
        }}
      />
    </Stack.Navigator>
  );
};

const SIDStack = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SIDMain" component={SIDScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="Bookmarks" component={BookmarksScreen} />
      <Stack.Screen name="Favorites" component={FavoritesScreen} />
      <Stack.Screen
        name="SendTokens"
        component={SendTokensScreen}
        options={{
          headerShown: true,
          title: 'Send',
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
        }}
      />
      <Stack.Screen
        name="ReceiveTokens"
        component={ReceiveTokensScreen}
        options={{
          headerShown: true,
          title: 'Receive',
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
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
        }}
      />
      <Stack.Screen
        name="ProfileEdit"
        component={ProfileEditScreen}
        options={{
          headerShown: true,
          title: 'Edit Profile',
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
        }}
      />
      <Stack.Screen
        name="IdentitySettings"
        component={IdentitySettingsScreen}
        options={{
          headerShown: true,
          title: 'Identity Settings',
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
        }}
      />
      <Stack.Screen
        name="AppSettings"
        component={SettingsScreen}
        options={{
          headerShown: true,
          title: 'App Settings',
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
        }}
      />
      <Stack.Screen
        name="BackupIdentity"
        component={BackupIdentityScreen as any}
        options={{
          headerShown: true,
          title: 'Backup Identity',
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
        }}
      />
      <Stack.Screen
        name="BrowserAuth"
        component={BrowserAuthScreen as any}
        options={{
          headerShown: true,
          title: 'Browser sign-in',
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
        }}
      />
      <Stack.Screen
        name="QRScan"
        component={QRScanScreen as any}
        options={{
          headerShown: true,
          title: 'Scan QR code',
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="BiometricVerification"
        component={BiometricVerificationScreen as any}
        options={{
          headerShown: true,
          title: 'Biometric Authentication',
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
        }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          headerShown: true,
          title: 'Profile',
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
        }}
      />
      <Stack.Screen
        name="TokenCreator"
        component={TokenCreatorScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="TokenManagement"
        component={TokenManagementScreen}
        options={{
          headerShown: true,
          title: 'Manage Tokens',
          headerStyle: { backgroundColor: colors.bg_dark },
          headerTintColor: colors.text_primary,
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="MyTokens"
        component={MyTokensScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="TokenDetail" component={TokenDetailScreen} />
      <Stack.Screen name="PoUW" component={PoUWScreen} />
      <Stack.Screen
        name="BuyCrypto"
        component={BuyCryptoScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
    </Stack.Navigator>
  );
};

const DAOStack = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DAOMain" component={DAOScreen} />
      <Stack.Screen name="WelfareDaoDetail" component={WelfareDaoDetailScreen} />
      <Stack.Screen name="ProposalDetail" component={ProposalDetailScreen} />
      <Stack.Screen name="CreateProposal" component={CreateProposalScreen} />
      <Stack.Screen name="TreasuryStatus" component={TreasuryStatusScreen} />
      <Stack.Screen
        name="Browser"
        component={BrowserScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
};

const SovSwapStack = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SovSwapMain" component={SovSwapHomeScreen as any} />
      <Stack.Screen name="SovSwapDaoDetail" component={SovSwapDaoDetailScreen as any} />
      <Stack.Screen name="SovSwapMarketDetail" component={SovSwapMarketDetailScreen as any} />
      <Stack.Screen
        name="Browser"
        component={BrowserScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
};

const StoreStack = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="StoreMain" component={DappsScreen} />
      <Stack.Screen name="DappsSearchResults" component={DappsSearchResultsScreen} />
      <Stack.Screen name="AppDetail" component={AppDetailScreen} />
      <Stack.Screen
        name="Browser"
        component={BrowserScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
};

// Tab Icon Components
const TabSearchIcon = ({ color }: { color: string }) => <SovereignSearchIcon color={color} size={24} />;

const ProfileIcon = ({ color }: { color: string }) => (
  <View style={{ width: 24, height: 24, justifyContent: 'center', alignItems: 'center' }}>
    <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: color, marginBottom: 2 }} />
    <View style={{ width: 14, height: 7, borderTopLeftRadius: 7, borderTopRightRadius: 7, borderWidth: 1.5, borderColor: color, borderBottomWidth: 0 }} />
  </View>
);

const GovernanceIcon = ({ color }: { color: string }) => (
  <View style={{ width: 24, height: 24, justifyContent: 'center', alignItems: 'center' }}>
    <View style={{ width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 6, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color, marginBottom: 1 }} />
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'flex-end' }}>
      <View style={{ width: 2, height: 7, backgroundColor: color, borderRadius: 1 }} />
      <View style={{ width: 2, height: 7, backgroundColor: color, borderRadius: 1 }} />
      <View style={{ width: 2, height: 7, backgroundColor: color, borderRadius: 1 }} />
    </View>
    <View style={{ width: 18, height: 2, backgroundColor: color, marginTop: 1, borderRadius: 1 }} />
  </View>
);

const StoreIcon = ({ color }: { color: string }) => (
  <View style={{ width: 24, height: 24, justifyContent: 'center', alignItems: 'center' }}>
    <View style={{ width: 8, height: 6, borderWidth: 1.5, borderColor: color, borderBottomWidth: 0, borderTopLeftRadius: 4, borderTopRightRadius: 4, marginBottom: -1 }} />
    <View style={{ width: 16, height: 14, borderWidth: 1.5, borderColor: color, borderRadius: 2 }} />
    <View style={{ width: 6, height: 1.5, backgroundColor: color, position: 'absolute', bottom: 8, borderRadius: 1 }} />
  </View>
);

const SwapIcon = ({ color }: { color: string }) => (
  <View style={{ width: 24, height: 24, justifyContent: 'center', alignItems: 'center' }}>
    <View style={{ position: 'absolute', top: 4, right: 4, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 10, height: 2, backgroundColor: color, borderRadius: 1 }} />
      <View style={{ width: 0, height: 0, borderTopWidth: 4, borderBottomWidth: 4, borderLeftWidth: 6, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: color, marginLeft: -2 }} />
    </View>
    <View style={{ position: 'absolute', bottom: 4, left: 4, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 0, height: 0, borderTopWidth: 4, borderBottomWidth: 4, borderRightWidth: 6, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: color, marginRight: -2 }} />
      <View style={{ width: 10, height: 2, backgroundColor: color, borderRadius: 1 }} />
    </View>
  </View>
);

const RootNavigator = () => {
  const { theme, colors: themeColors } = useTheme();
  const navTheme: NavigationTheme = useMemo(() => {
    const base = theme === 'light' ? DefaultTheme : DarkTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: themeColors.bg_darkest,
        card: themeColors.bg_dark,
        text: themeColors.text_primary,
        border: themeColors.border,
        primary: themeColors.primary,
      },
    };
  }, [theme, themeColors]);
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList> | null>(null);

  useEffect(() => {
    const routeAuthUrl = (url: string | null | undefined) => {
      if (!url) return;
      try {
        const parsed = parseBrowserAuthLink(url);
        if (!parsed) return;
        const tryNavigate = () => {
          if (navigationRef.current?.isReady()) {
            (navigationRef.current as any).navigate('BrowserAuth', { url });
          } else {
            setTimeout(tryNavigate, 50);
          }
        };
        tryNavigate();
      } catch {}
    };
    Linking.getInitialURL().then(routeAuthUrl).catch(() => {});
    const sub = Linking.addEventListener('url', event => routeAuthUrl(event.url));
    return () => sub.remove();
  }, []);

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="SignIn" component={SignInScreen as any} options={{ presentation: 'modal' }} />
        <Stack.Screen name="CreateIdentity" component={CreateIdentityScreen as any} options={{ presentation: 'modal' }} />
        <Stack.Screen name="RecoverIdentity" component={RecoverIdentityScreen as any} options={{ title: 'Recover Identity' }} />
        <Stack.Screen name="MigrationSeed" component={MigrationSeedScreen as any} options={{ title: 'Migration Seed' }} />
        <Stack.Screen name="SeedPhrase" component={SeedPhraseScreen as any} options={{ title: 'Your Seed Phrase' }} />
        <Stack.Screen name="OperateNodes" component={OperateNodesScreen as any} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const MainTabs = () => {
  const { currentIdentity } = useAuth();
  const isSignedIn = currentIdentity !== null;
  return (
    <Tab.Navigator
      initialRouteName={isSignedIn ? undefined : 'SIDTab'}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.bg_dark, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.text_secondary,
      } as any}
    >
      <Tab.Screen name="DashboardTab" component={DashboardStack} options={{ title: 'Search', tabBarLabel: 'Search', tabBarIcon: TabSearchIcon } as any} />
      <Tab.Screen name="StoreTab" component={StoreStack} options={{ title: 'Store', tabBarLabel: 'Store', tabBarIcon: StoreIcon } as any} />
      <Tab.Screen name="DAOTab" component={DAOStack} options={{ title: 'DAO', tabBarLabel: 'DAO', tabBarIcon: GovernanceIcon } as any} />
      <Tab.Screen name="SwapTab" component={SovSwapStack} options={{ title: 'Swap', tabBarLabel: 'Swap', tabBarIcon: SwapIcon } as any} />
      <Tab.Screen name="SIDTab" component={SIDStack} options={{ title: 'SID', tabBarLabel: 'SID', tabBarIcon: ProfileIcon, unmountOnBlur: true } as any} />
    </Tab.Navigator>
  );
};

export default RootNavigator;
