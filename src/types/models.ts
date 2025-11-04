/**
 * Domain Models
 * Core data structures for the ZHTP Web4 Mobile application
 */

// Identity
export interface Identity {
  did: string;
  displayName: string;
  identityType: 'human' | 'organization' | 'developer';
  createdAt: string;
  citizenship: boolean;
  avatar?: string;
}

// Wallet
export interface Wallet {
  id: string;
  name: string;
  address: string;
  balance: number;
  currency: string;
  type: 'primary' | 'ubi' | 'savings';
}

// Transaction
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

// DAO Proposal
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

// DAO Statistics (matches API client DaoStats)
export interface DAOStats {
  totalProposals: number;
  activeProposals: number;
  treasury: number;
  delegates: number;
  participationRate: number;
}

// Network Status
export interface NetworkStatus {
  connected: boolean;
  protocol: string;
  version: string;
  nodeCount: number;
  meshHealth: number;
}

// API Response types
export interface VoteResponse {
  success: boolean;
  message: string;
  transactionHash: string;
}

export interface SendTokenResponse {
  success: boolean;
  message: string;
  transactionHash: string;
  confirmationTime: number;
}

export interface ClaimUBIResponse {
  success: boolean;
  message: string;
  amount: number;
  nextClaimTime: string;
}

export interface CreateProposalResponse {
  success: boolean;
  message: string;
  proposalId: string;
  transactionHash: string;
}
