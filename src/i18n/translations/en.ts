/**
 * English (en) translations
 * Base language for the application
 */

export const en = {
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
} as const;

export type Translation = typeof en;
