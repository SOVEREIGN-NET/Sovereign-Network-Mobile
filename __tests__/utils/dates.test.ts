
import {
  formatDate,
  formatDateTime,
  formatTime,
  formatRelativeTime,
  getRemainingTime,
} from 'src/utils';

describe('Date Utilities', () => {
  const testDate = '2025-10-27T10:30:00Z';
  const pastDate = '2025-10-20T10:30:00Z';
  const futureDate = '2025-11-03T10:30:00Z';

  describe('formatDate', () => {
    it('should format date correctly', () => {
      const result = formatDate(testDate);
      expect(result).toMatch(/Oct/);
      expect(result).toMatch(/2025/);
    });

    it('should handle invalid dates', () => {
      const result = formatDate('invalid-date');
      expect(result).toBe('Invalid Date');
    });
  });

  describe('formatDateTime', () => {
    it('should format date and time', () => {
      const result = formatDateTime(testDate);
      expect(result).toMatch(/Oct/);
      expect(result).toMatch(/2025/);
      expect(result).toMatch(/:/); // Contains time
    });

    it('should handle invalid dates', () => {
      const result = formatDateTime('invalid-date');
      expect(result).toBe('Invalid Date');
    });
  });

  describe('formatTime', () => {
    it('should format time only', () => {
      const result = formatTime(testDate);
      expect(result).toMatch(/\d{1,2}:\d{2}/);
      expect(result).toMatch(/AM|PM|am|pm|:/);
    });

    it('should handle invalid dates', () => {
      const result = formatTime('invalid-date');
      expect(result).toBe('Invalid Date');
    });
  });

  describe('formatRelativeTime', () => {
    beforeEach(() => {
      // Mock current date to Oct 27, 2025 12:30:00 UTC
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-10-27T12:30:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should show "Just now" for recent times', () => {
      const recent = new Date(Date.now() - 30000).toISOString();
      const result = formatRelativeTime(recent);
      expect(result).toBe('Just now');
    });

    it('should show minutes ago', () => {
      const minutes = new Date(Date.now() - 5 * 60000).toISOString();
      const result = formatRelativeTime(minutes);
      expect(result).toMatch(/\d+m ago/);
    });

    it('should show hours ago', () => {
      const hours = new Date(Date.now() - 2 * 3600000).toISOString();
      const result = formatRelativeTime(hours);
      expect(result).toMatch(/\d+h ago/);
    });

    it('should show days ago', () => {
      const days = new Date(Date.now() - 3 * 86400000).toISOString();
      const result = formatRelativeTime(days);
      expect(result).toMatch(/\d+d ago/);
    });

    it('should show formatted date for old dates', () => {
      const oldDate = new Date(Date.now() - 10 * 86400000).toISOString();
      const result = formatRelativeTime(oldDate);
      expect(result).toMatch(/Oct|Nov|Sep/);
    });
  });

  describe('getRemainingTime', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-10-27T12:30:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should show "Ended" for past dates', () => {
      const result = getRemainingTime(pastDate);
      expect(result).toBe('Ended');
    });

    it('should show seconds remaining', () => {
      const soon = new Date(Date.now() + 45000).toISOString();
      const result = getRemainingTime(soon);
      expect(result).toMatch(/\d+s remaining/);
    });

    it('should show minutes remaining', () => {
      const soon = new Date(Date.now() + 5 * 60000).toISOString();
      const result = getRemainingTime(soon);
      expect(result).toMatch(/\d+m remaining/);
    });

    it('should show hours remaining', () => {
      const soon = new Date(Date.now() + 2 * 3600000).toISOString();
      const result = getRemainingTime(soon);
      expect(result).toMatch(/\d+h remaining/);
    });

    it('should show days remaining', () => {
      const soon = new Date(Date.now() + 5 * 86400000).toISOString();
      const result = getRemainingTime(soon);
      expect(result).toMatch(/\d+d remaining/);
    });
  });

  describe('error handling', () => {
    it('should handle invalid dates gracefully', () => {
      expect(() => formatDate('invalid')).not.toThrow();
      expect(() => formatTime('invalid')).not.toThrow();
      expect(() => getRemainingTime('invalid')).not.toThrow();
    });
  });
});
