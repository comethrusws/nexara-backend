import { ErrorCodes, NexaraError } from '../errors/nexara-error';

export interface FeeSlabRuleInput {
  minAmount: number;
  maxAmount: number;
  flatFee?: number | string | null;
  percentFee?: number | string | null;
  type?: 'FIXED' | 'PERCENTAGE' | string | null;
}

/**
 * Shared validator for admin-configured fee slab schedules. Used by the
 * platform fee-config and per-merchant feeSlabsJson so both reject bad
 * schedules with the same rules.
 */
export function validateFeeSlabsJson(feeSlabsJson: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(feeSlabsJson);
  } catch {
    throw new NexaraError(
      ErrorCodes.INVALID_REQUEST,
      'feeSlabsJson must be valid JSON',
    );
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new NexaraError(
      ErrorCodes.INVALID_REQUEST,
      'feeSlabsJson must be a non-empty array of slab rules',
    );
  }
  for (const rule of parsed as Array<Record<string, unknown>>) {
    if (
      typeof rule.minAmount !== 'number' ||
      rule.minAmount < 0 ||
      typeof rule.maxAmount !== 'number' ||
      rule.maxAmount < 0 ||
      (rule.maxAmount !== 0 && rule.maxAmount <= rule.minAmount)
    ) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'Each fee slab needs minAmount >= 0 and maxAmount > minAmount (0 means no upper limit)',
      );
    }
    if (rule.flatFee == null && rule.percentFee == null) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'Each fee slab needs a flatFee, a percentFee, or both',
      );
    }
    if (
      rule.type != null &&
      rule.type !== 'FIXED' &&
      rule.type !== 'PERCENTAGE'
    ) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'Fee slab type must be FIXED or PERCENTAGE',
      );
    }
  }
}
