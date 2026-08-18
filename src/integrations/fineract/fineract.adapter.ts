import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatFineractDate, parseAmount } from '../../common/money/money';
import { FineractClient } from './fineract.client';
import {
  asRecord,
  mapStatementLine,
  mapWalletBalances,
  readNumericId,
  savingsExternalId,
} from './fineract.mapper';
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

@Injectable()
export class FineractAdapter implements FineractPort {
  constructor(
    private readonly client: FineractClient,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async ping(): Promise<void> {
    await this.client.get('/offices');
  }

  async openMerchantWallet(
    input: OpenMerchantWalletInput,
  ): Promise<OpenedWallet> {
    const date = formatFineractDate();
    const officeId = this.numberConfig('fineract.officeId');
    const productId = this.numberConfig('fineract.savingsProductId');
    const clientTypeId = this.numberConfig('fineract.clientTypeId');
    const legalFormId = this.numberConfig('fineract.legalFormId');
    const walletExternalId = savingsExternalId(input.merchantId);

    const clientId = await this.findOrCreateClient({
      merchantId: input.merchantId,
      businessName: input.businessName,
      mobileNo: input.mobileNo,
      officeId,
      clientTypeId,
      legalFormId,
      date,
    });

    const savingsAccountId = await this.findOrCreateSavingsAccount({
      clientId,
      productId,
      walletExternalId,
      date,
    });

    return {
      fineractClientId: clientId,
      fineractSavingsAccountId: savingsAccountId,
      fineractExternalId: walletExternalId,
    };
  }

  async getBalances(savingsAccountId: number): Promise<WalletBalances> {
    const account = asRecord(
      await this.client.get(`/savingsaccounts/${savingsAccountId}`),
      'savings account',
    );
    return mapWalletBalances(account);
  }

  async creditWallet(input: CreditWalletInput): Promise<LedgerPosting> {
    return this.postTransaction(
      input.savingsAccountId,
      'deposit',
      parseAmount(input.amount),
      this.numberConfig('fineract.paymentTypes.walletFunding'),
      input.receiptNumber,
      input.note ?? 'Wallet funding',
    );
  }

  async blockFunds(input: BlockFundsInput): Promise<LedgerPosting> {
    const response = asRecord(
      await this.client.post(
        `/savingsaccounts/${input.savingsAccountId}/transactions?command=holdAmount`,
        {
          locale: 'en',
          dateFormat: 'dd MMMM yyyy',
          transactionDate: formatFineractDate(),
          transactionAmount: parseAmount(input.amount),
          reasonForBlock: input.reason,
        },
      ),
      'hold amount',
    );
    return {
      fineractTransactionId: readNumericId(
        response,
        ['resourceId', 'transactionId'],
        'hold amount',
      ),
    };
  }

  async releaseFunds(input: ReleaseFundsInput): Promise<LedgerPosting> {
    const response = asRecord(
      await this.client.post(
        `/savingsaccounts/${input.savingsAccountId}/transactions/${input.holdTransactionId}?command=releaseAmount`,
        {},
      ),
      'release amount',
    );
    return {
      fineractTransactionId: readNumericId(
        response,
        ['resourceId', 'transactionId'],
        'release amount',
      ),
    };
  }

  async debitPayout(input: DebitWalletInput): Promise<LedgerPosting> {
    return this.withdraw(
      input,
      this.numberConfig('fineract.paymentTypes.payout'),
      input.note ?? 'Payout',
    );
  }

  async chargeFee(input: DebitWalletInput): Promise<LedgerPosting> {
    return this.withdraw(
      input,
      this.numberConfig('fineract.paymentTypes.payoutFee'),
      input.note ?? 'Payout fee',
    );
  }

  async chargeGst(input: DebitWalletInput): Promise<LedgerPosting> {
    return this.withdraw(
      input,
      this.numberConfig('fineract.paymentTypes.gst'),
      input.note ?? 'GST on fee',
    );
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
    const account = asRecord(
      await this.client.get(
        `/savingsaccounts/${savingsAccountId}?associations=transactions`,
      ),
      'savings transactions',
    );
    const transactions = Array.isArray(account.transactions)
      ? account.transactions
      : [];
    return transactions
      .filter((item): item is Record<string, unknown> => {
        return typeof item === 'object' && item !== null;
      })
      .map((item) => mapStatementLine(item));
  }

  private async withdraw(
    input: DebitWalletInput,
    paymentTypeId: number,
    note: string,
  ): Promise<LedgerPosting> {
    return this.postTransaction(
      input.savingsAccountId,
      'withdrawal',
      parseAmount(input.amount),
      paymentTypeId,
      input.receiptNumber,
      note,
    );
  }

  private async postTransaction(
    savingsAccountId: number,
    command: 'deposit' | 'withdrawal',
    amount: number,
    paymentTypeId: number,
    receiptNumber: string,
    note: string,
  ): Promise<LedgerPosting> {
    const response = asRecord(
      await this.client.post(
        `/savingsaccounts/${savingsAccountId}/transactions?command=${command}`,
        {
          locale: 'en',
          dateFormat: 'dd MMMM yyyy',
          transactionDate: formatFineractDate(),
          transactionAmount: amount,
          paymentTypeId,
          receiptNumber,
          note,
        },
      ),
      command,
    );
    return {
      fineractTransactionId: readNumericId(
        response,
        ['resourceId', 'transactionId'],
        command,
      ),
    };
  }

  private async findOrCreateClient(input: {
    merchantId: string;
    businessName: string;
    mobileNo?: string;
    officeId: number;
    clientTypeId: number;
    legalFormId: number;
    date: string;
  }): Promise<number> {
    const existing = await this.findClientIdByExternalId(input.merchantId);
    if (existing) {
      return existing;
    }

    const payload: Record<string, unknown> = {
      officeId: input.officeId,
      legalFormId: input.legalFormId,
      fullname: input.businessName,
      externalId: input.merchantId,
      active: true,
      activationDate: input.date,
      submittedOnDate: input.date,
      dateFormat: 'dd MMMM yyyy',
      locale: 'en',
      clientTypeId: input.clientTypeId,
    };
    if (input.mobileNo) {
      payload.mobileNo = input.mobileNo;
    }

    const created = asRecord(
      await this.client.post('/clients', payload),
      'create client',
    );
    return readNumericId(created, ['clientId', 'resourceId'], 'create client');
  }

  private async findClientIdByExternalId(
    merchantId: string,
  ): Promise<number | null> {
    const result = asRecord(
      await this.client.get(`/clients?externalId=${encodeURIComponent(merchantId)}`),
      'find client',
    );
    const items = Array.isArray(result.pageItems) ? result.pageItems : [];
    const first = items[0];
    if (typeof first === 'object' && first !== null) {
      const record = first as Record<string, unknown>;
      const id = Number(record.id);
      if (Number.isInteger(id) && id > 0) {
        return id;
      }
    }
    return null;
  }

  private async findOrCreateSavingsAccount(input: {
    clientId: number;
    productId: number;
    walletExternalId: string;
    date: string;
  }): Promise<number> {
    const existingId = await this.findSavingsAccountId(input.clientId);
    if (existingId) {
      await this.ensureSavingsActive(existingId, input.date);
      return existingId;
    }

    const created = asRecord(
      await this.client.post('/savingsaccounts', {
        clientId: input.clientId,
        productId: input.productId,
        locale: 'en',
        dateFormat: 'dd MMMM yyyy',
        submittedOnDate: input.date,
        externalId: input.walletExternalId,
      }),
      'create savings account',
    );
    const savingsId = readNumericId(
      created,
      ['savingsId', 'resourceId'],
      'create savings account',
    );
    await this.ensureSavingsActive(savingsId, input.date);
    return savingsId;
  }

  private async findSavingsAccountId(clientId: number): Promise<number | null> {
    const accounts = asRecord(
      await this.client.get(`/clients/${clientId}/accounts`),
      'client accounts',
    );
    const savings = Array.isArray(accounts.savingsAccounts)
      ? accounts.savingsAccounts
      : [];
    const productId = this.numberConfig('fineract.savingsProductId');
    const match = savings.find((item) => {
      if (typeof item !== 'object' || item === null) {
        return false;
      }
      const record = item as Record<string, unknown>;
      return Number(record.productId ?? record.savingsProductId) === productId;
    }) as Record<string, unknown> | undefined;

    if (!match) {
      return null;
    }
    const id = Number(match.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  private async ensureSavingsActive(
    savingsAccountId: number,
    date: string,
  ): Promise<void> {
    const account = asRecord(
      await this.client.get(`/savingsaccounts/${savingsAccountId}`),
      'savings status',
    );
    const status =
      typeof account.status === 'object' && account.status !== null
        ? (account.status as Record<string, unknown>)
        : {};

    if (status.active === true) {
      return;
    }

    if (status.submittedAndPendingApproval === true) {
      await this.client.post(
        `/savingsaccounts/${savingsAccountId}?command=approve`,
        {
          locale: 'en',
          dateFormat: 'dd MMMM yyyy',
          approvedOnDate: date,
        },
      );
      await this.client.post(
        `/savingsaccounts/${savingsAccountId}?command=activate`,
        {
          locale: 'en',
          dateFormat: 'dd MMMM yyyy',
          activatedOnDate: date,
        },
      );
      return;
    }

    if (status.approved === true) {
      await this.client.post(
        `/savingsaccounts/${savingsAccountId}?command=activate`,
        {
          locale: 'en',
          dateFormat: 'dd MMMM yyyy',
          activatedOnDate: date,
        },
      );
    }
  }

  private numberConfig(path: string): number {
    const value = this.config.get<number>(path);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Missing numeric config ${path}`);
    }
    return value;
  }
}
