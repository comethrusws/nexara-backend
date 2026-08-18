import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import {
  BankPort,
  BankPayoutResult,
  Beneficiary,
  InitiatePayoutInput,
} from './bank.types';

export class UnconfiguredBankAdapter implements BankPort {
  constructor(
    private readonly code: string,
    private readonly label: string,
  ) {}

  async validateBeneficiary(_beneficiary: Beneficiary): Promise<void> {
    throw this.notReady();
  }

  async initiatePayout(_input: InitiatePayoutInput): Promise<BankPayoutResult> {
    throw this.notReady();
  }

  async getPayoutStatus(_bankReference: string): Promise<BankPayoutResult> {
    throw this.notReady();
  }

  private notReady(): NexaraError {
    return new NexaraError(
      ErrorCodes.BANK_NOT_CONFIGURED,
      `${this.label} (${this.code}) is registered but credentials are not configured yet`,
      503,
    );
  }
}
