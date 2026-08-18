import { MockBankAdapter } from './mock-bank.adapter';

describe('MockBankAdapter', () => {
  const adapter = new MockBankAdapter();

  it('accepts a valid IMPS beneficiary and succeeds', async () => {
    const result = await adapter.initiatePayout({
      nexaraPayoutId: 'p1',
      merchantReference: 'ORD-1',
      amount: '100.00',
      beneficiary: {
        name: 'Ravi Kumar',
        accountNumber: '12345678901',
        ifsc: 'YESB0000123',
        paymentMode: 'IMPS',
      },
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.provider).toBe('MOCK');
  });

  it('fails accounts ending in 0000', async () => {
    const result = await adapter.initiatePayout({
      nexaraPayoutId: 'p2',
      merchantReference: 'ORD-2',
      amount: '100.00',
      beneficiary: {
        name: 'Ravi Kumar',
        accountNumber: '1234560000',
        ifsc: 'YESB0000123',
        paymentMode: 'IMPS',
      },
    });
    expect(result.status).toBe('FAILED');
  });

  it('returns UNKNOWN for UNKN IFSC', async () => {
    const result = await adapter.initiatePayout({
      nexaraPayoutId: 'p3',
      merchantReference: 'ORD-3',
      amount: '100.00',
      beneficiary: {
        name: 'Ravi Kumar',
        accountNumber: '12345678901',
        ifsc: 'UNKN0000123',
        paymentMode: 'NEFT',
      },
    });
    expect(result.status).toBe('UNKNOWN');
  });
});
