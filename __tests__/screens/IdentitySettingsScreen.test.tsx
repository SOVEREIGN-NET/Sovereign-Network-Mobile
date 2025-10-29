import React from 'react';
import renderer from 'react-test-renderer';
import { Alert } from 'react-native';
import IdentitySettingsScreen from 'src/screens/IdentitySettingsScreen';

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
  Text: ({ children, onPress }: any) => <div onClick={onPress}>{children}</div>,
  Button: ({ children, onPress, disabled, style }: any) => (
    <button onClick={onPress} disabled={disabled} style={style}>
      {children}
    </button>
  ),
  Input: ({ value, onChangeText, placeholder, secureTextEntry, editable }: any) => (
    <input
      value={value}
      onChange={(e) => onChangeText(e.target.value)}
      placeholder={placeholder}
      type={secureTextEntry ? 'password' : 'text'}
      disabled={!editable}
    />
  ),
  Column: ({ children, gap }: any) => <div>{children}</div>,
  Row: ({ children, style }: any) => <div>{children}</div>,
  LoadingView: () => <div>Loading</div>,
}));

jest.mock('src/theme', () => ({
  colors: {
    bg_darkest: '#000000',
    bg_darker: '#1a1a1a',
    text_primary: '#ffffff',
    text_secondary: '#cccccc',
    text_tertiary: '#999999',
    primary: '#00ff00',
    error: '#ff0000',
    error_dark: '#cc0000',
    success: '#00cc00',
    warning: '#ffaa00',
    warning_dark: '#cc8800',
    white: '#ffffff',
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
      md: 16,
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

describe('IdentitySettingsScreen', () => {
  const mockNavigation = {
    goBack: jest.fn(),
  };

  const mockTranslation = {
    settings: {
      passphrase: {
        title: 'Change Passphrase',
        current: 'Current Passphrase',
        currentPlaceholder: 'Enter current passphrase',
        new: 'New Passphrase',
        newPlaceholder: 'Enter new passphrase (min 8 chars)',
        confirm: 'Confirm Passphrase',
        confirmPlaceholder: 'Confirm new passphrase',
        show: '🙈 Show',
        hide: '👁️ Hide',
        update: '🔐 Update Passphrase',
        updating: '⏳ Updating...',
      },
      biometric: {
        title: 'Biometric Authentication',
        enabled: 'Enabled',
        disabled: 'Disabled',
        enable: 'Enable',
        enabledButton: '✓ Enabled',
      },
      security: {
        title: '🔐 Security Reminder',
        message: 'Keep your passphrase secure and never share it with anyone. We cannot recover your identity if you lose access.',
      },
      backup: {
        title: 'Identity Backup',
        create: '💾 Create Backup',
        view: '📂 View Backups',
      },
    },
  };

  const mockIdentity = {
    id: 'id001',
    did: 'did:zhtp:test001',
    displayName: 'Test User',
    biometricHash: 'mock_hash',
  };

  const mockUpdatePassphrase = jest.fn();
  const mockUpdateBiometric = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      currentIdentity: mockIdentity,
      updatePassphrase: mockUpdatePassphrase,
      updateBiometric: mockUpdateBiometric,
      isLoading: false,
    });
    (useTranslation as jest.Mock).mockReturnValue({
      t: mockTranslation,
    });
  });

  it('renders settings screen with current identity', () => {
    const tree = renderer.create(
      <IdentitySettingsScreen navigation={mockNavigation} />
    ).toJSON();

    expect(tree).toMatchSnapshot();
  });

  it('renders passphrase and biometric sections', () => {
    const tree = renderer.create(
      <IdentitySettingsScreen navigation={mockNavigation} />
    ).toJSON();

    expect(tree).toMatchSnapshot();
  });

  it('shows security reminder and backup sections', () => {
    const tree = renderer.create(
      <IdentitySettingsScreen navigation={mockNavigation} />
    ).toJSON();

    expect(tree).toMatchSnapshot();
  });
});
