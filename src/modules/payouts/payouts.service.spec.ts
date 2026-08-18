import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BankRegistry } from '../../integrations/banks/bank.registry';
import { FINERACT_PORT } from '../../integrations/fineract/fineract.types';
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
  };
  const wallets = {
    getRequiredMapping: jest.fn(),
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
