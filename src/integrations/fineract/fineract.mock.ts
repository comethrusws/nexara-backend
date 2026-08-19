import { Injectable } from '@nestjs/common';
import {
  BlockFundsInput,
  CreditWalletInput,
  DebitWalletInput,
  FinalizeSuccessfulPayoutInput,
  FineractPort,
  LedgerPosting,
  OpenedWallet,
  OpenMerchantWalletInput,
  ReleaseFundsInput,
  StatementLine,
  WalletBalances,
} from './fineract.types';

interface MockAccount {
  id: number;
  merchantId: string;
  total: number;
  blocked: number;
  statement: StatementLine[];
  holds: Map<number, number>; // holdId -> amount
}

@Injectable()
export class MockFineractAdapter implements FineractPort {
  private nextAccountId = 1000;
  private nextTxId = 5000;
  private accounts = new Map<number, MockAccount>(); // accountId -> MockAccount
  private merchantAccountMap = new Map<string, number>(); // merchantId -> accountId

  async ping(): Promise<void> {
    return;
  }

  async openMerchantWallet(input: OpenMerchantWalletInput): Promise<OpenedWallet> {
    let accountId = this.merchantAccountMap.get(input.merchantId);
    if (!accountId) {
      accountId = this.nextAccountId++;
      this.merchantAccountMap.set(input.merchantId, accountId);
      this.accounts.set(accountId, {
        id: accountId,
        merchantId: input.merchantId,
        total: 0,
        blocked: 0,
        statement: [],
        holds: new Map(),
      });
    }

    return {
      fineractClientId: accountId * 10,
      fineractSavingsAccountId: accountId,
      fineractExternalId: `sav_${input.merchantId}`,
    };
  }

  async getBalances(savingsAccountId: number): Promise<WalletBalances> {
    const acc = this.requireAccount(savingsAccountId);
    const available = Math.max(0, acc.total - acc.blocked);
    return {
      total: acc.total.toFixed(2),
      blocked: acc.blocked.toFixed(2),
      available: available.toFixed(2),
    };
  }

  async creditWallet(input: CreditWalletInput): Promise<LedgerPosting> {
    const acc = this.requireAccount(input.savingsAccountId);
    const amt = Number(input.amount);
    acc.total += amt;
    const txId = this.nextTxId++;

    acc.statement.unshift({
      transactionId: txId,
      date: new Date().toISOString(),
      amount: amt.toFixed(2),
      type: 'CREDIT',
      reversed: false,
      receiptNumber: input.receiptNumber,
      note: input.note ?? 'Wallet Credit',
      runningBalance: acc.total.toFixed(2),
    });

    return { fineractTransactionId: txId };
  }

  async blockFunds(input: BlockFundsInput): Promise<LedgerPosting> {
    const acc = this.requireAccount(input.savingsAccountId);
    const amt = Number(input.amount);
    acc.blocked += amt;
    const holdId = this.nextTxId++;
    acc.holds.set(holdId, amt);

    acc.statement.unshift({
      transactionId: holdId,
      date: new Date().toISOString(),
      amount: amt.toFixed(2),
      type: 'HOLD',
      reversed: false,
      note: input.reason,
      runningBalance: acc.total.toFixed(2),
    });

    return { fineractTransactionId: holdId };
  }

  async releaseFunds(input: ReleaseFundsInput): Promise<LedgerPosting> {
    const acc = this.requireAccount(input.savingsAccountId);
    const amt = acc.holds.get(input.holdTransactionId) ?? 0;
    if (amt > 0) {
      acc.blocked = Math.max(0, acc.blocked - amt);
      acc.holds.delete(input.holdTransactionId);
    }
    const relId = this.nextTxId++;

    acc.statement.unshift({
      transactionId: relId,
      date: new Date().toISOString(),
      amount: amt.toFixed(2),
      type: 'RELEASE',
      reversed: false,
      note: 'Funds Released',
      runningBalance: acc.total.toFixed(2),
    });

    return { fineractTransactionId: relId };
  }

  async debitPayout(input: DebitWalletInput): Promise<LedgerPosting> {
    const acc = this.requireAccount(input.savingsAccountId);
    const amt = Number(input.amount);
    acc.total -= amt;
    const txId = this.nextTxId++;

    acc.statement.unshift({
      transactionId: txId,
      date: new Date().toISOString(),
      amount: amt.toFixed(2),
      type: 'DEBIT',
      reversed: false,
      receiptNumber: input.receiptNumber,
      note: input.note ?? 'Payout Debit',
      runningBalance: acc.total.toFixed(2),
    });

    return { fineractTransactionId: txId };
  }

  async chargeFee(input: DebitWalletInput): Promise<LedgerPosting> {
    return this.debitPayout(input);
  }

  async chargeGst(input: DebitWalletInput): Promise<LedgerPosting> {
    return this.debitPayout(input);
  }

  async finalizeSuccessfulPayout(
    input: FinalizeSuccessfulPayoutInput,
  ): Promise<void> {
    await this.releaseFunds({
      savingsAccountId: input.savingsAccountId,
      holdTransactionId: input.holdTransactionId,
    });
    await this.debitPayout({
      savingsAccountId: input.savingsAccountId,
      amount: input.payoutAmount,
      receiptNumber: input.receiptNumber,
      note: input.payoutNote ?? `Payout ${input.receiptNumber}`,
    });
    if (Number(input.feeAmount) > 0) {
      await this.chargeFee({
        savingsAccountId: input.savingsAccountId,
        amount: input.feeAmount,
        receiptNumber: input.receiptNumber,
        note: `Payout fee ${input.receiptNumber}`,
      });
    }
    if (Number(input.gstAmount) > 0) {
      await this.chargeGst({
        savingsAccountId: input.savingsAccountId,
        amount: input.gstAmount,
        receiptNumber: input.receiptNumber,
        note: `GST on fee ${input.receiptNumber}`,
      });
    }
  }

  async getStatement(savingsAccountId: number): Promise<StatementLine[]> {
    const acc = this.requireAccount(savingsAccountId);
    return acc.statement;
  }

  private requireAccount(id: number): MockAccount {
    let acc = this.accounts.get(id);
    if (!acc) {
      acc = {
        id,
        merchantId: `m_${id}`,
        total: 0,
        blocked: 0,
        statement: [],
        holds: new Map(),
      };
      this.accounts.set(id, acc);
    }
    return acc;
  }
}
