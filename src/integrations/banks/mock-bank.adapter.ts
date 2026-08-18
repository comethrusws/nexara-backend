import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import {
  BankPort,
  BankPayoutResult,
  Beneficiary,
  InitiatePayoutInput,
} from './bank.types';

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_PATTERN = /^\d{9,18}$/;

@Injectable()
export class MockBankAdapter implements BankPort {
  private readonly byReference = new Map<string, BankPayoutResult>();
  private readonly byPayoutId = new Map<string, BankPayoutResult>();

  async validateBeneficiary(beneficiary: Beneficiary): Promise<void> {
    if (!beneficiary.name || beneficiary.name.trim().length < 3) {
      throw new NexaraError(
        ErrorCodes.INVALID_BENEFICIARY,
        'Beneficiary name is invalid',
      );
    }

    if (beneficiary.paymentMode === 'UPI') {
      if (!beneficiary.vpa || !beneficiary.vpa.includes('@')) {
        throw new NexaraError(
          ErrorCodes.INVALID_BENEFICIARY,
          'A valid VPA is required for UPI payouts',
        );
      }
      return;
    }

    const ifsc = beneficiary.ifsc?.toUpperCase() ?? '';
    if (!IFSC_PATTERN.test(ifsc)) {
      throw new NexaraError(
        ErrorCodes.INVALID_BENEFICIARY,
        'IFSC is invalid',
      );
    }
    if (!beneficiary.accountNumber || !ACCOUNT_PATTERN.test(beneficiary.accountNumber)) {
      throw new NexaraError(
        ErrorCodes.INVALID_BENEFICIARY,
        'Beneficiary account number is invalid',
      );
    }
  }

  async initiatePayout(input: InitiatePayoutInput): Promise<BankPayoutResult> {
    await this.validateBeneficiary(input.beneficiary);

    const existing = this.byPayoutId.get(input.nexaraPayoutId);
    if (existing) {
      return existing;
    }

    const result = this.decide(input);
    this.byPayoutId.set(input.nexaraPayoutId, result);
    this.byReference.set(result.bankReference, result);
    return result;
  }

  async getPayoutStatus(bankReference: string): Promise<BankPayoutResult> {
    const existing = this.byReference.get(bankReference);
    if (!existing) {
      throw new NexaraError(
        ErrorCodes.BANK_UNAVAILABLE,
        'Mock bank does not know this reference',
        404,
      );
    }
    return existing;
  }

  private decide(input: InitiatePayoutInput): BankPayoutResult {
    const bankReference = `MOCK-${input.nexaraPayoutId}-${randomUUID().slice(0, 8)}`;
    const account = input.beneficiary.accountNumber ?? '';
    const ifsc = input.beneficiary.ifsc?.toUpperCase() ?? '';

    if (account.endsWith('0000')) {
      return {
        bankReference,
        status: 'FAILED',
        provider: 'MOCK',
        failureReason: 'Mock bank rejected the beneficiary account',
      };
    }

    if (ifsc.startsWith('UNKN')) {
      return {
        bankReference,
        status: 'UNKNOWN',
        provider: 'MOCK',
      };
    }

    return {
      bankReference,
      status: 'SUCCESS',
      provider: 'MOCK',
    };
  }
}
