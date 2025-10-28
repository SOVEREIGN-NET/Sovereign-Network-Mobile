/**
 * English (en) translations
 * Base language for the application
 */

export const en = {
  // App
  app: {
    title: 'ZHTP Web4',
    loading: 'Loading...',
    error: 'Error: Auth context not available',
  },

  // Dashboard Screen
  dashboard: {
    loadingMessage: 'Loading ZHTP Dashboard...',
    networkStatus: {
      title: 'Network Status',
      label: 'Status:',
      connected: '🟢 Connected',
      offline: '🔴 Offline',
      protocol: 'Protocol:',
      nodes: 'Nodes:',
      meshHealth: 'Mesh Health:',
    },
    explore: {
      title: 'Explore',
      manageIdentity: 'MANAGE IDENTITY',
      viewWallet: 'VIEW WALLET',
      web4Browser: 'WEB4 BROWSER',
    },
    quickActions: {
      title: 'Quick Actions',
      sendZhtp: 'SEND ZHTP',
      claimUbi: 'CLAIM UBI',
      voteOnProposal: 'VOTE ON PROPOSAL',
      createProposal: 'CREATE PROPOSAL',
    },
    about: {
      title: 'About',
      description: 'ZHTP Web4 Mobile - Zero-Knowledge Hypertext Transfer Protocol',
      version: 'Version 1.0.0 (Demo Mode)',
      disclaimer: 'This is a frontend demonstration. No blockchain operations are executed.',
    },
  },

  // Auth Screens
  auth: {
    signIn: {
      title: 'Sign In',
    },
    createIdentity: {
      title: 'Create Identity',
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
        passphraseTooShort: 'Passphrase must be at least 8 characters',
        passphraseNoMatch: 'Passphrases do not match',
        termsRequired: 'You must accept the terms and conditions',
      },
      errors: {
        creationFailed: 'Identity creation failed',
      },
    },
    recoverIdentity: {
      title: 'Recover Identity',
    },
  },

  // Identity Screen
  identity: {
    title: 'ZK-DID Identity',
    details: {
      title: 'Details',
      identityType: 'Identity Type:',
      citizenship: 'Citizenship:',
      verified: 'Verified',
      notVerified: 'Not Verified',
      created: 'Created:',
    },
    actions: {
      createIdentity: 'Create Identity',
      backupIdentity: 'Backup Identity',
      verifyBiometric: 'Verify Biometric',
    },
    logout: {
      button: 'Sign Out',
      buttonLoading: 'Signing out...',
      hint: 'Signing out will clear your local identity',
    },
  },

  // Wallet Screen
  wallet: {
    title: 'Quantum Wallet',
    balance: {
      title: 'Balance',
    },
    actions: {
      title: 'Actions',
      sendZhtp: 'SEND ZHTP',
      receiveZhtp: 'RECEIVE ZHTP',
      claimUbi: 'CLAIM UBI',
      stakeZhtp: 'STAKE ZHTP',
    },
    transactions: {
      title: 'Recent Transactions',
      noTransactions: 'No transactions yet',
    },
  },

  // DAO Screen
  dao: {
    statistics: {
      title: 'DAO Statistics',
      members: 'Members',
      active: 'Active',
      total: 'Total',
      treasury: 'Treasury',
    },
    proposals: {
      title: 'Active Proposals',
      votes: 'For: {votesFor} • Against: {votesAgainst} • Abstain: {votesAbstain}',
      viewProposal: 'VIEW PROPOSAL',
    },
  },

  // Browser Screen
  browser: {
    title: 'Web4 Browser',
    urlPlaceholder: 'Enter ZHTP domain...',
    navigateButton: 'NAVIGATE',
    connectionStatus: '🟢 Connected to ZHTP Network',
    suggestedSites: 'Suggested Sites',
    features: {
      title: 'Web4 Browser Features',
      encryption: 'End-to-End Encryption - All connections are encrypted by default',
      meshRouting: 'Mesh Routing - Decentralized routing through edge nodes',
      zeroCensorship: 'Zero Censorship - No intermediaries or single point of failure',
      zeroKnowledge: 'Zero-Knowledge Proofs - Verify without revealing information',
    },
    errors: {
      notFound: 'Site Not Found',
      notResolved: '404 - Domain Not Resolved',
      couldNotResolve: 'The domain "{domain}" could not be resolved on the ZHTP network.',
    },
  },
} as const;

export type Translation = typeof en;
