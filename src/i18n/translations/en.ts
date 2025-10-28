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
      verified: '✓ Verified',
      notVerified: '✗ Not Verified',
      created: 'Created:',
    },
    actions: {
      createIdentity: 'CREATE IDENTITY',
      backupIdentity: 'BACKUP IDENTITY',
      verifyBiometric: 'VERIFY BIOMETRIC',
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
