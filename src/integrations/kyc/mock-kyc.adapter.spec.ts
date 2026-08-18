import { MockKycAdapter } from './mock-kyc.adapter';

describe('MockKycAdapter', () => {
  const adapter = new MockKycAdapter();

  it('verifies a valid Aadhaar and masks it', async () => {
    const result = await adapter.verifyAadhaar({
      aadhaarNumber: '123412341234',
      merchantId: 'm1',
    });
    expect(result.status).toBe('VERIFIED');
    expect(result.provider).toBe('mock');
    expect(result.maskedValue).toBe('XXXXXXXX1234');
  });

  it('fails the reserved mock Aadhaar', async () => {
    const result = await adapter.verifyAadhaar({
      aadhaarNumber: '999999999999',
      merchantId: 'm1',
    });
    expect(result.status).toBe('FAILED');
  });

  it('verifies a valid PAN', async () => {
    const result = await adapter.verifyPan({
      pan: 'ABCDE1234F',
      merchantId: 'm1',
    });
    expect(result.status).toBe('VERIFIED');
    expect(result.maskedValue).toBe('ABCDE***4F');
  });
});
