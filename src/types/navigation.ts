/**
 * Navigation Type Definitions
 * Provides type safety for React Navigation
 */

import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

// Define the tab navigator param list
export type TabParamList = {
  DashboardTab: undefined;
  DAOTab: undefined;
  SIDTab: undefined;
};

// Define individual stack param lists
export type DashboardStackParamList = {
  DashboardMain: undefined;
  ClaimUBI: undefined;
};

export type IdentityStackParamList = {
  IdentityMain: undefined;
  ProfileEdit: undefined;
  IdentitySettings: undefined;
  AppSettings: undefined;
  Wallet: undefined;
  BackupIdentity: undefined;
  BiometricVerification: undefined;
};

export type SIDStackParamList = {
  SIDMain: undefined;
  SendTokens: undefined;
  ReceiveTokens: undefined;
  StakeTokens: undefined;
  ConfirmTransaction: undefined;
};

export type DAOStackParamList = {
  DAOMain: undefined;
  ProposalDetail: undefined;
  CreateProposal: undefined;
  TreasuryStatus: undefined;
};

// Tab screen props
export type TabScreenProps<T extends keyof TabParamList> = BottomTabScreenProps<
  TabParamList,
  T
>;

// Stack screen props for each tab
export type DashboardScreenProps = NativeStackScreenProps<
  DashboardStackParamList,
  'DashboardMain'
>;

export type IdentityScreenProps = NativeStackScreenProps<
  IdentityStackParamList,
  'IdentityMain'
>;

export type SIDScreenProps = NativeStackScreenProps<
  SIDStackParamList,
  'SIDMain'
>;

export type DAOScreenProps = NativeStackScreenProps<
  DAOStackParamList,
  'DAOMain'
>;
