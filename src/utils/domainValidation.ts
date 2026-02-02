/**
 * Domain Validation Utility
 * Client-side validation matching blockchain rules from lib-blockchain/src/contracts/root_registry/validation.rs
 *
 * This ensures domains are validated consistently on both client and blockchain
 */

export interface DomainValidationResult {
  valid: boolean;
  errors: string[];
  classification?: string;
  isReserved?: boolean;
}

/**
 * Reserved domain patterns that cannot be registered
 * These match the blockchain's reserved_root_registry and restricted patterns
 */
const RESERVED_WELFARE_SECTORS = ['food', 'health', 'edu', 'housing', 'energy'];
const META_GOVERNANCE_ROOT = 'dao';

/**
 * Validate domain format following blockchain rules
 * Ported from lib-blockchain/src/contracts/root_registry/validation.rs
 */
export function validateDomainFormat(domain: string): DomainValidationResult {
  const errors: string[] = [];

  if (!domain) {
    return {
      valid: false,
      errors: ['Domain is required'],
    };
  }

  // Convert to lowercase for validation (domains are case-insensitive)
  const normalizedDomain = domain.toLowerCase().trim();

  // Rule 1: Must end with .sov
  if (!normalizedDomain.endsWith('.sov')) {
    errors.push('Domain must end with .sov');
    return { valid: false, errors };
  }

  // Remove .sov suffix to work with labels
  const domainWithoutSuffix = normalizedDomain.slice(0, -4);

  if (!domainWithoutSuffix) {
    errors.push('Domain cannot be just ".sov"');
    return { valid: false, errors };
  }

  // Split into labels (parts separated by dots)
  const labels = domainWithoutSuffix.split('.');

  // Rule 2: Check label count (max 8 levels: e.g., a.b.c.d.e.f.g.h.sov)
  if (labels.length > 8) {
    errors.push('Domain can have maximum 8 levels (labels)');
  }

  // Rule 3: Validate each label
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];

    // 3a: Label length (1-63 characters each, per DNS spec)
    if (label.length === 0) {
      errors.push(`Label ${i + 1}: Cannot be empty`);
      continue;
    }
    if (label.length > 63) {
      errors.push(`Label ${i + 1}: Cannot exceed 63 characters`);
      continue;
    }

    // 3b: Valid characters - lowercase letters, numbers, hyphens only
    if (!/^[a-z0-9-]+$/.test(label)) {
      errors.push(`Label ${i + 1}: Contains invalid characters (only lowercase a-z, 0-9, and hyphens allowed)`);
      continue;
    }

    // 3c: Cannot start or end with hyphen
    if (label.startsWith('-') || label.endsWith('-')) {
      errors.push(`Label ${i + 1}: Cannot start or end with hyphen`);
      continue;
    }
  }

  // Rule 4: Total length (max 253 characters, per DNS spec)
  if (normalizedDomain.length > 253) {
    errors.push('Domain cannot exceed 253 characters');
  }

  // If there are format errors, return early
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Rule 5: Check for reserved patterns
  const classification = classifyDomain(labels);
  const isReserved = isReservedDomain(normalizedDomain);

  if (isReserved) {
    let reservationReason = '';

    if (normalizedDomain === 'dao.sov') {
      reservationReason = 'Reserved for meta-governance root';
    } else if (normalizedDomain.endsWith('.dao.sov')) {
      reservationReason = 'Reserved welfare sector - cannot register under .dao.sov';
    } else if (labels.length > 1 && labels[0] === META_GOVERNANCE_ROOT) {
      reservationReason = 'Requires ownership of the parent domain';
    }

    errors.push(`Reserved domain: ${reservationReason}`);
    return {
      valid: false,
      errors,
      classification,
      isReserved: true,
    };
  }

  // All validations passed
  return {
    valid: true,
    errors: [],
    classification,
    isReserved: false,
  };
}

/**
 * Classify a domain based on its labels
 * Returns the domain classification type
 */
export function classifyDomain(labels: string[]): 'commercial' | 'welfare_delegated' | 'reserved_welfare' | 'reserved_meta' {
  if (labels.length === 0) {
    return 'commercial';
  }

  // Meta-governance root: dao.sov
  if (labels.length === 1 && labels[0] === META_GOVERNANCE_ROOT) {
    return 'reserved_meta';
  }

  // Reserved welfare sectors: food.dao.sov, health.dao.sov, etc.
  if (labels.length === 2 && labels[1] === META_GOVERNANCE_ROOT && RESERVED_WELFARE_SECTORS.includes(labels[0])) {
    return 'reserved_welfare';
  }

  // Welfare delegated: e.g., kitchen.food.sov (under a welfare sector)
  if (labels.length >= 2 && RESERVED_WELFARE_SECTORS.includes(labels[labels.length - 1])) {
    return 'welfare_delegated';
  }

  // Default to commercial
  return 'commercial';
}

/**
 * Check if a domain is reserved (cannot be registered)
 */
export function isReservedDomain(domain: string): boolean {
  const normalizedDomain = domain.toLowerCase().trim();

  // Meta-governance root
  if (normalizedDomain === 'dao.sov') {
    return true;
  }

  // Reserved welfare sectors: food.dao.sov, health.dao.sov, etc.
  for (const sector of RESERVED_WELFARE_SECTORS) {
    if (normalizedDomain === `${sector}.dao.sov`) {
      return true;
    }
  }

  return false;
}

/**
 * Get a human-readable classification label
 */
export function getClassificationLabel(classification: string): string {
  switch (classification) {
    case 'commercial':
      return 'Commercial';
    case 'welfare_delegated':
      return 'Welfare Delegated';
    case 'reserved_welfare':
      return 'Reserved Welfare';
    case 'reserved_meta':
      return 'Reserved Meta-Governance';
    default:
      return 'Unknown';
  }
}

/**
 * Get a human-readable classification description
 */
export function getClassificationDescription(classification: string): string {
  switch (classification) {
    case 'commercial':
      return 'Standard commercial domain';
    case 'welfare_delegated':
      return 'Delegated welfare sector domain';
    case 'reserved_welfare':
      return 'Reserved for welfare sector governance';
    case 'reserved_meta':
      return 'Reserved for meta-governance';
    default:
      return '';
  }
}

/**
 * Validate domain duration (in days)
 */
export function validateDomainDuration(days: number | string): { valid: boolean; error?: string } {
  const daysNum = typeof days === 'string' ? parseInt(days, 10) : days;

  if (isNaN(daysNum)) {
    return { valid: false, error: 'Duration must be a number' };
  }

  // Min: 1 day, Max: 10 years (3650 days)
  if (daysNum < 1) {
    return { valid: false, error: 'Duration must be at least 1 day' };
  }

  if (daysNum > 3650) {
    return { valid: false, error: 'Duration cannot exceed 10 years' };
  }

  return { valid: true };
}

/**
 * Convert years to days
 */
export function yearsToDays(years: number | string): number {
  const yearsNum = typeof years === 'string' ? parseInt(years, 10) : years;
  return yearsNum * 365;
}

/**
 * Convert days to years (for display)
 */
export function daysToYears(days: number): number {
  return Math.round(days / 365 * 100) / 100;
}
