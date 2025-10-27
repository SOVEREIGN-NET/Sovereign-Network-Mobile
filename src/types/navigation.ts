/**
 * Navigation Type Definitions
 * Provides type safety for React Navigation
 */

import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

// Define the tab navigator param list
export type TabParamList = {
  DashboardTab: undefined;
  IdentityTab: undefined;
  WalletTab: undefined;
  DAOTab: undefined;
  BrowserTab: undefined;
};

// Define individual stack param lists
export type DashboardStackParamList = {
  Dashboard: undefined;
  // Add other dashboard-related screens as needed
};

export type IdentityStackParamList = {
  Identity: undefined;
  // Add other identity-related screens as needed
};

export type WalletStackParamList = {
  Wallet: undefined;
  // Add other wallet-related screens as needed
};

export type DAOStackParamList = {
  DAO: undefined;
  // Add other DAO-related screens as needed
};

export type BrowserStackParamList = {
  Browser: undefined;
  // Add other browser-related screens as needed
};

// Root stack param list (if needed for modals, auth, etc.)
export type RootStackParamList = {
  Root: undefined;
  // Add modal screens here as needed
};

// Tab screen props
export type TabScreenProps<T extends keyof TabParamList> = BottomTabScreenProps<
  TabParamList,
  T
>;

// Stack screen props for each tab
export type DashboardScreenProps = NativeStackScreenProps<
  DashboardStackParamList,
  'Dashboard'
>;

export type IdentityScreenProps = NativeStackScreenProps<
  IdentityStackParamList,
  'Identity'
>;

export type WalletScreenProps = NativeStackScreenProps<
  WalletStackParamList,
  'Wallet'
>;

export type DAOScreenProps = NativeStackScreenProps<
  DAOStackParamList,
  'DAO'
>;

export type BrowserScreenProps = NativeStackScreenProps<
  BrowserStackParamList,
  'Browser'
>;
