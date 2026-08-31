import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import { addAmounts, parseNonNegativeAmount } from '../../common/money/money';
import { MerchantsService } from '../merchants/merchants.service';
import { WalletService } from '../wallet/wallet.service';
import { MOCK_BILLERS } from './bbps.catalog';
import { BillPayment } from './entities/bill-payment.entity';

@Injectable()
export class BbpsService {
  constructor(
    @InjectRepository(BillPayment)
    private readonly payments: Repository<BillPayment>,
    private readonly merchants: MerchantsService,
    private readonly wallets: WalletService,
  ) {}

  listBillers() {
    return MOCK_BILLERS;
  }

  fetchBill(billerId: string, consumerNumber: string) {
    const biller = MOCK_BILLERS.find((b) => b.id === billerId);
    if (!biller) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'Unknown biller',
        404,
      );
    }
    const billAmount = 1450.0;
    const convFee = 5.0;
    return {
      billerId: biller.id,
      billerName: biller.name,
      consumerNumber,
      customerName: `Subscriber (${consumerNumber})`,
      billAmount,
      dueDate: new Date(Date.now() + 864000000).toISOString(),
      billNumber: `BILL-${Date.now()}`,
      convFee,
      totalPayable: billAmount + convFee,
    };
  }

  async listForMerchant(merchantId: string) {
    const rows = await this.payments.find({
      where: { merchantId },
      order: { paidAt: 'DESC' },
      take: 100,
    });
    return rows.map((row) => this.toView(row));
  }

  async pay(input: {
    merchantId: string;
    billerId: string;
    consumerNumber: string;
    amount?: string;
  }) {
    const merchant = await this.merchants.requireActive(input.merchantId);
    const bill = this.fetchBill(input.billerId, input.consumerNumber);
    const billAmount = input.amount ?? bill.billAmount.toFixed(2);
    const convFee = bill.convFee.toFixed(2);
    const totalPaid = addAmounts(billAmount, convFee);

    const mapping = await this.wallets.getRequiredMapping(merchant.id);
    const balances = await this.wallets.getWallet(merchant.id);
    if (
      parseNonNegativeAmount(balances.balances.available) <
      parseNonNegativeAmount(totalPaid)
    ) {
      throw new NexaraError(
        ErrorCodes.INSUFFICIENT_BALANCE,
        'Insufficient wallet balance for bill payment',
        422,
      );
    }

    // Mock BBPS success — debit handled via wallet credit reversal pattern omitted for MVP;
    // record payment for ledger visibility.
    const saved = await this.payments.save(
      this.payments.create({
        merchantId: merchant.id,
        merchantName: merchant.businessName,
        billerId: bill.billerId,
        billerName: bill.billerName,
        category: MOCK_BILLERS.find((b) => b.id === input.billerId)?.category ?? 'OTHER',
        consumerNumber: input.consumerNumber,
        customerName: bill.customerName,
        billNumber: bill.billNumber,
        billAmount,
        convFee,
        totalPaid,
        status: 'SUCCESS',
        bbpsRef: `BBPS-${Date.now()}`,
      }),
    );

    void mapping;
    return this.toView(saved);
  }

  private toView(row: BillPayment) {
    return {
      id: row.id,
      merchantId: row.merchantId,
      merchantName: row.merchantName,
      billerId: row.billerId,
      billerName: row.billerName,
      category: row.category,
      consumerNumber: row.consumerNumber,
      customerName: row.customerName,
      billNumber: row.billNumber,
      billAmount: parseFloat(row.billAmount),
      convFee: parseFloat(row.convFee),
      totalPaid: parseFloat(row.totalPaid),
      status: row.status,
      bbpsRef: row.bbpsRef,
      paidAt: row.paidAt,
    };
  }
}
