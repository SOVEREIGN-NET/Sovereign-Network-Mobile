/**
 * Mock Data Service for SOV Web4 Mobile App
 * Provides test data for UI development without API connectivity
 */

import type { Identity, Wallet, Transaction, Proposal, DAOStats, NetworkStatus } from '../types/models';

class MockDataService {
  /**
   * Get mock identity
   */
  static getIdentity(): Identity {
    return {
      did: 'did:zhtp:1a2b3c4d5e6f7g8h9i0j',
      displayName: 'Alice Sovereign',
      identityType: 'human',
      createdAt: '2024-01-15T10:30:00Z',
      citizenship: true,
      avatar: '👤',
    };
  }

  /**
   * Get mock wallets
   */
  static getWallets(): Wallet[] {
    return [
      {
        id: 'wallet-1',
        name: 'Primary Wallet',
        address: 'zhtp1acdefghijklmnopqrstuvwxyz',
        balance: 150250.59,
        currency: 'SOV',
        type: 'primary',
      },
      {
        id: 'wallet-2',
        name: 'UBI Wallet',
        address: 'zhtp1bcdefghijklmnopqrstuvwxyz',
        balance: 1250.01,
        currency: 'SOV',
        type: 'ubi',
      },
      {
        id: 'wallet-3',
        name: 'Savings Wallet',
        address: 'zhtp1ccdefghijklmnopqrstuvwxyz',
        balance: 50000.01,
        currency: 'SOV',
        type: 'savings',
      },
    ];
  }

  /**
   * Get mock transactions
   */
  static getTransactions(): Transaction[] {
    return [
      {
        id: 'tx-001',
        from: 'zhtp1acdefghijklmnopqrstuvwxyz',
        to: 'zhtp1dcdefghijklmnopqrstuvwxyz',
        amount: 100.09,
        currency: 'SOV',
        timestamp: '2024-10-25T14:30:00Z',
        status: 'confirmed',
        type: 'send',
      },
      {
        id: 'tx-002',
        from: 'zhtp1ecdefghijklmnopqrstuvwxyz',
        to: 'zhtp1acdefghijklmnopqrstuvwxyz',
        amount: 250.01,
        currency: 'SOV',
        timestamp: '2024-10-24T10:15:00Z',
        status: 'confirmed',
        type: 'receive',
      },
      {
        id: 'tx-003',
        from: 'zhtp1acdefghijklmnopqrstuvwxyz',
        to: 'dao.zhtp',
        amount: 500.03,
        currency: 'SOV',
        timestamp: '2024-10-23T09:45:00Z',
        status: 'confirmed',
        type: 'stake',
      },
      {
        id: 'tx-004',
        from: 'ubi.zhtp',
        to: 'zhtp1acdefghijklmnopqrstuvwxyz',
        amount: 50.02,
        currency: 'SOV',
        timestamp: '2024-10-22T00:00:00Z',
        status: 'confirmed',
        type: 'ubi',
      },
    ];
  }

  /**
   * Get mock DAO proposals
   */
  static getProposals(): Proposal[] {
    return [
      {
        id: 'prop-001',
        title: 'Implement Zero-Knowledge Voting',
        description:
          'Enhance privacy in DAO governance with ZK proofs for anonymous voting',
        proposer: 'did:zhtp:devteam001',
        status: 'active',
        votesFor: 1250,
        votesAgainst: 150,
        votesAbstain: 50,
        endTime: '2024-11-05T23:59:59Z',
        category: 'technical',
      },
      {
        id: 'prop-002',
        title: 'Allocate 50,000 SOV for Infrastructure',
        description: 'Fund development of edge nodes and network infrastructure',
        proposer: 'did:zhtp:foundation001',
        status: 'active',
        votesFor: 980,
        votesAgainst: 220,
        votesAbstain: 100,
        endTime: '2024-11-08T23:59:59Z',
        category: 'funding',
      },
      {
        id: 'prop-003',
        title: 'Update Protocol to v2.1',
        description:
          'Upgrade SOV protocol with improved mesh routing and faster consensus',
        proposer: 'did:zhtp:core001',
        status: 'passed',
        votesFor: 2100,
        votesAgainst: 300,
        votesAbstain: 50,
        endTime: '2024-10-20T23:59:59Z',
        category: 'technical',
      },
    ];
  }

  /**
   * Get mock DAO statistics
   */
  static getDAOStats(): DAOStats {
    return {
      totalProposals: 47,
      activeProposals: 2,
      treasury: 2500000,
      delegates: 156,
      participationRate: 0.73,
    };
  }

  /**
   * Get mock network status
   */
  static getNetworkStatus(): NetworkStatus {
    return {
      connected: true,
      protocol: 'SOV v1.0',
      version: '1.0.0',
      nodeCount: 42,
      meshHealth: 94,
    };
  }

  /**
   * Simulate voting on a proposal
   */
  static voteOnProposal(proposalId: string, vote: 'yes' | 'no' | 'abstain') {
    console.log(`Vote '${vote}' recorded for proposal ${proposalId}`);
    return {
      success: true,
      message: `Your vote has been recorded`,
      transactionHash: `0x${Math.random().toString(16).slice(2)}`,
    };
  }

  /**
   * Simulate sending tokens
   */
  static sendTokens(to: string, amount: number) {
    console.log(`Sending ${amount} SOV to ${to}`);
    return {
      success: true,
      message: `Sent ${amount} SOV to ${to}`,
      transactionHash: `0x${Math.random().toString(16).slice(2)}`,
      confirmationTime: 5000,
    };
  }

  /**
   * Simulate claiming UBI
   */
  static claimUBI() {
    console.log('Claiming UBI');
    return {
      success: true,
      message: 'UBI claimed successfully',
      amount: 50.06,
      nextClaimTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  /**
   * Simulate creating a proposal
   */
  static createProposal(title: string, _description: string, _category: string) {
    console.log(`Creating proposal: ${title}`);
    return {
      success: true,
      message: 'Proposal created successfully',
      proposalId: `prop-${Date.now()}`,
      transactionHash: `0x${Math.random().toString(16).slice(2)}`,
    };
  }

  /**
   * Generate mock seed phrase (20 words)
   */
  static generateSeedPhrase(): string[] {
    const wordList = [
      'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'access',
      'accident', 'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire', 'across', 'act', 'action',
      'activate', 'active', 'activity', 'actor', 'actual', 'acute', 'adapt', 'add', 'addict', 'added',
      'address', 'adjust', 'admit', 'adopt', 'adore', 'adorn', 'adult', 'advance', 'advent', 'adventure',
      'advice', 'advise', 'affair', 'afford', 'afraid', 'after', 'again', 'against', 'age', 'agency',
    ];

    const shuffled = [...wordList].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 20);
  }

  /**
   * Simulate identity creation with seed phrase
   */
  static createIdentity(displayName: string, identityType: string) {
    const seedPhrase = this.generateSeedPhrase();
    const did = `did:zhtp:${Math.random().toString(16).slice(2).substring(0, 16)}`;

    return {
      success: true,
      did,
      displayName,
      identityType,
      seedPhrase,
      createdAt: new Date().toISOString(),
      message: 'Identity created successfully',
    };
  }
}

export default MockDataService;
