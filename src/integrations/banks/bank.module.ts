import { Module } from '@nestjs/common';
import { BankRegistry, BANK_REGISTRY } from './bank.registry';
import { MockBankAdapter } from './mock-bank.adapter';
import { YesBankAdapter } from './yesbank/yesbank.adapter';

@Module({
  providers: [
    MockBankAdapter,
    YesBankAdapter,
    BankRegistry,
    {
      provide: BANK_REGISTRY,
      useExisting: BankRegistry,
    },
  ],
  exports: [BANK_REGISTRY, BankRegistry],
})
export class BankModule {}
