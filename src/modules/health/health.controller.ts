import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { FineractAdapter } from '../../integrations/fineract/fineract.adapter';
import { Public } from '../auth/decorators/public.decorator';
import { OrganizationsService } from '../organizations/organizations.service';

@Public()
@ApiTags('Health')
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
    const checks: {
      postgres: boolean;
      fineract: boolean;
      fineractError: string | null;
      kycProvider: string;
      bankProviderSeed: string;
      defaultBank: string | null;
    } = {
      postgres: false,
      fineract: false,
      fineractError: null,
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
    } catch (error) {
      checks.fineract = false;
      checks.fineractError =
        error instanceof Error ? error.message : 'Fineract ping failed';
    }

    const status = checks.postgres && checks.fineract ? 'ok' : 'degraded';
    return { status, checks };
  }
}
