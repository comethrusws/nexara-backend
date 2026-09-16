import { IsNull, Not } from 'typeorm';
import { AuthService } from './auth.service';

describe('AuthService.assertRecentOnboardingOtp', () => {
  const makeService = (otps: { findOne: jest.Mock }) =>
    new AuthService(
      {} as any,
      {} as any,
      { get: jest.fn() } as any,
      otps as any,
      {} as any,
      {} as any,
      {} as any,
    );

  it('queries only consumed ONBOARDING OTPs (ignores pending resend rows)', async () => {
    const findOne = jest.fn().mockResolvedValue({
      mobile: '8950377111',
      purpose: 'ONBOARDING',
      consumedAt: new Date(),
    });
    const service = makeService({ findOne });

    await expect(
      service.assertRecentOnboardingOtp('+91 8950377111'),
    ).resolves.toBeUndefined();

    expect(findOne).toHaveBeenCalledWith({
      where: {
        mobile: '8950377111',
        purpose: 'ONBOARDING',
        consumedAt: Not(IsNull()),
      },
      order: { consumedAt: 'DESC' },
    });
  });

  it('rejects when no consumed OTP exists', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const service = makeService({ findOne });

    await expect(service.assertRecentOnboardingOtp('8950377111')).rejects.toMatchObject({
      message:
        'Please verify your registered mobile number with OTP before completing onboarding',
      status: 400,
    });
  });

  it('accepts an OTP consumed within the onboarding window', async () => {
    const findOne = jest.fn().mockResolvedValue({
      mobile: '8950377111',
      purpose: 'ONBOARDING',
      consumedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
    });
    const service = makeService({ findOne });

    await expect(
      service.assertRecentOnboardingOtp('8950377111'),
    ).resolves.toBeUndefined();
  });

  it('rejects an OTP consumed outside the 24h onboarding window', async () => {
    const findOne = jest.fn().mockResolvedValue({
      mobile: '8950377111',
      purpose: 'ONBOARDING',
      consumedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25h ago
    });
    const service = makeService({ findOne });

    await expect(service.assertRecentOnboardingOtp('8950377111')).rejects.toMatchObject({
      message: 'OTP verification expired. Please verify your mobile number again.',
      status: 400,
    });
  });
});
