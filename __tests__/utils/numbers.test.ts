import {
  formatCurrency,
  formatNumber,
  formatLargeNumber,
  formatPercentage,
  calculatePercentage,
  formatWalletAddress,
  calculateVotePercentages,
} from 'src/utils';

describe('Number Utilities', () => {
  describe('formatCurrency', () => {
    it('should format currency with default decimals', () => {
      expect(formatCurrency(1000)).toBe('1,000.00 ZHTP');
    });

    it('should format currency with custom decimals', () => {
      expect(formatCurrency(1000.5, 'ETH', 3)).toBe('1,000.500 ETH');
    });

    it('should handle large numbers', () => {
      expect(formatCurrency(1500000)).toBe('1,500,000.00 ZHTP');
    });

    it('should handle small numbers', () => {
      expect(formatCurrency(0.01)).toBe('0.01 ZHTP');
    });

    it('should handle zero', () => {
      expect(formatCurrency(0)).toBe('0.00 ZHTP');
    });
  });

  describe('formatNumber', () => {
    it('should format number with default decimals', () => {
      expect(formatNumber(1000)).toBe('1,000.00');
    });

    it('should format number with custom decimals', () => {
      expect(formatNumber(1000.5, 1)).toBe('1,000.5');
    });

    it('should handle negative numbers', () => {
      expect(formatNumber(-1000)).toBe('-1,000.00');
    });
  });

  describe('formatLargeNumber', () => {
    it('should format millions', () => {
      expect(formatLargeNumber(1500000)).toBe('1.5M');
    });

    it('should format thousands', () => {
      expect(formatLargeNumber(5000)).toBe('5.0K');
    });

    it('should not abbreviate small numbers', () => {
      expect(formatLargeNumber(500)).toBe('500');
    });

    it('should handle zero', () => {
      expect(formatLargeNumber(0)).toBe('0');
    });
  });

  describe('formatPercentage', () => {
    it('should format percentage with default decimals', () => {
      expect(formatPercentage(85)).toBe('85.0%');
    });

    it('should format percentage with custom decimals', () => {
      expect(formatPercentage(85.555, 2)).toBe('85.56%');
    });

    it('should handle zero', () => {
      expect(formatPercentage(0)).toBe('0.0%');
    });

    it('should handle 100', () => {
      expect(formatPercentage(100)).toBe('100.0%');
    });
  });

  describe('calculatePercentage', () => {
    it('should calculate percentage', () => {
      expect(calculatePercentage(50, 100)).toBe(50);
    });

    it('should calculate fractional percentage', () => {
      expect(calculatePercentage(1, 3)).toBeCloseTo(33.33, 1);
    });

    it('should handle zero total', () => {
      expect(calculatePercentage(10, 0)).toBe(0);
    });

    it('should handle zero part', () => {
      expect(calculatePercentage(0, 100)).toBe(0);
    });
  });

  describe('formatWalletAddress', () => {
    it('should truncate long address', () => {
      const address = 'zhtp1acdefghijklmnopqrstuvwxyzabcdefghij';
      expect(formatWalletAddress(address)).toMatch(/\.\.\./);
    });

    it('should not truncate short address', () => {
      const address = 'zhtp1short';
      expect(formatWalletAddress(address)).toBe(address);
    });

    it('should use custom char count', () => {
      const address = 'zhtp1acdefghijklmnopqrstuvwxyzabcdefghij';
      const result = formatWalletAddress(address, 4);
      expect(result).toContain('...');
    });
  });

  describe('calculateVotePercentages', () => {
    it('should calculate vote percentages', () => {
      const result = calculateVotePercentages(100, 50, 50);
      expect(result.forPercentage).toBe(50);
      expect(result.againstPercentage).toBe(25);
      expect(result.abstainPercentage).toBe(25);
    });

    it('should handle zero votes', () => {
      const result = calculateVotePercentages(0, 0, 0);
      expect(result.forPercentage).toBe(0);
      expect(result.againstPercentage).toBe(0);
      expect(result.abstainPercentage).toBe(0);
    });

    it('should sum to 100 percent', () => {
      const result = calculateVotePercentages(60, 30, 10);
      const total =
        result.forPercentage + result.againstPercentage + result.abstainPercentage;
      expect(total).toBeCloseTo(100, 5);
    });
  });
});
