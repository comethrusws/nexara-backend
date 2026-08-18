import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import type { Beneficiary } from '../../integrations/banks/bank.types';
import type { PaymentMode } from '../../integrations/banks/bank.types';
import { SavedBeneficiary } from './entities/beneficiary.entity';

@Injectable()
export class BeneficiariesService {
  constructor(
    @InjectRepository(SavedBeneficiary)
    private readonly rows: Repository<SavedBeneficiary>,
  ) {}

  async create(
    merchantId: string,
    input: {
      name: string;
      accountNumber?: string;
      ifsc?: string;
      bankName?: string;
      vpa?: string;
      paymentMode?: string;
    },
  ) {
    const saved = await this.rows.save(
      this.rows.create({
        merchantId,
        name: input.name.trim(),
        accountNumber: input.accountNumber ?? null,
        accountLast4: input.accountNumber
          ? input.accountNumber.slice(-4)
          : null,
        ifsc: input.ifsc?.toUpperCase() ?? null,
        bankName: input.bankName ?? null,
        vpa: input.vpa ?? null,
        paymentMode: input.paymentMode ?? 'IMPS',
      }),
    );
    return this.toView(saved);
  }

  async list(merchantId: string) {
    const items = await this.rows.find({
      where: { merchantId },
      order: { createdAt: 'DESC' },
    });
    return items.map((item) => this.toView(item));
  }

  async requireForPayout(
    merchantId: string,
    id: string,
  ): Promise<Beneficiary> {
    const row = await this.rows.findOne({ where: { id, merchantId } });
    if (!row) {
      throw new NexaraError(
        ErrorCodes.BENEFICIARY_NOT_FOUND,
        'Beneficiary was not found',
        404,
      );
    }
    return {
      name: row.name,
      accountNumber: row.accountNumber ?? undefined,
      ifsc: row.ifsc ?? undefined,
      bankName: row.bankName ?? undefined,
      vpa: row.vpa ?? undefined,
      paymentMode: (row.paymentMode as PaymentMode) ?? 'IMPS',
    };
  }

  private toView(row: SavedBeneficiary) {
    return {
      id: row.id,
      merchantId: row.merchantId,
      name: row.name,
      accountLast4: row.accountLast4,
      ifsc: row.ifsc,
      bankName: row.bankName,
      vpa: row.vpa,
      paymentMode: row.paymentMode,
    };
  }
}
