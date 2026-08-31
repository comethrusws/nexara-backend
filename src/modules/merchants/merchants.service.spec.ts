import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ErrorCodes } from '../../common/errors/nexara-error';
import { KYC_PORT } from '../../integrations/kyc/kyc.types';
import { OBJECT_STORAGE } from '../../integrations/storage/storage.types';
import { UsersService } from '../auth/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { WalletService } from '../wallet/wallet.service';
import { Payout } from '../payouts/entities/payout.entity';
import { Merchant } from './entities/merchant.entity';
import { MerchantKyc } from './entities/merchant-kyc.entity';
import { MerchantStatus } from './merchant.enums';
import { MerchantsService } from './merchants.service';

describe('MerchantsService', () => {
  const merchants = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };
  const kycRecords = {
    create: jest.fn(),
    save: jest.fn(),
  };
  const kyc = {
    verifyAadhaar: jest.fn(),
    verifyPan: jest.fn(),
  };
  const wallets = {
    openWallet: jest.fn(),
  };
  const organizations = {
    ensureSeeded: jest.fn(),
    createMerchantOrganization: jest.fn(),
    get: jest.fn(),
    assertAncestorsActive: jest.fn(),
    assertFeature: jest.fn(),
  };

  let service: MerchantsService;
  const merchant: Merchant = {
    id: 'm1',
    businessName: 'Acme',
    contactPerson: 'Ravi',
    mobile: '9876543210',
    email: 'ops@acme.test',
    address: 'Mumbai',
    status: MerchantStatus.KYC_PENDING,
    dailyPayoutLimit: '1000000.00',
    feeType: 'FIXED' as Merchant['feeType'],
    feeValue: '10.00',
    gstPercent: '18.00',
    perPayoutLimit: null,
    tier: 'SILVER' as Merchant['tier'],
    organizationId: 'org-1',
    kyc: {
      aadhaarStatus: 'VERIFIED',
      panStatus: 'VERIFIED',
      aadhaarImageMatch: 'MATCHED',
      panImageMatch: 'MATCHED',
    } as MerchantKyc,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        MerchantsService,
        { provide: getRepositoryToken(Merchant), useValue: merchants },
        { provide: getRepositoryToken(MerchantKyc), useValue: kycRecords },
        { provide: getRepositoryToken(Payout), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: KYC_PORT, useValue: kyc },
        {
          provide: OBJECT_STORAGE,
          useValue: { putObject: jest.fn(async ({ key }: { key: string }) => ({ key, url: `s3://test/${key}` })) },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => (key === 'kyc.provider' ? 'mock' : undefined)) },
        },
        { provide: WalletService, useValue: wallets },
        { provide: OrganizationsService, useValue: organizations },
        { provide: UsersService, useValue: { createMerchantUser: jest.fn() } },
        {
          provide: NotificationsService,
          useValue: { notifyUser: jest.fn() },
        },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = module.get(MerchantsService);
    organizations.get.mockResolvedValue({
      id: 'org-1',
      features: ['WALLET', 'PAYOUT', 'PAYOUT_IMPS'],
      resolvedBank: 'MOCK',
    });
  });

  it('activates a KYC-complete merchant and opens a wallet', async () => {
    merchants.findOne.mockResolvedValue({ ...merchant });
    merchants.save.mockImplementation(async (value: Merchant) => value);
    wallets.openWallet.mockResolvedValue({});

    const result = await service.activate('m1');

    expect(wallets.openWallet).toHaveBeenCalledWith({
      merchantId: 'm1',
      businessName: 'Acme',
      mobileNo: '9876543210',
    });
    expect(result.status).toBe(MerchantStatus.ACTIVE);
  });

  it('blocks activation when KYC is incomplete', async () => {
    merchants.findOne.mockResolvedValue({
      ...merchant,
      kyc: { aadhaarStatus: 'PENDING', panStatus: 'VERIFIED' },
    });

    await expect(service.activate('m1')).rejects.toMatchObject({
      code: ErrorCodes.KYC_INCOMPLETE,
    });
    expect(wallets.openWallet).not.toHaveBeenCalled();
  });
});
