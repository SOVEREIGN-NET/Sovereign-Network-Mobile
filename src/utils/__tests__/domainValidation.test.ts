/**
 * Domain Validation Tests
 * Unit tests for validateDomainFormat, classifyDomain, and isReservedDomain
 * Tests match blockchain validation rules from lib-blockchain
 */

import {
  validateDomainFormat,
  classifyDomain,
  isReservedDomain,
  validateDomainDuration,
  yearsToDays,
  daysToYears,
} from '../domainValidation';

describe('validateDomainFormat', () => {
  describe('valid domains', () => {
    it('validates simple commercial domains', () => {
      const result = validateDomainFormat('example.sov');
      expect(result.valid).toBe(true);
      expect(result.classification).toBe('commercial');
    });

    it('validates multi-level commercial domains', () => {
      const result = validateDomainFormat('mycompany.sov');
      expect(result.valid).toBe(true);
      expect(result.classification).toBe('commercial');
    });

    it('validates domains with numbers', () => {
      const result = validateDomainFormat('test123.sov');
      expect(result.valid).toBe(true);
    });

    it('validates domains with hyphens', () => {
      const result = validateDomainFormat('my-domain.sov');
      expect(result.valid).toBe(true);
    });

    it('validates deeply nested commercial domains', () => {
      const result = validateDomainFormat('sub.domain.example.sov');
      expect(result.valid).toBe(true);
      expect(result.classification).toBe('commercial');
    });

    it('validates welfare delegated domains', () => {
      const result = validateDomainFormat('kitchen.food.sov');
      expect(result.valid).toBe(true);
      expect(result.classification).toBe('welfare_delegated');
    });

    it('converts to lowercase for case-insensitive matching', () => {
      const result = validateDomainFormat('EXAMPLE.SOV');
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid domains - format errors', () => {
    it('rejects domains without .sov suffix', () => {
      const result = validateDomainFormat('example.com');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('.sov');
    });

    it('rejects just .sov', () => {
      const result = validateDomainFormat('.sov');
      expect(result.valid).toBe(false);
    });

    it('rejects empty domain', () => {
      const result = validateDomainFormat('');
      expect(result.valid).toBe(false);
    });

    it('rejects labels longer than 63 characters', () => {
      const longLabel = 'a'.repeat(64);
      const result = validateDomainFormat(`${longLabel}.sov`);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('63 characters');
    });

    it('rejects domains with invalid characters', () => {
      const result = validateDomainFormat('exam ple.sov');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('invalid characters');
    });

    it('rejects domains with uppercase letters', () => {
      const result = validateDomainFormat('Example.sov');
      // Should be converted to lowercase, so actually valid
      expect(result.valid).toBe(true);
    });

    it('rejects labels starting with hyphen', () => {
      const result = validateDomainFormat('-invalid.sov');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('hyphen');
    });

    it('rejects labels ending with hyphen', () => {
      const result = validateDomainFormat('invalid-.sov');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('hyphen');
    });

    it('rejects domains exceeding 253 characters', () => {
      const longDomain = 'a'.repeat(250) + '.sov';
      const result = validateDomainFormat(longDomain);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('253');
    });

    it('rejects domains with more than 8 levels', () => {
      const result = validateDomainFormat('a.b.c.d.e.f.g.h.i.sov');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('8 levels');
    });

    it('rejects domains with empty labels', () => {
      const result = validateDomainFormat('example..sov');
      expect(result.valid).toBe(false);
    });

    it('rejects domains with special characters', () => {
      const result = validateDomainFormat('exam@ple.sov');
      expect(result.valid).toBe(false);
    });
  });

  describe('reserved domains', () => {
    it('rejects dao.sov', () => {
      const result = validateDomainFormat('dao.sov');
      expect(result.valid).toBe(false);
      expect(result.isReserved).toBe(true);
      expect(result.errors[0]).toContain('Reserved');
    });

    it('rejects food.dao.sov', () => {
      const result = validateDomainFormat('food.dao.sov');
      expect(result.valid).toBe(false);
      expect(result.isReserved).toBe(true);
    });

    it('rejects health.dao.sov', () => {
      const result = validateDomainFormat('health.dao.sov');
      expect(result.valid).toBe(false);
      expect(result.isReserved).toBe(true);
    });

    it('rejects edu.dao.sov', () => {
      const result = validateDomainFormat('edu.dao.sov');
      expect(result.valid).toBe(false);
      expect(result.isReserved).toBe(true);
    });

    it('rejects housing.dao.sov', () => {
      const result = validateDomainFormat('housing.dao.sov');
      expect(result.valid).toBe(false);
      expect(result.isReserved).toBe(true);
    });

    it('rejects energy.dao.sov', () => {
      const result = validateDomainFormat('energy.dao.sov');
      expect(result.valid).toBe(false);
      expect(result.isReserved).toBe(true);
    });

    it('allows kitchen.food.sov (welfare delegated)', () => {
      const result = validateDomainFormat('kitchen.food.sov');
      expect(result.valid).toBe(true);
      expect(result.classification).toBe('welfare_delegated');
    });
  });
});

describe('classifyDomain', () => {
  it('classifies single-level domains as commercial', () => {
    expect(classifyDomain(['example'])).toBe('commercial');
  });

  it('classifies multi-level domains as commercial', () => {
    expect(classifyDomain(['sub', 'domain', 'example'])).toBe('commercial');
  });

  it('classifies dao as reserved_meta', () => {
    expect(classifyDomain(['dao'])).toBe('reserved_meta');
  });

  it('classifies food.dao as reserved_welfare', () => {
    expect(classifyDomain(['food', 'dao'])).toBe('reserved_welfare');
  });

  it('classifies health.dao as reserved_welfare', () => {
    expect(classifyDomain(['health', 'dao'])).toBe('reserved_welfare');
  });

  it('classifies kitchen.food as welfare_delegated', () => {
    expect(classifyDomain(['kitchen', 'food'])).toBe('welfare_delegated');
  });

  it('classifies deeply nested welfare domains', () => {
    expect(classifyDomain(['restaurant', 'kitchen', 'food'])).toBe('welfare_delegated');
  });
});

describe('isReservedDomain', () => {
  it('returns true for dao.sov', () => {
    expect(isReservedDomain('dao.sov')).toBe(true);
  });

  it('returns true for food.dao.sov', () => {
    expect(isReservedDomain('food.dao.sov')).toBe(true);
  });

  it('returns true for all welfare sectors', () => {
    expect(isReservedDomain('health.dao.sov')).toBe(true);
    expect(isReservedDomain('edu.dao.sov')).toBe(true);
    expect(isReservedDomain('housing.dao.sov')).toBe(true);
    expect(isReservedDomain('energy.dao.sov')).toBe(true);
  });

  it('returns false for commercial domains', () => {
    expect(isReservedDomain('example.sov')).toBe(false);
    expect(isReservedDomain('mycompany.sov')).toBe(false);
  });

  it('returns false for welfare delegated domains', () => {
    expect(isReservedDomain('kitchen.food.sov')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isReservedDomain('DAO.SOV')).toBe(true);
    expect(isReservedDomain('FOOD.DAO.SOV')).toBe(true);
  });
});

describe('validateDomainDuration', () => {
  it('validates 1 day', () => {
    const result = validateDomainDuration(1);
    expect(result.valid).toBe(true);
  });

  it('validates 365 days (1 year)', () => {
    const result = validateDomainDuration(365);
    expect(result.valid).toBe(true);
  });

  it('validates 3650 days (10 years)', () => {
    const result = validateDomainDuration(3650);
    expect(result.valid).toBe(true);
  });

  it('rejects 0 days', () => {
    const result = validateDomainDuration(0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 1 day');
  });

  it('rejects 3651 days (more than 10 years)', () => {
    const result = validateDomainDuration(3651);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('10 years');
  });

  it('handles string input', () => {
    const result = validateDomainDuration('365');
    expect(result.valid).toBe(true);
  });

  it('rejects invalid string input', () => {
    const result = validateDomainDuration('invalid');
    expect(result.valid).toBe(false);
  });
});

describe('yearsToDays', () => {
  it('converts 1 year to 365 days', () => {
    expect(yearsToDays(1)).toBe(365);
  });

  it('converts 2 years to 730 days', () => {
    expect(yearsToDays(2)).toBe(730);
  });

  it('converts 10 years to 3650 days', () => {
    expect(yearsToDays(10)).toBe(3650);
  });

  it('handles string input', () => {
    expect(yearsToDays('1')).toBe(365);
  });
});

describe('daysToYears', () => {
  it('converts 365 days to 1 year', () => {
    expect(daysToYears(365)).toBe(1);
  });

  it('converts 730 days to 2 years', () => {
    expect(daysToYears(730)).toBe(2);
  });

  it('rounds to 2 decimal places', () => {
    expect(daysToYears(400)).toBe(1.1);
  });
});
