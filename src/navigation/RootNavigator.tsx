import React from 'react';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useColorScheme } from 'react-native';

// Screens
import DashboardScreen from '../screens/DashboardScreen';
import IdentityScreen from '../screens/IdentityScreen';
import WalletScreen from '../screens/WalletScreen';
import DAOScreen from '../screens/DAOScreen';
import BrowserScreen from '../screens/BrowserScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const DashboardStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: '#1a1a2e',
        },
        headerTintColor: '#00d4ff',
        headerTitleStyle: {
          fontWeight: 'bold',
          color: '#ffffff',
        },
        cardStyle: { backgroundColor: '#0f0f1e' },
      }}
    >
      <Stack.Screen
        name="DashboardMain"
        component={DashboardScreen}
        options={{ title: 'ZHTP Dashboard' }}
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
          backgroundColor: '#1a1a2e',
        },
        headerTintColor: '#00d4ff',
        headerTitleStyle: {
          fontWeight: 'bold',
          color: '#ffffff',
        },
        cardStyle: { backgroundColor: '#0f0f1e' },
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
          backgroundColor: '#1a1a2e',
        },
        headerTintColor: '#00d4ff',
        headerTitleStyle: {
          fontWeight: 'bold',
          color: '#ffffff',
        },
        cardStyle: { backgroundColor: '#0f0f1e' },
      }}
    >
      <Stack.Screen
        name="WalletMain"
        component={WalletScreen}
        options={{ title: 'Quantum Wallet' }}
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
          backgroundColor: '#1a1a2e',
        },
        headerTintColor: '#00d4ff',
        headerTitleStyle: {
          fontWeight: 'bold',
          color: '#ffffff',
        },
        cardStyle: { backgroundColor: '#0f0f1e' },
      }}
    >
      <Stack.Screen
        name="DAOMain"
        component={DAOScreen}
        options={{ title: 'DAO Governance' }}
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
          backgroundColor: '#1a1a2e',
        },
        headerTintColor: '#00d4ff',
        headerTitleStyle: {
          fontWeight: 'bold',
          color: '#ffffff',
        },
        cardStyle: { backgroundColor: '#0f0f1e' },
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
            backgroundColor: '#1a1a2e',
            borderTopColor: '#00d4ff',
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: '#00d4ff',
          tabBarInactiveTintColor: '#888888',
        }}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardStack}
          options={{
            title: 'Home',
            tabBarLabel: 'Home',
          }}
        />
        <Tab.Screen
          name="Identity"
          component={IdentityStack}
          options={{
            title: 'Identity',
            tabBarLabel: 'Identity',
          }}
        />
        <Tab.Screen
          name="Wallet"
          component={WalletStack}
          options={{
            title: 'Wallet',
            tabBarLabel: 'Wallet',
          }}
        />
        <Tab.Screen
          name="DAO"
          component={DAOStack}
          options={{
            title: 'DAO',
            tabBarLabel: 'DAO',
          }}
        />
        <Tab.Screen
          name="Browser"
          component={BrowserStack}
          options={{
            title: 'Web4',
            tabBarLabel: 'Web4',
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
