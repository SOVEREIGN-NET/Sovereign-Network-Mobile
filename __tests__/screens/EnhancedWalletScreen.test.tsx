import React from 'react';
import renderer from 'react-test-renderer';
import EnhancedWalletScreen from 'src/screens/EnhancedWalletScreen';

jest.mock('src/hooks', () => ({
  useAuth: jest.fn(),
}));

jest.mock('src/i18n', () => ({
  useTranslation: jest.fn(),
}));

jest.mock('react-native', () => ({
  ScrollView: ({ children }: any) => children,
  View: ({ children }: any) => children,
  FlatList: ({ children }: any) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}));

jest.mock('src/components', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  Text: ({ children, style, variant }: any) => (
    <div style={style} data-variant={variant}>
      {children}
    </div>
  ),
  Button: ({ children, onPress, disabled, variant, style }: any) => (
    <button onClick={onPress} disabled={disabled} data-variant={variant} style={style}>
      {children}
    </button>
  ),
  DetailRow: ({ label, value }: any) => (
    <div>
      <span>{label}</span>: <span>{value}</span>
    </div>
  ),
  LoadingView: () => <div>Loading</div>,
  Column: ({ children, gap }: any) => <div>{children}</div>,
  Row: ({ children, style }: any) => <div>{children}</div>,
}));

jest.mock('src/theme', () => ({
  colors: {
    bg_darkest: '#000000',
    bg_darker: '#1a1a1a',
    text_primary: '#ffffff',
    text_secondary: '#cccccc',
    text_tertiary: '#999999',
    primary: '#00ff00',
    white: '#ffffff',
    border: '#333333',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
  typography: {
    size: {
      xs: 12,
      sm: 14,
      '5xl': 32,
    },
    weight: {
      bold: '700',
      semibold: '600',
    },
  },
  borderRadius: {
    base: 8,
  },
}));

import { useAuth } from 'src/hooks';
import { useTranslation } from 'src/i18n';

describe('EnhancedWalletScreen', () => {
  const mockNavigation = {
    navigate: jest.fn(),
  };

  const mockTranslation = {
    wallet: {
      totalBalance: 'Total Balance',
      yourWallets: 'Your Wallets',
      walletDetails: 'Wallet Details',
      quickActions: 'Quick Actions',
      send: '📤 Send',
      receive: '📥 Receive',
      stake: '🔐 Stake Tokens',
      viewHistory: '📊 View History',
      noWallets: 'No wallets found',
      createWallet: '➕ Create Wallet',
      name: 'Name',
      address: 'Address',
      balance: 'Balance',
    },
  };

  const mockIdentity = {
    id: 'id001',
    did: 'did:zhtp:test001',
    displayName: 'Test User',
    wallets: [
      {
        id: 'w1',
        name: 'Main Wallet',
        address: '0x1234567890abcdef1234567890abcdef12345678',
        balance: 5000,
      },
      {
        id: 'w2',
        name: 'Savings Wallet',
        address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        balance: 10000,
      },
      {
        id: 'w3',
        name: 'Staking Wallet',
        address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        balance: 2500,
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      currentIdentity: mockIdentity,
      isLoading: false,
    });
    (useTranslation as jest.Mock).mockReturnValue({
      t: mockTranslation,
    });
  });

  it('renders enhanced wallet screen with current identity', () => {
    const tree = renderer.create(
      <EnhancedWalletScreen navigation={mockNavigation} />
    ).toJSON();

    expect(tree).toMatchSnapshot();
  });

  it('renders with multiple wallets', () => {
    const tree = renderer.create(
      <EnhancedWalletScreen navigation={mockNavigation} />
    ).toJSON();

    expect(tree).toMatchSnapshot();
  });

  it('renders loading view when no currentIdentity', () => {
    (useAuth as jest.Mock).mockReturnValue({
      currentIdentity: null,
      isLoading: true,
    });

    const tree = renderer.create(
      <EnhancedWalletScreen navigation={mockNavigation} />
    ).toJSON();

    expect(tree).toMatchSnapshot();
  });

  it('handles empty wallets list', () => {
    (useAuth as jest.Mock).mockReturnValue({
      currentIdentity: { ...mockIdentity, wallets: [] },
      isLoading: false,
    });

    const tree = renderer.create(
      <EnhancedWalletScreen navigation={mockNavigation} />
    ).toJSON();

    expect(tree).toMatchSnapshot();
  });

  it('handles missing wallets array gracefully', () => {
    (useAuth as jest.Mock).mockReturnValue({
      currentIdentity: { ...mockIdentity, wallets: undefined },
      isLoading: false,
    });

    const tree = renderer.create(
      <EnhancedWalletScreen navigation={mockNavigation} />
    ).toJSON();

    expect(tree).toMatchSnapshot();
  });
});
