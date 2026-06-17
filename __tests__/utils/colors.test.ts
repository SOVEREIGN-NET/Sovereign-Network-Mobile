import {
  getTransactionColor,
  getTransactionIcon,
  getProposalStatusColor,
  getProposalStatusIcon,
  getWalletTypeIcon,
  getCategoryIcon,
  getNetworkHealthColor,
} from 'src/utils';
import { colors } from 'src/theme';

describe('Color Utilities', () => {
  describe('getTransactionColor', () => {
    it('should return error color for send', () => {
      expect(getTransactionColor('send')).toBe(colors.error);
    });

    it('should return success color for receive', () => {
      expect(getTransactionColor('receive')).toBe(colors.success);
    });

    it('should return info color for stake', () => {
      expect(getTransactionColor('stake')).toBe(colors.info);
    });

    it('should return warning color for ubs', () => {
      expect(getTransactionColor('ubs')).toBe(colors.warning);
    });
  });

  describe('getTransactionIcon', () => {
    it('should return correct icons', () => {
      expect(getTransactionIcon('send')).toBe('📤');
      expect(getTransactionIcon('receive')).toBe('📥');
      expect(getTransactionIcon('stake')).toBe('🔒');
      expect(getTransactionIcon('ubs')).toBe('💰');
    });
  });

  describe('getProposalStatusColor', () => {
    it('should return correct colors for statuses', () => {
      expect(getProposalStatusColor('active')).toBe(colors.info);
      expect(getProposalStatusColor('passed')).toBe(colors.success);
      expect(getProposalStatusColor('failed')).toBe(colors.error);
      expect(getProposalStatusColor('executed')).toBe(colors.success);
    });
  });

  describe('getProposalStatusIcon', () => {
    it('should return correct icons for statuses', () => {
      expect(getProposalStatusIcon('active')).toBe('🔄');
      expect(getProposalStatusIcon('passed')).toBe('✅');
      expect(getProposalStatusIcon('failed')).toBe('❌');
      expect(getProposalStatusIcon('executed')).toBe('✔️');
    });
  });

  describe('getWalletTypeIcon', () => {
    it('should return correct icons for wallet types', () => {
      expect(getWalletTypeIcon('primary')).toBe('💳');
      expect(getWalletTypeIcon('ubs')).toBe('💰');
      expect(getWalletTypeIcon('savings')).toBe('🏦');
    });
  });

  describe('getCategoryIcon', () => {
    it('should return correct icons for categories', () => {
      expect(getCategoryIcon('governance')).toBe('🏛️');
      expect(getCategoryIcon('funding')).toBe('💵');
      expect(getCategoryIcon('technical')).toBe('⚙️');
    });
  });

  describe('getNetworkHealthColor', () => {
    it('should return success color for healthy network', () => {
      expect(getNetworkHealthColor(90)).toBe(colors.success);
      expect(getNetworkHealthColor(80)).toBe(colors.success);
    });

    it('should return warning color for warning network', () => {
      expect(getNetworkHealthColor(70)).toBe(colors.warning);
      expect(getNetworkHealthColor(60)).toBe(colors.warning);
    });

    it('should return error color for unhealthy network', () => {
      expect(getNetworkHealthColor(50)).toBe(colors.error);
      expect(getNetworkHealthColor(0)).toBe(colors.error);
    });
  });
});
