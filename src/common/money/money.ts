import { NexaraError, ErrorCodes } from '../errors/nexara-error';

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

export function parseAmount(amount: string): number {
  if (!AMOUNT_PATTERN.test(amount)) {
    throw new NexaraError(
      ErrorCodes.INVALID_REQUEST,
      'Amount must be a positive INR value with up to 2 decimal places',
    );
  }
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new NexaraError(
      ErrorCodes.INVALID_REQUEST,
      'Amount must be greater than zero',
    );
  }
  return value;
}

export function formatAmount(value: number | string | null | undefined): string {
  const numeric = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return '0.00';
  }
  return numeric.toFixed(2);
}

export function formatFineractDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function parseNonNegativeAmount(amount: string): number {
  if (!AMOUNT_PATTERN.test(amount)) {
    throw new NexaraError(
      ErrorCodes.INVALID_REQUEST,
      'Amount must be an INR value with up to 2 decimal places',
    );
  }
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) {
    throw new NexaraError(
      ErrorCodes.INVALID_REQUEST,
      'Amount cannot be negative',
    );
  }
  return value;
}

export function toCents(amount: string): number {
  return Math.round(parseNonNegativeAmount(amount) * 100);
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function addAmounts(...amounts: string[]): string {
  return fromCents(amounts.reduce((sum, amount) => sum + toCents(amount), 0));
}
