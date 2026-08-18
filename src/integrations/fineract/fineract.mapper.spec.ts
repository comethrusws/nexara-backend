import { formatAmount } from '../../common/money/money';
import { mapFineractError, mapWalletBalances } from './fineract.mapper';

describe('mapWalletBalances', () => {
  it('maps total, blocked and available from a Fineract savings account', () => {
    const balances = mapWalletBalances({
      savingsAmountOnHold: 20011.8,
      summary: {
        accountBalance: 100000,
        availableBalance: 79988.2,
      },
    });

    expect(balances).toEqual({
      total: '100000.00',
      blocked: '20011.80',
      available: '79988.20',
    });
  });

  it('computes available when Fineract omits availableBalance', () => {
    const balances = mapWalletBalances({
      savingsAmountOnHold: 5000,
      summary: {
        accountBalance: 20000,
      },
    });

    expect(balances).toEqual({
      total: '20000.00',
      blocked: '5000.00',
      available: '15000.00',
    });
  });
});

describe('mapFineractError', () => {
  it('maps insufficient-balance domain violations', () => {
    const error = mapFineractError(
      403,
      { defaultUserMessage: 'Insufficient account balance' },
      'hold failed',
    );
    expect(error.code).toBe('INSUFFICIENT_BALANCE');
    expect(error.status).toBe(422);
  });

  it('maps authentication failures', () => {
    const error = mapFineractError(401, {}, 'unauthorized');
    expect(error.code).toBe('FINERACT_UNAVAILABLE');
  });
});

describe('formatAmount', () => {
  it('formats INR amounts to 2 decimal places', () => {
    expect(formatAmount(10)).toBe('10.00');
    expect(formatAmount(1.8)).toBe('1.80');
  });
});
