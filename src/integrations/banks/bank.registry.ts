import { Injectable } from '@nestjs/common';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import { BankCodes } from '../../modules/organizations/organization.constants';
import { BankPort } from './bank.types';
import { MockBankAdapter } from './mock-bank.adapter';
import { UnconfiguredBankAdapter } from './unconfigured-bank.adapter';
import { YesBankAdapter } from './yesbank/yesbank.adapter';

export const BANK_REGISTRY = Symbol('BANK_REGISTRY');

@Injectable()
export class BankRegistry {
  private readonly adapters: Map<string, BankPort>;

  constructor(
    mock: MockBankAdapter,
    yesbank: YesBankAdapter,
  ) {
    this.adapters = new Map<string, BankPort>([
      [BankCodes.MOCK, mock],
      [BankCodes.YESBANK, yesbank],
      [BankCodes.HDFC, new UnconfiguredBankAdapter(BankCodes.HDFC, 'HDFC Bank')],
      [
        BankCodes.KOTAK,
        new UnconfiguredBankAdapter(BankCodes.KOTAK, 'Kotak Mahindra Bank'),
      ],
      [
        BankCodes.ICICI,
        new UnconfiguredBankAdapter(BankCodes.ICICI, 'ICICI Bank'),
      ],
    ]);
  }

  get(code: string): BankPort {
    const adapter = this.adapters.get(code.toUpperCase());
    if (!adapter) {
      throw new NexaraError(
        ErrorCodes.BANK_DISABLED,
        `No adapter registered for bank ${code}`,
        409,
      );
    }
    return adapter;
  }
}
