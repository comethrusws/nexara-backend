import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCodes, NexaraError } from '../../../common/errors/nexara-error';
import {
  BankPort,
  BankPayoutResult,
  Beneficiary,
  InitiatePayoutInput,
} from '../bank.types';

@Injectable()
export class YesBankAdapter implements BankPort {
  constructor(private readonly config: ConfigService) {}

  async validateBeneficiary(_beneficiary: Beneficiary): Promise<void> {
    this.ensureConfigured();
    throw this.notReady();
  }

  async initiatePayout(_input: InitiatePayoutInput): Promise<BankPayoutResult> {
    this.ensureConfigured();
    throw this.notReady();
  }

  async getPayoutStatus(_bankReference: string): Promise<BankPayoutResult> {
    this.ensureConfigured();
    throw this.notReady();
  }

  private ensureConfigured(): void {
    const clientId = this.config.get<string>('bank.yesbank.clientId') ?? '';
    const clientSecret =
      this.config.get<string>('bank.yesbank.clientSecret') ?? '';
    if (!clientId || !clientSecret) {
      throw new NexaraError(
        ErrorCodes.BANK_NOT_CONFIGURED,
        'YES Bank credentials are not configured',
        503,
      );
    }
  }

  private notReady(): NexaraError {
    return new NexaraError(
      ErrorCodes.BANK_NOT_CONFIGURED,
      'YES Bank payouts will be enabled after API credentials are issued',
      503,
    );
  }
}
