import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BankRegistry } from '../../integrations/banks/bank.registry';
import { FINERACT_PORT } from '../../integrations/fineract/fineract.types';
import { AuditService } from '../audit/audit.service';
import { FeeEngineService } from '../fee-engine/fee-engine.service';
import { FeeType, MerchantStatus } from '../merchants/merchant.enums';
import { MerchantsService } from '../merchants/merchants.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { WalletService } from '../wallet/wallet.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { Payout } from './entities/payout.entity';
import { PayoutStatusEvent } from './entities/payout-status-event.entity';
import { PayoutsService } from './payouts.service';

describe('PayoutsService', () => {
  const payouts = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const merchants = {
    requireActive: jest.fn(),
    requireById: jest.fn(),
    findByOrganizationId: jest.fn(),
  };
  const wallets = {
    getRequiredMapping: jest.fn(),
    creditWallet: jest.fn(),
  };
  const fineract = {
    getBalances: jest.fn(),
    blockFunds: jest.fn(),
    finalizeSuccessfulPayout: jest.fn(),
    releaseFunds: jest.fn(),
  };
  const bank = {
    validateBeneficiary: jest.fn(),
    initiatePayout: jest.fn(),
    getPayoutStatus: jest.fn(),
  };
  const banks = {
    get: jest.fn(),
  };
  const organizations = {
    assertPayoutRail: jest.fn(),
    resolveBankCode: jest.fn(),
    ancestors: jest.fn(),
  };

  let service: PayoutsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PayoutsService,
        { provide: getRepositoryToken(Payout), useValue: payouts },
        {
          provide: getRepositoryToken(PayoutStatusEvent),
          useValue: {
            save: jest.fn(),
            create: jest.fn((value) => value),
            find: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: MerchantsService, useValue: merchants },
        { provide: WalletService, useValue: wallets },
        { provide: OrganizationsService, useValue: organizations },
        { provide: NotificationsService, useValue: { notifyUser: jest.fn() } },
        { provide: WebhooksService, useValue: { emit: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
        {
          provide: FeeEngineService,
          useValue: { getConfig: jest.fn().mockResolvedValue(null) },
        },
        { provide: FINERACT_PORT, useValue: fineract },
        { provide: BankRegistry, useValue: banks },
      ],
    }).compile();
    service = module.get(PayoutsService);
    banks.get.mockReturnValue(bank);
    organizations.resolveBankCode.mockResolvedValue('MOCK');
  });

  it('blocks funds, calls the bank, and finalizes a successful payout', async () => {
    merchants.requireActive.mockResolvedValue({
      id: 'm1',
      organizationId: 'org-1',
      status: MerchantStatus.ACTIVE,
      dailyPayoutLimit: '1000000.00',
      feeType: FeeType.FIXED,
      feeValue: '10.00',
      gstPercent: '18.00',
    });
    payouts.findOne.mockResolvedValue(null);
    payouts.find.mockResolvedValue([]);
    wallets.getRequiredMapping.mockResolvedValue({
      fineractSavingsAccountId: 20,
    });
    fineract.getBalances.mockResolvedValue({
      total: '100000.00',
      blocked: '0.00',
      available: '100000.00',
    });
    fineract.blockFunds.mockResolvedValue({ fineractTransactionId: 99 });
    payouts.create.mockImplementation((value: Payout) => value);
    payouts.save.mockImplementation(async (value: Payout) => ({
      ...value,
      id: value.id ?? 'payout-1',
    }));
    bank.initiatePayout.mockResolvedValue({
      bankReference: 'MOCK-1',
      status: 'SUCCESS',
      provider: 'MOCK',
    });
    merchants.requireById.mockResolvedValue({
      id: 'm1',
      organizationId: 'org-1',
      distributorCommissionPercent: '0.20',
      superDistributorCommissionPercent: '0.025',
      masterDistributorCommissionPercent: '0.010',
    });
    organizations.ancestors.mockResolvedValue([
      { id: 'org-admin', type: 'ADMIN' },
      { id: 'org-sd', type: 'SUPER_DISTRIBUTOR' },
      { id: 'org-dist', type: 'DISTRIBUTOR' },
      { id: 'org-1', type: 'MERCHANT' },
    ]);
    merchants.findByOrganizationId.mockImplementation(
      async (orgId: string) => ({ id: `merchant-${orgId}` }),
    );
    wallets.creditWallet.mockResolvedValue({});

    const result = await service.create({
      merchantId: 'm1',
      merchantReference: 'ORD-1',
      amount: '20000.00',
      beneficiary: {
        name: 'Ravi Kumar',
        accountNumber: '12345678901',
        ifsc: 'YESB0000123',
        paymentMode: 'IMPS',
      },
    });

    expect(fineract.blockFunds).toHaveBeenCalledWith({
      savingsAccountId: 20,
      amount: '20011.80',
      reason: 'Payout ORD-1',
    });
    expect(organizations.assertPayoutRail).toHaveBeenCalledWith('org-1', 'IMPS');
    expect(banks.get).toHaveBeenCalledWith('MOCK');
    expect(fineract.finalizeSuccessfulPayout).toHaveBeenCalled();
    expect(result.status).toBe('SUCCESS');
    expect(result.reserved).toBe('20011.80');
    expect(result.bankCode).toBe('MOCK');
    // 3-layer upline commissions on ₹20000: 0.2% / 0.025% / 0.01%
    expect(wallets.creditWallet).toHaveBeenCalledTimes(3);
    expect(wallets.creditWallet).toHaveBeenCalledWith(
      'merchant-org-dist',
      expect.objectContaining({ amount: '40.00' }),
    );
    expect(wallets.creditWallet).toHaveBeenCalledWith(
      'merchant-org-sd',
      expect.objectContaining({ amount: '5.00' }),
    );
    expect(wallets.creditWallet).toHaveBeenCalledWith(
      'merchant-org-admin',
      expect.objectContaining({ amount: '2.00' }),
    );
    expect(result.commissions).toMatchObject({
      layer1Distributor: '40.00',
      layer2SuperDistributor: '5.00',
      layer3Master: '2.00',
    });
  });

  it('applies admin-configured custom slabs and channel at payout time', async () => {
    merchants.requireActive.mockResolvedValue({
      id: 'm1',
      organizationId: 'org-1',
      status: MerchantStatus.ACTIVE,
      dailyPayoutLimit: '1000000.00',
      feeType: FeeType.SLAB,
      feeValue: '0.00',
      gstPercent: '18.00',
      feeSlabsJson: JSON.stringify([
        { minAmount: 100, maxAmount: 1000, flatFee: 6, percentFee: 0.9, type: 'FIXED' },
        { minAmount: 1000, maxAmount: 2000, flatFee: 10, percentFee: 1.0, type: 'PERCENTAGE' },
      ]),
      channel: 'STANDARD',
    });
    payouts.findOne.mockResolvedValue(null);
    payouts.find.mockResolvedValue([]);
    wallets.getRequiredMapping.mockResolvedValue({
      fineractSavingsAccountId: 20,
    });
    fineract.getBalances.mockResolvedValue({
      total: '100000.00',
      blocked: '0.00',
      available: '100000.00',
    });
    fineract.blockFunds.mockResolvedValue({ fineractTransactionId: 99 });
    payouts.create.mockImplementation((value: Payout) => value);
    payouts.save.mockImplementation(async (value: Payout) => ({
      ...value,
      id: value.id ?? 'payout-1',
    }));
    bank.initiatePayout.mockResolvedValue({
      bankReference: 'MOCK-2',
      status: 'SUCCESS',
      provider: 'MOCK',
    });
    merchants.requireById.mockResolvedValue({
      id: 'm1',
      organizationId: 'org-1',
      distributorCommissionPercent: '0.20',
      superDistributorCommissionPercent: '0.025',
      masterDistributorCommissionPercent: '0.010',
    });
    organizations.ancestors.mockResolvedValue([
      { id: 'org-admin', type: 'ADMIN' },
      { id: 'org-1', type: 'MERCHANT' },
    ]);
    merchants.findByOrganizationId.mockResolvedValue(null);

    const result = await service.create({
      merchantId: 'm1',
      merchantReference: 'ORD-SLAB',
      amount: '1500.00',
      beneficiary: {
        name: 'Ravi Kumar',
        accountNumber: '12345678901',
        ifsc: 'YESB0000123',
        paymentMode: 'IMPS',
      },
    });

    // ₹1k-2k slab in PERCENTAGE mode: 1% of 1500 = ₹15.00 + 18% GST = ₹17.70
    expect(result.fee).toBe('15.00');
    expect(result.gst).toBe('2.70');
    expect(result.reserved).toBe('1517.70');
    expect(result.appliedSlab).toContain('1000-2000');
  });

  it('rejects a payout when the rail is not entitled', async () => {
    merchants.requireActive.mockResolvedValue({
      id: 'm1',
      organizationId: 'org-1',
      status: MerchantStatus.ACTIVE,
      dailyPayoutLimit: '1000000.00',
      feeType: FeeType.FIXED,
      feeValue: '10.00',
      gstPercent: '18.00',
    });
    payouts.findOne.mockResolvedValue(null);
    organizations.assertPayoutRail.mockRejectedValue({
      code: 'FEATURE_DISABLED',
    });

    await expect(
      service.create({
        merchantId: 'm1',
        merchantReference: 'ORD-2',
        amount: '100.00',
        beneficiary: {
          name: 'Ravi Kumar',
          accountNumber: '12345678901',
          ifsc: 'YESB0000123',
          paymentMode: 'UPI',
          vpa: 'ravi@upi',
        },
      }),
    ).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    expect(fineract.blockFunds).not.toHaveBeenCalled();
  });
});
