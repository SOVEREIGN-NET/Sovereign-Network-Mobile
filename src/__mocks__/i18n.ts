/**
 * Manual mocks for src/i18n
 * This file is used by Jest to automatically mock the i18n module
 * See: https://jestjs.io/docs/en/manual-mocks
 */

const translations = {
  auth: {
    signIn: {
      didLabel: 'ZK-DID Address',
      didPlaceholder: 'did:zhtp:abc123...xyz',
      didExample: 'Example: did:zhtp:demo001',
      passphraseLabel: 'Passphrase',
      passphrasePlaceholder: 'Enter your passphrase',
      passphraseHint: 'Hint: Use your passphrase from identity creation',
      passphraseShowHide: {
        show: 'Show',
        hide: 'Hide',
      },
      demoLabel: 'Demo Credentials',
      demoInfo: 'DID: did:zhtp:demo001\nPassphrase: (any value works)',
      button: 'Sign In to ZHTP Network',
      buttonLoading: 'Signing in...',
      createNew: 'Create New Identity',
      recover: 'Recover Identity',
      validation: {
        didRequired: 'DID address is required',
        passphraseRequired: 'Passphrase is required',
      },
      errors: {
        signInFailed: 'Sign in failed',
      },
    },
    createIdentity: {
      identityType: 'Identity Type',
      types: {
        citizen: 'Citizen (UBI Eligible)',
        citizenDescription: 'Individual citizen with voting rights',
        organization: 'Organization',
        organizationDescription: 'Organization or collective',
        developer: 'Developer',
        developerDescription: 'Developer or builder',
        validator: 'Validator',
        validatorDescription: 'Network validator',
      },
      username: 'Username',
      usernameChecking: 'Checking...',
      usernameAvailable: 'Available',
      usernameTaken: 'Taken',
      usernameWillBe: 'Will become: {username}.zkdid',
      displayName: 'Display Name',
      displayNamePlaceholder: 'Your public display name',
      displayNameHint: 'Visible to others in DAO voting and profiles',
      passphrase: 'Passphrase (Optional)',
      passphraseShowHide: {
        show: 'Show',
        hide: 'Hide',
      },
      passphraseMinHint: 'Min. 8 characters (optional)',
      passphraseConfirm: 'Confirm passphrase',
      passphraseBlankHint: 'Leave blank to use biometric authentication only',
      passphraseStatus: {
        pending: 'Passphrase required',
        secure: 'Passphrase ready',
        description: 'Set a strong passphrase to secure your new identity.',
        setButton: 'Set Passphrase',
        updateButton: 'Update Passphrase',
      },
      passphraseModal: {
        title: 'Secure Your Identity',
        description: 'Enter and confirm a passphrase used to safeguard your credentials.',
        save: 'Save Passphrase',
        cancel: 'Cancel',
      },
      biometric: 'Biometric Authentication',
      biometricEnabled: 'Enabled (fingerprint/face recognition)',
      biometricDisabled: 'Disabled (optional)',
      terms: 'I accept the ZHTP Network Terms and',
      termsPrivacy: 'Privacy Policy',
      button: 'Generate ZK-DID Identity',
      buttonLoading: 'Creating identity...',
      validation: {
        displayNameRequired: 'Display name is required',
        displayNameTooShort: 'Display name must be at least 2 characters',
        usernameRequired: 'Username is required',
        usernameTooShort: 'Username must be at least 3 characters',
        usernameInvalid: 'Username can only contain letters, numbers, and underscores',
        usernameUnavailable: 'This username is already taken',
        authMethodRequired: 'You must set either a passphrase or enable biometric authentication',
        passphraseRequired: 'Passphrase is required',
        passphraseTooShort: 'Passphrase must be at least 8 characters',
        passphraseNoMatch: 'Passphrases do not match',
        termsRequired: 'You must accept the terms and conditions',
      },
      errors: {
        creationFailed: 'Identity creation failed',
      },
    },
    recoverIdentity: {
      method: 'Recovery Method',
      button: 'Recover Identity',
      buttonLoading: 'Recovering...',
      signInInstead: 'Sign In Instead',
      createNew: 'Create New Identity',
      validation: {
        seedRequired: 'Seed phrase is required',
        backupRequired: 'Backup file is required',
        backupPasswordRequired: 'Backup password is required',
        guardianCodeRequired: 'Guardian code is required',
        invalidMethod: 'Invalid recovery method',
      },
      errors: {
        recoveryFailed: 'Recovery failed',
      },
      seed: {
        label: 'Seed Phrase',
        description: 'Recover using your 12-word seed phrase',
        title: 'Enter Seed Phrase',
        placeholder: 'Enter your 12-word seed phrase separated by spaces',
        hint: 'Your seed phrase is case-insensitive',
        securityTitle: 'Security Warning',
        securityWarning: 'Never share your seed phrase with anyone',
      },
      backup: {
        label: 'Backup File',
        description: 'Recover using your backup file',
        title: 'Backup File Content',
        placeholder: 'Paste your backup file content (JSON)',
        passwordLabel: 'Backup Password',
        passwordPlaceholder: 'Enter the password for your backup',
        passwordShowHide: {
          show: 'Show',
          hide: 'Hide',
        },
        hint: 'The backup file should be a JSON file created during identity setup',
      },
      social: {
        label: 'Social Recovery',
        description: 'Recover using guardians',
        title: 'Guardian Code',
        placeholder: 'Enter the code provided by your guardian',
        processTitle: 'Social Recovery Process',
        step1: 'Contact one of your guardians',
        step2: 'Request your guardian code',
        step3: 'Share your ZK-DID with the guardian',
        step4: 'Enter the code they provide below',
        testTitle: 'Test Guardian Code',
        testCode: 'For testing: guardian-code-123',
      },
    },
  },
  sendTokens: {
    title: 'Send Tokens',
    currencyLabel: 'Currency',
    amountLabel: 'Amount',
    amountPlaceholder: 'Enter amount',
    recipientLabel: 'Recipient Address',
    recipientPlaceholder: 'did:zhtp:...',
    feeLabel: 'Network Fee',
    button: 'Send {currency}',
    buttonLoading: 'Sending...',
    validation: {
      amountRequired: 'Amount is required',
      amountMustBeNumber: 'Amount must be a number',
      amountTooHigh: 'Insufficient balance',
      amountTooLow: 'Amount must be greater than 0',
      maxDecimals: 'Maximum {decimals} decimal places allowed',
      recipientRequired: 'Recipient address is required',
    },
    errors: {
      sendFailed: 'Transaction failed',
    },
  },
  identity: {
    title: 'My Identity',
    details: {
      title: 'Identity Details',
      identityType: 'Identity Type',
      citizenship: 'Citizenship Status',
      created: 'Created',
      verified: 'Verified',
      notVerified: 'Not Verified',
    },
    actions: {
      createIdentity: 'Create New Identity',
      backupIdentity: 'Backup Identity',
      verifyBiometric: 'Verify Biometric',
    },
    logout: {
      button: 'Sign Out',
      buttonLoading: 'Signing out...',
      hint: 'You will be signed out from all devices',
    },
  },
};

export const useTranslation = jest.fn();

// Set default return value
(useTranslation as jest.Mock).mockReturnValue({
  t: translations,
  language: 'en',
  setLanguage: jest.fn(),
});

export const registerLanguage = jest.fn();
