import React from 'react';
import renderer from 'react-test-renderer';
import { Alert } from 'react-native';
import IdentityScreen from 'src/screens/IdentityScreen';

jest.mock('src/hooks', () => ({
  useAuth: jest.fn(),
}));

jest.mock('src/i18n', () => ({
  useTranslation: jest.fn(),
}));

jest.mock('react-native', () => ({
  ScrollView: ({ children }: any) => children,
  View: ({ children }: any) => children,
  Alert: {
    alert: jest.fn(),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}));

jest.mock('src/components', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <div>{children}</div>,
  Button: ({ children, onPress, disabled }: any) => (
    <button onClick={onPress} disabled={disabled}>
      {children}
    </button>
  ),
  DetailRow: ({ label, value }: any) => <div>{label}: {value}</div>,
  LoadingView: () => <div>Loading</div>,
  Column: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('src/theme', () => ({
  colors: {
    bg_darkest: '#000000',
    bg_darker: '#1a1a1a',
    text_primary: '#ffffff',
    text_secondary: '#cccccc',
    text_tertiary: '#999999',
    error: '#ff0000',
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
      semibold: '600',
    },
  },
  borderRadius: {
    base: 8,
  },
}));

import { useAuth } from 'src/hooks';
import { useTranslation } from 'src/i18n';

describe('IdentityScreen', () => {
  const mockNavigation = {
    navigate: jest.fn(),
  };

  const mockTranslation = {
    identity: {
      logout: {
        confirmTitle: 'Sign Out?',
        confirmMessage: 'Your local identity data will be cleared.',
        cancel: 'Cancel',
        confirm: 'Sign Out',
        button: '🚪 Sign Out',
        buttonLoading: '⏳ Signing out...',
        hint: 'Signing out will clear your local identity',
      },
      actions: {
        editProfile: '✎ Edit Profile',
        settings: '⚙️ Settings',
        viewWallets: '💰 View Wallets',
        backupIdentity: '💾 Backup',
      },
      details: {
        identityType: 'Type',
        citizenship: 'Citizenship',
        verified: 'Verified',
        notVerified: 'Not Verified',
        created: 'Created',
      },
      stats: {
        title: 'Stats',
        votingPower: 'Voting Power',
        ubiEarned: 'UBI Earned',
        wallets: 'Wallets',
      },
    },
  };

  const mockIdentity = {
    id: 'id001',
    did: 'did:zhtp:test001',
    displayName: 'Test User',
    avatar: '👤',
    identityType: 'citizen',
    citizenship: true,
    createdAt: '2024-01-01',
    votingPower: 1000,
    ubiEarned: 100.5,
    wallets: [
      { id: 'w1', name: 'Main', address: '0x123...', balance: 1000 },
      { id: 'w2', name: 'Savings', address: '0x456...', balance: 5000 },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      currentIdentity: mockIdentity,
      signOut: jest.fn(),
      isLoading: false,
    });
    (useTranslation as jest.Mock).mockReturnValue({
      t: mockTranslation,
    });
  });

  it('renders loading view when no currentIdentity', () => {
    (useAuth as jest.Mock).mockReturnValue({
      currentIdentity: null,
      signOut: jest.fn(),
      isLoading: true,
    });

    const tree = renderer.create(
      <IdentityScreen navigation={mockNavigation} />
    ).toJSON();

    expect(tree).toMatchSnapshot();
  });

  it('renders identity information correctly', () => {
    const tree = renderer.create(
      <IdentityScreen navigation={mockNavigation} />
    ).toJSON();

    expect(tree).toMatchSnapshot();
  });

  it('displays stats and action buttons', () => {
    const tree = renderer.create(
      <IdentityScreen navigation={mockNavigation} />
    ).toJSON();

    expect(tree).toMatchSnapshot();
  });

  it('displays identity with default avatar when none provided', () => {
    const identityWithoutAvatar = { ...mockIdentity, avatar: undefined };
    (useAuth as jest.Mock).mockReturnValue({
      currentIdentity: identityWithoutAvatar,
      signOut: jest.fn(),
      isLoading: false,
    });

    const tree = renderer.create(
      <IdentityScreen navigation={mockNavigation} />
    ).toJSON();

    expect(tree).toMatchSnapshot();
  });

  it('disables all buttons when loading', () => {
    (useAuth as jest.Mock).mockReturnValue({
      currentIdentity: mockIdentity,
      signOut: jest.fn(),
      isLoading: true,
    });

    const tree = renderer.create(
      <IdentityScreen navigation={mockNavigation} />
    ).toJSON();

    expect(tree).toMatchSnapshot();
  });
});
