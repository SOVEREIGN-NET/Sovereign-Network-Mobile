/**
 * Number Utility Functions
 * Provides consistent number and currency formatting throughout the app
 */

export const formatCurrency = (
  amount: number,
  currency: string = 'SOV',
  decimals: number = 2,
): string => {
  return `${amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} ${currency}`;
};

export const formatNumber = (
  value: number,
  decimals: number = 2,
): string => {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

export const formatLargeNumber = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
};

export const formatPercentage = (
  value: number,
  decimals: number = 1,
): string => {
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
};

export const calculatePercentage = (part: number, total: number): number => {
  if (total === 0) return 0;
  return (part / total) * 100;
};

export const formatWalletAddress = (address: string, chars: number = 8): string => {
  if (address.length <= chars * 2 + 3) {
    return address;
  }
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};

export const formatDID = (did: string): string => {
  // Format DID for display: did:zhtp:1a2b3c4d... -> 1a2b3c4d...
  const parts = did.split(':');
  if (parts.length > 2) {
    return formatWalletAddress(parts[2], 8);
  }
  return formatWalletAddress(did, 8);
};

export const calculateVotePercentages = (
  votesFor: number,
  votesAgainst: number,
  votesAbstain: number,
): { forPercentage: number; againstPercentage: number; abstainPercentage: number } => {
  const total = votesFor + votesAgainst + votesAbstain;

  if (total === 0) {
    return { forPercentage: 0, againstPercentage: 0, abstainPercentage: 0 };
  }

  return {
    forPercentage: (votesFor / total) * 100,
    againstPercentage: (votesAgainst / total) * 100,
    abstainPercentage: (votesAbstain / total) * 100,
  };
};
