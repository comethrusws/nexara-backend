import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ErrorCodes } from '../../common/errors/nexara-error';
import { FINERACT_PORT } from '../../integrations/fineract/fineract.types';
import { WalletFunding } from './entities/wallet-funding.entity';
import { WalletMapping } from './entities/wallet-mapping.entity';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  const mappings = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const fineract = {
    openMerchantWallet: jest.fn(),
    getBalances: jest.fn(),
    creditWallet: jest.fn(),
  };

  let service: WalletService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: getRepositoryToken(WalletMapping), useValue: mappings },
        {
          provide: getRepositoryToken(WalletFunding),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        { provide: FINERACT_PORT, useValue: fineract },
      ],
    }).compile();
    service = module.get(WalletService);
  });

  it('opens a new wallet through Fineract and stores the mapping', async () => {
    mappings.findOne.mockResolvedValue(null);
    fineract.openMerchantWallet.mockResolvedValue({
      fineractClientId: 10,
      fineractSavingsAccountId: 20,
      fineractExternalId: 'wallet-m1',
    });
    mappings.create.mockImplementation((value: WalletMapping) => value);
    mappings.save.mockImplementation(async (value: WalletMapping) => value);
    fineract.getBalances.mockResolvedValue({
      total: '0.00',
      blocked: '0.00',
      available: '0.00',
    });

    const result = await service.openWallet({
      merchantId: 'm1',
      businessName: 'Acme',
    });

    expect(fineract.openMerchantWallet).toHaveBeenCalledWith({
      merchantId: 'm1',
      businessName: 'Acme',
    });
    expect(result.fineractSavingsAccountId).toBe(20);
    expect(result.balances.available).toBe('0.00');
  });

  it('returns existing wallet without creating another Fineract account', async () => {
    mappings.findOne.mockResolvedValue({
      merchantId: 'm1',
      fineractClientId: 10,
      fineractSavingsAccountId: 20,
    });
    fineract.getBalances.mockResolvedValue({
      total: '100.00',
      blocked: '0.00',
      available: '100.00',
    });

    const result = await service.openWallet({
      merchantId: 'm1',
      businessName: 'Acme',
    });

    expect(fineract.openMerchantWallet).not.toHaveBeenCalled();
    expect(result.balances.total).toBe('100.00');
  });

  it('throws WALLET_NOT_FOUND when mapping is missing', async () => {
    mappings.findOne.mockResolvedValue(null);
    await expect(service.getWallet('missing')).rejects.toMatchObject({
      code: ErrorCodes.WALLET_NOT_FOUND,
      status: 404,
    });
  });
});
