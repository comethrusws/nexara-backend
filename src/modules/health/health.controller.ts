import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FineractAdapter } from '../../integrations/fineract/fineract.adapter';
import { Public } from '../auth/decorators/public.decorator';
import { OrganizationsService } from '../organizations/organizations.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly fineract: FineractAdapter,
    private readonly config: ConfigService,
    private readonly organizations: OrganizationsService,
  ) {}

  @Get()
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    let defaultBank: string | null = null;
    try {
      const banks = await this.organizations.listBanks();
      defaultBank = banks.find((bank) => bank.isDefault)?.code ?? null;
    } catch {
      defaultBank = null;
    }
    const checks = {
      postgres: false,
      fineract: false,
      kycProvider: this.config.get<string>('kyc.provider') ?? 'mock',
      bankProviderSeed: this.config.get<string>('bank.provider') ?? 'mock',
      defaultBank,
    };

    try {
      await this.dataSource.query('SELECT 1');
      checks.postgres = true;
    } catch {
      checks.postgres = false;
    }

    try {
      await this.fineract.ping();
      checks.fineract = true;
    } catch {
      checks.fineract = false;
    }

    const status = checks.postgres && checks.fineract ? 'ok' : 'degraded';
    return { status, checks };
  }
}
