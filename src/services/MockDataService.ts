/**
 * Mock Data Service for ZHTP Web4 Mobile App
 * Provides test data for UI development without API connectivity
 */

export interface Identity {
  did: string;
  displayName: string;
  identityType: 'human' | 'organization' | 'developer';
  createdAt: string;
  citizenship: boolean;
  avatar?: string;
}

export interface Wallet {
  id: string;
  name: string;
  address: string;
  balance: number;
  currency: string;
  type: 'primary' | 'ubi' | 'savings';
}

export interface Transaction {
  id: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  timestamp: string;
  status: 'confirmed' | 'pending' | 'failed';
  type: 'send' | 'receive' | 'stake' | 'ubi';
}

export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  status: 'active' | 'passed' | 'failed' | 'executed';
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  endTime: string;
  category: 'governance' | 'funding' | 'technical';
}

export interface DAOStats {
  totalMembers: number;
  treasuryBalance: number;
  activeProposals: number;
  totalProposals: number;
}

export interface NetworkStatus {
  connected: boolean;
  protocol: string;
  version: string;
  nodeCount: number;
  meshHealth: number;
}

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
        balance: 150250.50,
        currency: 'ZHTP',
        type: 'primary',
      },
      {
        id: 'wallet-2',
        name: 'UBI Wallet',
        address: 'zhtp1bcdefghijklmnopqrstuvwxyz',
        balance: 1250.00,
        currency: 'ZHTP',
        type: 'ubi',
      },
      {
        id: 'wallet-3',
        name: 'Savings Wallet',
        address: 'zhtp1ccdefghijklmnopqrstuvwxyz',
        balance: 50000.00,
        currency: 'ZHTP',
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
        amount: 100.00,
        currency: 'ZHTP',
        timestamp: '2024-10-25T14:30:00Z',
        status: 'confirmed',
        type: 'send',
      },
      {
        id: 'tx-002',
        from: 'zhtp1ecdefghijklmnopqrstuvwxyz',
        to: 'zhtp1acdefghijklmnopqrstuvwxyz',
        amount: 250.00,
        currency: 'ZHTP',
        timestamp: '2024-10-24T10:15:00Z',
        status: 'confirmed',
        type: 'receive',
      },
      {
        id: 'tx-003',
        from: 'zhtp1acdefghijklmnopqrstuvwxyz',
        to: 'dao.zhtp',
        amount: 500.00,
        currency: 'ZHTP',
        timestamp: '2024-10-23T09:45:00Z',
        status: 'confirmed',
        type: 'stake',
      },
      {
        id: 'tx-004',
        from: 'ubi.zhtp',
        to: 'zhtp1acdefghijklmnopqrstuvwxyz',
        amount: 50.00,
        currency: 'ZHTP',
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
        title: 'Allocate 50,000 ZHTP for Infrastructure',
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
          'Upgrade ZHTP protocol with improved mesh routing and faster consensus',
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
      totalMembers: 5432,
      treasuryBalance: 2500000,
      activeProposals: 2,
      totalProposals: 47,
    };
  }

  /**
   * Get mock network status
   */
  static getNetworkStatus(): NetworkStatus {
    return {
      connected: true,
      protocol: 'ZHTP v1.0',
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
    console.log(`Sending ${amount} ZHTP to ${to}`);
    return {
      success: true,
      message: `Sent ${amount} ZHTP to ${to}`,
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
      amount: 50.00,
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
}

export default MockDataService;
