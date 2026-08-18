import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import {
  FINERACT_PORT,
  type FineractPort,
  StatementLine,
  WalletBalances,
} from '../../integrations/fineract/fineract.types';
import {
  FundingChannel,
  FundingStatus,
  WalletFunding,
} from './entities/wallet-funding.entity';
import { WalletMapping } from './entities/wallet-mapping.entity';

export interface WalletView {
  merchantId: string;
  fineractClientId: number;
  fineractSavingsAccountId: number;
  balances: WalletBalances;
  lastFundedAt?: string | null;
}

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(WalletMapping)
    private readonly mappings: Repository<WalletMapping>,
    @InjectRepository(WalletFunding)
    private readonly fundings: Repository<WalletFunding>,
    @Inject(FINERACT_PORT)
    private readonly fineract: FineractPort,
  ) {}

  async openWallet(input: {
    merchantId: string;
    businessName: string;
    mobileNo?: string;
  }): Promise<WalletView> {
    const existing = await this.mappings.findOne({
      where: { merchantId: input.merchantId },
    });
    if (existing) {
      const balances = await this.fineract.getBalances(
        existing.fineractSavingsAccountId,
      );
      return this.toView(existing, balances);
    }

    const opened = await this.fineract.openMerchantWallet(input);
    const mapping = this.mappings.create({
      merchantId: input.merchantId,
      fineractClientId: opened.fineractClientId,
      fineractSavingsAccountId: opened.fineractSavingsAccountId,
      fineractExternalId: opened.fineractExternalId,
    });
    const saved = await this.mappings.save(mapping);
    const balances = await this.fineract.getBalances(
      saved.fineractSavingsAccountId,
    );
    return this.toView(saved, balances);
  }

  async listWallets(): Promise<WalletView[]> {
    const mappings = await this.mappings.find({ order: { createdAt: 'DESC' } });
    const views: WalletView[] = [];
    for (const mapping of mappings) {
      try {
        const balances = await this.fineract.getBalances(
          mapping.fineractSavingsAccountId,
        );
        views.push(await this.toView(mapping, balances));
      } catch {
        views.push(
          await this.toView(mapping, {
            total: '0.00',
            blocked: '0.00',
            available: '0.00',
          }),
        );
      }
    }
    return views;
  }

  async getWallet(merchantId: string): Promise<WalletView> {
    const mapping = await this.getRequiredMapping(merchantId);
    const balances = await this.fineract.getBalances(
      mapping.fineractSavingsAccountId,
    );
    return this.toView(mapping, balances);
  }

  async creditWallet(
    merchantId: string,
    input: { amount: string; externalPaymentReference: string; notes?: string },
  ): Promise<WalletView> {
    return this.fund({
      merchantId,
      amount: input.amount,
      channel: FundingChannel.CASH,
      externalRef: input.externalPaymentReference,
      notes: input.notes,
    });
  }

  async fund(input: {
    merchantId: string;
    amount: string;
    channel: FundingChannel;
    externalRef: string;
    notes?: string;
    paymentDate?: string;
  }) {
    if (input.channel !== FundingChannel.CASH) {
      const pending = await this.fundings.save(
        this.fundings.create({
          merchantId: input.merchantId,
          channel: input.channel,
          amount: input.amount,
          status: FundingStatus.PENDING,
          externalRef: input.externalRef,
          notes:
            input.notes ??
            'Will post when money is confirmed in the collection account',
          paymentDate: input.paymentDate ?? null,
        }),
      );
      throw new NexaraError(
        ErrorCodes.FUNDING_CHANNEL_UNAVAILABLE,
        `${input.channel} add-money is registered as ${pending.id} and will credit the wallet when the collection-account API is live`,
        409,
      );
    }

    const mapping = await this.getRequiredMapping(input.merchantId);
    await this.fineract.creditWallet({
      savingsAccountId: mapping.fineractSavingsAccountId,
      amount: input.amount,
      receiptNumber: input.externalRef,
      note: input.notes ?? `Cash funding ${input.externalRef}`,
    });
    await this.fundings.save(
      this.fundings.create({
        merchantId: input.merchantId,
        channel: FundingChannel.CASH,
        amount: input.amount,
        status: FundingStatus.POSTED,
        externalRef: input.externalRef,
        notes: input.notes ?? null,
        paymentDate: input.paymentDate ?? null,
      }),
    );
    const balances = await this.fineract.getBalances(
      mapping.fineractSavingsAccountId,
    );
    return this.toView(mapping, balances);
  }

  async getActivity(merchantId: string) {
    const lines = await this.getStatement(merchantId);
    return lines.map((line) => this.toActivity(line));
  }

  async getStatement(merchantId: string): Promise<StatementLine[]> {
    const mapping = await this.getRequiredMapping(merchantId);
    return this.fineract.getStatement(mapping.fineractSavingsAccountId);
  }

  async getRequiredMapping(merchantId: string): Promise<WalletMapping> {
    const mapping = await this.mappings.findOne({ where: { merchantId } });
    if (!mapping) {
      throw new NexaraError(
        ErrorCodes.WALLET_NOT_FOUND,
        'Merchant wallet was not found',
        404,
      );
    }
    return mapping;
  }

  private async toView(
    mapping: WalletMapping,
    balances: WalletBalances,
  ): Promise<WalletView> {
    const last = await this.fundings.findOne({
      where: { merchantId: mapping.merchantId, status: FundingStatus.POSTED },
      order: { createdAt: 'DESC' },
    });
    return {
      merchantId: mapping.merchantId,
      fineractClientId: mapping.fineractClientId,
      fineractSavingsAccountId: mapping.fineractSavingsAccountId,
      balances,
      lastFundedAt: last?.createdAt.toISOString() ?? null,
    };
  }

  private toActivity(line: StatementLine) {
    let type: 'CREDIT' | 'DEBIT' = 'DEBIT';
    let status: 'COMPLETED' | 'PENDING' | 'REVERSED' = 'COMPLETED';
    if (line.type === 'CREDIT' || line.type === 'RELEASE') {
      type = 'CREDIT';
    }
    if (line.type === 'HOLD') {
      status = 'PENDING';
    }
    if (line.reversed) {
      status = 'REVERSED';
    }
    return {
      id: String(line.transactionId),
      date: line.date,
      description: line.note ?? line.type,
      reference: line.receiptNumber ?? String(line.transactionId),
      type,
      amount: line.amount,
      runningBalance: line.runningBalance ?? null,
      status,
    };
  }
}
