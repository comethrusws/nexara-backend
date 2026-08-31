import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import { addAmounts, parseNonNegativeAmount } from '../../common/money/money';
import { BankRegistry } from '../../integrations/banks/bank.registry';
import {
  BankPayoutResult,
  Beneficiary,
  type BankPort,
} from '../../integrations/banks/bank.types';
import {
  FINERACT_PORT,
  type FineractPort,
} from '../../integrations/fineract/fineract.types';
import { MerchantsService } from '../merchants/merchants.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { WalletService } from '../wallet/wallet.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { calculatePayoutCharges } from './fee.calculator';
import { Payout, PayoutStatus } from './entities/payout.entity';
import { PayoutStatusEvent } from './entities/payout-status-event.entity';

@Injectable()
export class PayoutsService {
  constructor(
    @InjectRepository(Payout)
    private readonly payouts: Repository<Payout>,
    @InjectRepository(PayoutStatusEvent)
    private readonly statusEvents: Repository<PayoutStatusEvent>,
    private readonly merchants: MerchantsService,
    private readonly organizations: OrganizationsService,
    private readonly wallets: WalletService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService,
    @Inject(FINERACT_PORT) private readonly fineract: FineractPort,
    private readonly banks: BankRegistry,
  ) {}

  async create(input: {
    merchantId: string;
    merchantReference: string;
    amount: string;
    beneficiary: Beneficiary;
  }) {
    const merchant = await this.merchants.requireActive(input.merchantId);
    const existing = await this.payouts.findOne({
      where: {
        merchantId: merchant.id,
        merchantReference: input.merchantReference,
      },
    });
    if (existing) {
      return this.toView(existing);
    }
    if (!merchant.organizationId) {
      throw new NexaraError(
        ErrorCodes.ORGANIZATION_NOT_FOUND,
        'Merchant is not attached to an organization',
        500,
      );
    }
    await this.organizations.assertPayoutRail(
      merchant.organizationId,
      input.beneficiary.paymentMode,
    );
    const bankCode = await this.organizations.resolveBankCode(
      merchant.organizationId,
    );
    const bank = this.banks.get(bankCode);

    parseNonNegativeAmount(input.amount);
    if (parseNonNegativeAmount(input.amount) <= 0) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'Amount must be greater than zero',
      );
    }
    await bank.validateBeneficiary(input.beneficiary);

    const charges = calculatePayoutCharges({
      payoutAmount: input.amount,
      feeType: merchant.feeType,
      feeValue: merchant.feeValue,
      gstPercent: merchant.gstPercent,
      feeTiersJson: merchant.feeTiersJson,
    });

    await this.assertDailyLimit(merchant.id, merchant.dailyPayoutLimit, charges.payoutAmount);
    if (
      merchant.perPayoutLimit &&
      parseNonNegativeAmount(charges.payoutAmount) >
        parseNonNegativeAmount(merchant.perPayoutLimit)
    ) {
      throw new NexaraError(
        ErrorCodes.PER_TX_LIMIT_EXCEEDED,
        'Amount exceeds the per-payout limit',
        422,
      );
    }

    const mapping = await this.wallets.getRequiredMapping(merchant.id);
    const balances = await this.fineract.getBalances(
      mapping.fineractSavingsAccountId,
    );
    if (
      parseNonNegativeAmount(balances.available) <
      parseNonNegativeAmount(charges.reserved)
    ) {
      throw new NexaraError(
        ErrorCodes.INSUFFICIENT_BALANCE,
        'Available balance is insufficient',
        422,
      );
    }

    const hold = await this.fineract.blockFunds({
      savingsAccountId: mapping.fineractSavingsAccountId,
      amount: charges.reserved,
      reason: `Payout ${input.merchantReference}`,
    });

    const payout = await this.payouts.save(
      this.payouts.create({
        merchantId: merchant.id,
        merchantReference: input.merchantReference,
        amount: charges.payoutAmount,
        fee: charges.fee,
        gst: charges.gst,
        reserved: charges.reserved,
        status: PayoutStatus.FUNDS_BLOCKED,
        paymentMode: input.beneficiary.paymentMode,
        beneficiaryName: input.beneficiary.name,
        beneficiaryAccountLast4: input.beneficiary.accountNumber
          ? input.beneficiary.accountNumber.slice(-4)
          : null,
        beneficiaryIfsc: input.beneficiary.ifsc?.toUpperCase() ?? null,
        beneficiaryVpa: input.beneficiary.vpa ?? null,
        holdTransactionId: hold.fineractTransactionId,
        bankCode,
      }),
    );
    await this.recordStatus(payout.id, PayoutStatus.FUNDS_BLOCKED);

    try {
      const bankResult = await bank.initiatePayout({
        nexaraPayoutId: payout.id,
        merchantReference: payout.merchantReference,
        amount: payout.amount,
        beneficiary: input.beneficiary,
      });
      payout.bankReference = bankResult.bankReference;
      payout.status = PayoutStatus.SUBMITTED_TO_BANK;
      await this.payouts.save(payout);
      await this.recordStatus(payout.id, PayoutStatus.SUBMITTED_TO_BANK);
      await this.applyBankResult(payout, mapping.fineractSavingsAccountId, bankResult);
    } catch (error) {
      payout.status = PayoutStatus.UNKNOWN;
      payout.failureReason =
        error instanceof Error ? error.message : 'Bank initiate failed';
      await this.payouts.save(payout);
      await this.recordStatus(payout.id, PayoutStatus.UNKNOWN, payout.failureReason);
    }

    return this.toView(payout);
  }

  async get(id: string) {
    return this.toView(await this.requirePayout(id));
  }

  async list(filters?: { merchantId?: string; status?: string }) {
    const where: Record<string, string> = {};
    if (filters?.merchantId) {
      where.merchantId = filters.merchantId;
    }
    if (filters?.status) {
      where.status = filters.status;
    }
    const rows = await this.payouts.find({
      where,
      order: { createdAt: 'DESC' },
    });
    return Promise.all(rows.map((row) => this.toView(row)));
  }

  async enquire(id: string) {
    const payout = await this.requirePayout(id);
    return this.runEnquire(payout);
  }

  async enquireForMerchant(id: string, merchantId: string) {
    const payout = await this.requirePayout(id);
    if (payout.merchantId !== merchantId) {
      throw new NexaraError(
        ErrorCodes.PAYOUT_NOT_FOUND,
        'Payout was not found',
        404,
      );
    }
    return this.runEnquire(payout);
  }

  private async runEnquire(payout: Payout) {
    if (!payout.bankReference) {
      throw new NexaraError(
        ErrorCodes.TRANSACTION_PENDING,
        'Payout has no bank reference yet',
        409,
      );
    }
    if (
      payout.status === PayoutStatus.SUCCESS ||
      payout.status === PayoutStatus.FAILED
    ) {
      return this.toView(payout);
    }
    const mapping = await this.wallets.getRequiredMapping(payout.merchantId);
    const bank = await this.adapterFor(payout);
    const bankResult = await bank.getPayoutStatus(payout.bankReference);
    await this.applyBankResult(
      payout,
      mapping.fineractSavingsAccountId,
      bankResult,
    );
    return this.toView(payout);
  }

  private async applyBankResult(
    payout: Payout,
    savingsAccountId: number,
    bankResult: BankPayoutResult,
  ): Promise<void> {
    payout.bankReference = bankResult.bankReference;
    if (bankResult.status === 'SUCCESS') {
      if (payout.status !== PayoutStatus.SUCCESS && payout.holdTransactionId) {
        await this.fineract.finalizeSuccessfulPayout({
          savingsAccountId,
          holdTransactionId: payout.holdTransactionId,
          payoutAmount: payout.amount,
          feeAmount: payout.fee,
          gstAmount: payout.gst,
          receiptNumber: payout.id,
          payoutNote: `Payout ${payout.merchantReference}`,
        });
      }
      payout.status = PayoutStatus.SUCCESS;
      payout.failureReason = null;
      await this.recordStatus(payout.id, PayoutStatus.SUCCESS);
      await this.notifications.notifyUser({
        merchantId: payout.merchantId,
        audience: 'MERCHANT',
        title: 'Payout successful',
        body: `Payout ${payout.merchantReference} of ₹${payout.amount} is complete.`,
        type: 'PAYOUT_SUCCESS',
      });
      void this.webhooks.emit(payout.merchantId, 'payout.success', {
        id: payout.id,
        merchantReference: payout.merchantReference,
        amount: payout.amount,
        status: payout.status,
      });
    } else if (bankResult.status === 'FAILED') {
      if (
        payout.status !== PayoutStatus.FAILED &&
        payout.holdTransactionId
      ) {
        await this.fineract.releaseFunds({
          savingsAccountId,
          holdTransactionId: payout.holdTransactionId,
        });
      }
      payout.status = PayoutStatus.FAILED;
      payout.failureReason = bankResult.failureReason ?? 'Bank rejected payout';
      await this.recordStatus(
        payout.id,
        PayoutStatus.FAILED,
        payout.failureReason,
      );
      await this.notifications.notifyUser({
        merchantId: payout.merchantId,
        audience: 'MERCHANT',
        title: 'Payout failed',
        body: payout.failureReason,
        type: 'PAYOUT_FAILED',
      });
      void this.webhooks.emit(payout.merchantId, 'payout.failed', {
        id: payout.id,
        merchantReference: payout.merchantReference,
        amount: payout.amount,
        status: payout.status,
        failureReason: payout.failureReason,
      });
    } else {
      payout.status = PayoutStatus.UNKNOWN;
      await this.recordStatus(payout.id, PayoutStatus.UNKNOWN);
    }
    await this.payouts.save(payout);
  }

  private async assertDailyLimit(
    merchantId: string,
    dailyLimit: string,
    payoutAmount: string,
  ): Promise<void> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const used = await this.payouts.find({
      where: {
        merchantId,
        status: Not(In([PayoutStatus.FAILED])),
      },
    });
    const todayUsed = used
      .filter((item) => item.createdAt >= start)
      .reduce((sum, item) => addAmounts(sum, item.amount), '0.00');
    const nextTotal = addAmounts(todayUsed, payoutAmount);
    if (
      parseNonNegativeAmount(nextTotal) > parseNonNegativeAmount(dailyLimit)
    ) {
      throw new NexaraError(
        ErrorCodes.DAILY_LIMIT_EXCEEDED,
        'Merchant daily payout limit would be exceeded',
        422,
      );
    }
  }

  private async adapterFor(payout: Payout): Promise<BankPort> {
    if (payout.bankCode) {
      return this.banks.get(payout.bankCode);
    }
    const merchant = await this.merchants.requireById(payout.merchantId);
    if (!merchant.organizationId) {
      throw new NexaraError(
        ErrorCodes.ORGANIZATION_NOT_FOUND,
        'Merchant is not attached to an organization',
        500,
      );
    }
    const bankCode = await this.organizations.resolveBankCode(
      merchant.organizationId,
    );
    return this.banks.get(bankCode);
  }

  private async recordStatus(
    payoutId: string,
    status: string,
    reason?: string | null,
  ): Promise<void> {
    await this.statusEvents.save(
      this.statusEvents.create({
        payoutId,
        status,
        reason: reason ?? null,
      }),
    );
  }

  private async requirePayout(id: string): Promise<Payout> {
    const payout = await this.payouts.findOne({ where: { id } });
    if (!payout) {
      throw new NexaraError(
        ErrorCodes.PAYOUT_NOT_FOUND,
        'Payout was not found',
        404,
      );
    }
    return payout;
  }

  private async toView(payout: Payout) {
    const statusHistory = await this.statusEvents.find({
      where: { payoutId: payout.id },
      order: { createdAt: 'ASC' },
    });
    return {
      id: payout.id,
      merchantId: payout.merchantId,
      merchantReference: payout.merchantReference,
      merchantRef: payout.merchantReference,
      amount: payout.amount,
      fee: payout.fee,
      gst: payout.gst,
      tax: payout.gst,
      reserved: payout.reserved,
      totalReserved: payout.reserved,
      status: payout.status,
      paymentMode: payout.paymentMode,
      beneficiary: {
        name: payout.beneficiaryName,
        accountLast4: payout.beneficiaryAccountLast4,
        ifsc: payout.beneficiaryIfsc,
        vpa: payout.beneficiaryVpa,
      },
      bankCode: payout.bankCode,
      bankReference: payout.bankReference,
      bankRef: payout.bankReference,
      failureReason: payout.failureReason,
      createdAt: payout.createdAt,
      updatedAt: payout.updatedAt,
      statusHistory: statusHistory.map((item) => ({
        status: item.status,
        timestamp: item.createdAt,
        reason: item.reason,
      })),
    };
  }
}
