import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../audit/audit.service';
import { PlatformFeeConfig } from './entities/platform-fee-config.entity';
import { FeeEngineService } from './fee-engine.service';

describe('FeeEngineService', () => {
  const configs = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const audit = { record: jest.fn() };

  let service: FeeEngineService;

  beforeEach(async () => {
    jest.resetAllMocks();
    configs.create.mockImplementation((value) => value);
    configs.save.mockImplementation(async (value) => value);
    const module = await Test.createTestingModule({
      providers: [
        FeeEngineService,
        { provide: getRepositoryToken(PlatformFeeConfig), useValue: configs },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(FeeEngineService);
  });

  it('seeds platform defaults on first read', async () => {
    configs.findOne.mockResolvedValue(null);
    const config = await service.getConfig();
    expect(configs.save).toHaveBeenCalled();
    expect(config.distributorCommissionPercent).toBe('0.20');
    expect(config.superDistributorCommissionPercent).toBe('0.025');
    expect(config.masterDistributorCommissionPercent).toBe('0.010');
    expect(config.gstPercent).toBe('18.00');
    expect(JSON.parse(config.standardSlabsJson)).toHaveLength(3);
    expect(JSON.parse(config.apiSlabsJson)).toHaveLength(2);
  });

  it('returns the stored config when present', async () => {
    configs.findOne.mockResolvedValue({ key: 'DEFAULT', gstPercent: '18.00' });
    const config = await service.getConfig();
    expect(config.gstPercent).toBe('18.00');
    expect(configs.save).not.toHaveBeenCalled();
  });

  it('updates rates and rejects invalid slabs', async () => {
    configs.findOne.mockResolvedValue({
      key: 'DEFAULT',
      standardSlabsJson: '[]',
      apiSlabsJson: '[]',
      distributorCommissionPercent: '0.20',
      superDistributorCommissionPercent: '0.025',
      masterDistributorCommissionPercent: '0.010',
      gstPercent: '18.00',
    });
    await service.updateConfig(
      { distributorCommissionPercent: '0.30' },
      'admin@nexara.test',
    );
    expect(configs.save).toHaveBeenCalledWith(
      expect.objectContaining({ distributorCommissionPercent: '0.30' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PLATFORM_FEE_CONFIG_UPDATED' }),
    );

    await expect(
      service.updateConfig({ standardSlabsJson: 'not-json' }, 'admin@nexara.test'),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });
});
