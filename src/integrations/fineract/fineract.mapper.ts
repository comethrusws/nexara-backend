import { NexaraError, ErrorCodes } from '../../common/errors/nexara-error';
import { formatAmount } from '../../common/money/money';
import { StatementLine, WalletBalances } from './fineract.types';

export function mapWalletBalances(
  account: Record<string, unknown>,
): WalletBalances {
  const summary =
    typeof account.summary === 'object' && account.summary !== null
      ? (account.summary as Record<string, unknown>)
      : {};

  const total = Number(summary.accountBalance ?? 0);
  const availableFromSummary = summary.availableBalance;
  const blockedFromAccount = Number(
    account.savingsAmountOnHold ?? account.onHoldFunds ?? 0,
  );
  const blockedFromSummary = Number(
    summary.savingsAmountOnHold ?? summary.onHoldFunds ?? 0,
  );
  const blocked = blockedFromAccount || blockedFromSummary;
  const available =
    availableFromSummary !== undefined && availableFromSummary !== null
      ? Number(availableFromSummary)
      : total - blocked;

  return {
    total: formatAmount(total),
    blocked: formatAmount(blocked),
    available: formatAmount(available),
  };
}

export function mapFineractError(
  status: number,
  body: unknown,
  fallbackMessage: string,
): NexaraError {
  const text = extractFineractMessage(body);

  if (status === 401) {
    return new NexaraError(
      ErrorCodes.FINERACT_UNAVAILABLE,
      'Fineract authentication failed',
      502,
    );
  }

  if (status >= 500 || status === 0) {
    return new NexaraError(
      ErrorCodes.FINERACT_UNAVAILABLE,
      status === 0 && fallbackMessage
        ? `Fineract is unavailable: ${fallbackMessage}`
        : 'Fineract is unavailable',
      502,
    );
  }

  const combined = `${text} ${fallbackMessage}`.toLowerCase();
  if (
    combined.includes('insufficient') ||
    combined.includes('available balance') ||
    combined.includes('minrequiredbalance')
  ) {
    return new NexaraError(
      ErrorCodes.INSUFFICIENT_BALANCE,
      'Available balance is insufficient',
      422,
    );
  }

  if (
    combined.includes('externalid') &&
    (combined.includes('already') || combined.includes('duplicate'))
  ) {
    return new NexaraError(
      ErrorCodes.DUPLICATE_REFERENCE,
      'A Fineract record with this reference already exists',
      409,
    );
  }

  return new NexaraError(
    ErrorCodes.FINERACT_ERROR,
    text || fallbackMessage,
    502,
  );
}

export function extractFineractMessage(body: unknown): string {
  if (!body || typeof body !== 'object') {
    return '';
  }
  const record = body as {
    defaultUserMessage?: string;
    developerMessage?: string;
    errors?: Array<{ defaultUserMessage?: string }>;
  };
  const firstError = record.errors?.[0]?.defaultUserMessage;
  return (
    firstError ?? record.defaultUserMessage ?? record.developerMessage ?? ''
  );
}

export function asRecord(
  value: unknown,
  context: string,
): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new NexaraError(
    ErrorCodes.FINERACT_ERROR,
    `Unexpected Fineract response for ${context}`,
    502,
  );
}

export function readNumericId(
  record: Record<string, unknown>,
  keys: string[],
  context: string,
): number {
  for (const key of keys) {
    const value = record[key];
    const numeric = Number(value);
    if (Number.isInteger(numeric) && numeric > 0) {
      return numeric;
    }
  }
  throw new NexaraError(
    ErrorCodes.FINERACT_ERROR,
    `Fineract did not return an id for ${context}`,
    502,
  );
}

export function mapStatementLine(raw: Record<string, unknown>): StatementLine {
  const typeInfo =
    typeof raw.transactionType === 'object' && raw.transactionType !== null
      ? (raw.transactionType as Record<string, unknown>)
      : {};
  const typeCode = String(typeInfo.code ?? typeInfo.value ?? '').toLowerCase();
  let type: StatementLine['type'] = 'OTHER';
  if (typeCode.includes('deposit') || typeCode.includes('credit')) {
    type = 'CREDIT';
  } else if (typeCode.includes('withdrawal') || typeCode.includes('debit')) {
    type = 'DEBIT';
  } else if (typeCode.includes('hold')) {
    type = 'HOLD';
  } else if (typeCode.includes('release')) {
    type = 'RELEASE';
  }

  const dateValue = raw.date;
  let date = '';
  if (Array.isArray(dateValue) && dateValue.length >= 3) {
    const [year, month, day] = dateValue;
    date = `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } else if (typeof dateValue === 'string') {
    date = dateValue;
  }

  const paymentDetail =
    typeof raw.paymentDetailData === 'object' && raw.paymentDetailData !== null
      ? (raw.paymentDetailData as Record<string, unknown>)
      : {};

  return {
    transactionId: Number(raw.id ?? 0),
    date,
    amount: formatAmount(raw.amount as number | string | undefined),
    type,
    reversed: Boolean(raw.reversed),
    receiptNumber:
      typeof paymentDetail.receiptNumber === 'string'
        ? paymentDetail.receiptNumber
        : undefined,
    note: typeof raw.note === 'string' ? raw.note : undefined,
    runningBalance:
      raw.runningBalance !== undefined
        ? formatAmount(raw.runningBalance as number | string)
        : undefined,
  };
}

export function savingsExternalId(merchantId: string): string {
  return `wallet-${merchantId}`;
}
