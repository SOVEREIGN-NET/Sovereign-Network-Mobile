/**
 * Color Utility Functions
 * Provides helper functions for color logic throughout the app
 */

import { colors } from '../theme';

export const getTransactionColor = (type: 'send' | 'receive' | 'stake' | 'ubi'): string => {
  switch (type) {
    case 'send':
      return colors.error;
    case 'receive':
      return colors.success;
    case 'stake':
      return colors.info;
    case 'ubi':
      return colors.warning;
    default:
      return colors.text_secondary;
  }
};

export const getTransactionIcon = (type: 'send' | 'receive' | 'stake' | 'ubi'): string => {
  switch (type) {
    case 'send':
      return '📤';
    case 'receive':
      return '📥';
    case 'stake':
      return '🔒';
    case 'ubi':
      return '💰';
    default:
      return '💳';
  }
};

export const getProposalStatusColor = (
  status: 'active' | 'passed' | 'failed' | 'executed',
): string => {
  switch (status) {
    case 'active':
      return colors.info;
    case 'passed':
      return colors.success;
    case 'failed':
      return colors.error;
    case 'executed':
      return colors.success;
    default:
      return colors.text_secondary;
  }
};

export const getProposalStatusIcon = (
  status: 'active' | 'passed' | 'failed' | 'executed',
): string => {
  switch (status) {
    case 'active':
      return '🔄';
    case 'passed':
      return '✅';
    case 'failed':
      return '❌';
    case 'executed':
      return '✔️';
    default:
      return '📋';
  }
};

export const getWalletTypeIcon = (type: 'primary' | 'ubi' | 'savings'): string => {
  switch (type) {
    case 'primary':
      return '💳';
    case 'ubi':
      return '💰';
    case 'savings':
      return '🏦';
    default:
      return '💼';
  }
};

export const getCategoryIcon = (category: 'governance' | 'funding' | 'technical'): string => {
  switch (category) {
    case 'governance':
      return '🏛️';
    case 'funding':
      return '💵';
    case 'technical':
      return '⚙️';
    default:
      return '📌';
  }
};

export const getNetworkHealthColor = (meshHealth: number): string => {
  if (meshHealth >= 80) return colors.success;
  if (meshHealth >= 60) return colors.warning;
  return colors.error;
};
