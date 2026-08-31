import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import { Merchant } from '../merchants/entities/merchant.entity';
import { Payout, PayoutStatus } from '../payouts/entities/payout.entity';
import { PayoutsService } from '../payouts/payouts.service';
import { ReconciliationItem } from './entities/reconciliation.entity';

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(ReconciliationItem)
    private readonly items: Repository<ReconciliationItem>,
    @InjectRepository(Payout)
    private readonly payouts: Repository<Payout>,
    @InjectRepository(Merchant)
    private readonly merchants: Repository<Merchant>,
    private readonly payoutsService: PayoutsService,
  ) {}

  async list() {
    await this.syncFromPayouts();
    const rows = await this.items.find({ order: { createdAt: 'DESC' }, take: 200 });
    return rows.map((row) => this.toView(row));
  }

  async resolve(input: {
    payoutId: string;
    action?: string;
    notes?: string;
    actorEmail?: string;
  }) {
    const payout = await this.payouts.findOne({ where: { id: input.payoutId } });
    if (!payout) {
      throw new NexaraError(
        ErrorCodes.PAYOUT_NOT_FOUND,
        'Payout was not found',
        404,
      );
    }

    if (input.action === 'ENQUIRE' || !input.action) {
      await this.payoutsService.enquire(input.payoutId);
    }

    let item = await this.items.findOne({ where: { payoutId: input.payoutId } });
    if (!item) {
      item = await this.upsertFromPayout(payout);
    }

    const refreshed = await this.payouts.findOne({ where: { id: input.payoutId } });
    if (refreshed) {
      item.nexaraStatus = refreshed.status;
      if (refreshed.status === PayoutStatus.SUCCESS) {
        item.status = 'MATCHED';
        item.bankStatus = 'SUCCESS';
        item.discrepancyDetails = null;
      }
    }

    if (input.action === 'FORCE_MATCH') {
      item.status = 'MATCHED';
      item.bankStatus = item.nexaraStatus;
      item.discrepancyDetails = input.notes ?? 'Manually matched by ops';
    }

    item.resolvedAt = new Date();
    item.resolvedBy = input.actorEmail ?? 'ops';
    item.resolutionNotes = input.notes ?? null;
    await this.items.save(item);
    return this.toView(item);
  }

  private async syncFromPayouts(): Promise<void> {
    const flagged = await this.payouts.find({
      where: [{ status: PayoutStatus.UNKNOWN }, { status: PayoutStatus.FAILED }],
      order: { createdAt: 'DESC' },
      take: 100,
    });
    for (const payout of flagged) {
      await this.upsertFromPayout(payout);
    }
  }

  private async upsertFromPayout(payout: Payout): Promise<ReconciliationItem> {
    const existing = await this.items.findOne({ where: { payoutId: payout.id } });
    const merchant = await this.merchants.findOne({ where: { id: payout.merchantId } });
    const status =
      payout.status === PayoutStatus.UNKNOWN ? 'MISMATCH' : 'FAILED';
    const bankStatus =
      payout.status === PayoutStatus.UNKNOWN ? 'PENDING_BANK' : 'REJECTED';

    if (existing) {
      existing.nexaraStatus = payout.status;
      existing.bankStatus = bankStatus;
      existing.status = status;
      existing.amount = payout.amount;
      existing.bankRef = payout.bankReference;
      existing.discrepancyDetails =
        payout.failureReason ??
        (payout.status === PayoutStatus.UNKNOWN
          ? 'Status desync with bank'
          : 'Settlement failure');
      return this.items.save(existing);
    }

    return this.items.save(
      this.items.create({
        payoutId: payout.id,
        merchantId: payout.merchantId,
        merchantName: merchant?.businessName ?? 'Merchant',
        merchantReference: payout.merchantReference,
        amount: payout.amount,
        nexaraStatus: payout.status,
        bankStatus,
        status,
        bankRef: payout.bankReference,
        discrepancyDetails:
          payout.failureReason ??
          (payout.status === PayoutStatus.UNKNOWN
            ? 'Status desync with bank'
            : 'Settlement failure'),
        resolvedAt: null,
        resolvedBy: null,
        resolutionNotes: null,
      }),
    );
  }

  private toView(row: ReconciliationItem) {
    return {
      id: row.id,
      payoutId: row.payoutId,
      merchantId: row.merchantId,
      merchantName: row.merchantName,
      merchantRef: row.merchantReference,
      amount: row.amount,
      nexaraStatus: row.nexaraStatus,
      bankStatus: row.bankStatus,
      status: row.status,
      bankRef: row.bankRef,
      discrepancyDetails: row.discrepancyDetails,
      discrepancyType: row.discrepancyDetails,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
      resolvedBy: row.resolvedBy,
      resolutionNotes: row.resolutionNotes,
    };
  }
}
