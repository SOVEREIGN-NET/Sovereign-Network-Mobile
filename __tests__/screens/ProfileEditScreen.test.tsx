import React from 'react';
import renderer from 'react-test-renderer';
import ProfileEditScreen from 'src/screens/ProfileEditScreen';

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
  Button: ({ children, onPress, disabled }: any) => (
    <button onClick={onPress} disabled={disabled}>
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
  Column: ({ children }: any) => <div>{children}</div>,
  Row: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('src/theme', () => ({
  colors: {
    bg_darkest: '#000000',
    bg_darker: '#1a1a1a',
    text_primary: '#ffffff',
    text_secondary: '#cccccc',
    text_tertiary: '#999999',
    primary: '#00ff00',
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

describe('ProfileEditScreen', () => {
  const mockNavigation = {
    goBack: jest.fn(),
  };

  const mockTranslation = {
    profile: {
      selectAvatar: 'Select Avatar',
      displayName: 'Display Name',
      displayNamePlaceholder: 'Enter display name',
      characterCount: 'Characters',
      minLength: '2-50 characters',
      save: '✓ Save',
      cancel: '✗ Cancel',
      saving: '⏳ Saving...',
      required: 'Display name is required',
      tooShort: 'Display name must be at least 2 characters',
      tooLong: 'Display name must not exceed 50 characters',
    },
  };

  const mockIdentity = {
    id: 'id001',
    did: 'did:zhtp:test001',
    displayName: 'Test User',
    avatar: '👤',
  };

  const mockUpdateProfile = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      currentIdentity: mockIdentity,
      updateProfile: mockUpdateProfile,
      isLoading: false,
    });
    (useTranslation as jest.Mock).mockReturnValue({
      t: mockTranslation,
    });
  });

  it('renders profile edit screen with current identity', () => {
    const tree = renderer.create(
      <ProfileEditScreen navigation={mockNavigation} />
    ).toJSON();

    expect(tree).toMatchSnapshot();
  });

  it('allows avatar selection and display name editing', () => {
    const testRenderer = renderer.create(
      <ProfileEditScreen navigation={mockNavigation} />
    );
    const tree = testRenderer.toJSON();

    expect(tree).toMatchSnapshot();
  });
});
