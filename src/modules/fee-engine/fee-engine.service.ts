import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { validateFeeSlabsJson } from '../../common/validation/fee-slabs.validator';
import { AuditService } from '../audit/audit.service';
import { UpdatePlatformFeeConfigDto } from './dto/fee-config.dto';
import { PlatformFeeConfig } from './entities/platform-fee-config.entity';

export const PLATFORM_FEE_CONFIG_KEY = 'DEFAULT';

export const DEFAULT_STANDARD_SLABS = [
  { minAmount: 100, maxAmount: 1000, flatFee: 6, percentFee: 0.9, type: 'FIXED' },
  { minAmount: 1000, maxAmount: 2000, flatFee: 10, percentFee: 1.0, type: 'FIXED' },
  { minAmount: 2000, maxAmount: 0, flatFee: 15, percentFee: 1.2, type: 'FIXED' },
];

export const DEFAULT_API_SLABS = [
  { minAmount: 100, maxAmount: 25000, flatFee: 12, percentFee: 1.0, type: 'FIXED' },
  { minAmount: 25000, maxAmount: 0, flatFee: 20, percentFee: 1.5, type: 'FIXED' },
];

@Injectable()
export class FeeEngineService {
  constructor(
    @InjectRepository(PlatformFeeConfig)
    private readonly configs: Repository<PlatformFeeConfig>,
    private readonly audit: AuditService,
  ) {}

  async getConfig(): Promise<PlatformFeeConfig> {
    const existing = await this.configs.findOne({
      where: { key: PLATFORM_FEE_CONFIG_KEY },
    });
    if (existing) {
      return existing;
    }
    return this.configs.save(
      this.configs.create({
        key: PLATFORM_FEE_CONFIG_KEY,
        standardSlabsJson: JSON.stringify(DEFAULT_STANDARD_SLABS),
        apiSlabsJson: JSON.stringify(DEFAULT_API_SLABS),
        distributorCommissionPercent: '0.20',
        superDistributorCommissionPercent: '0.025',
        masterDistributorCommissionPercent: '0.010',
        gstPercent: '18.00',
        updatedBy: null,
      }),
    );
  }

  async updateConfig(
    input: UpdatePlatformFeeConfigDto,
    actorEmail = 'ops',
  ): Promise<PlatformFeeConfig> {
    const config = await this.getConfig();
    if (input.standardSlabsJson !== undefined) {
      validateFeeSlabsJson(input.standardSlabsJson);
      config.standardSlabsJson = input.standardSlabsJson;
    }
    if (input.apiSlabsJson !== undefined) {
      validateFeeSlabsJson(input.apiSlabsJson);
      config.apiSlabsJson = input.apiSlabsJson;
    }
    if (input.distributorCommissionPercent !== undefined) {
      config.distributorCommissionPercent = input.distributorCommissionPercent;
    }
    if (input.superDistributorCommissionPercent !== undefined) {
      config.superDistributorCommissionPercent =
        input.superDistributorCommissionPercent;
    }
    if (input.masterDistributorCommissionPercent !== undefined) {
      config.masterDistributorCommissionPercent =
        input.masterDistributorCommissionPercent;
    }
    if (input.gstPercent !== undefined) {
      config.gstPercent = input.gstPercent;
    }
    config.updatedBy = actorEmail;
    const saved = await this.configs.save(config);
    await this.audit.record({
      actorEmail,
      actorRole: 'ADMIN',
      action: 'PLATFORM_FEE_CONFIG_UPDATED',
      details: 'Platform fee slabs and commission rates updated',
      newValue: {
        distributorCommissionPercent: saved.distributorCommissionPercent,
        superDistributorCommissionPercent:
          saved.superDistributorCommissionPercent,
        masterDistributorCommissionPercent:
          saved.masterDistributorCommissionPercent,
        gstPercent: saved.gstPercent,
      },
    });
    return saved;
  }
}
