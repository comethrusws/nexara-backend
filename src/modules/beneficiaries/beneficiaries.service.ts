import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { IsNull, Repository } from 'typeorm';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import type { Beneficiary } from '../../integrations/banks/bank.types';
import type { PaymentMode } from '../../integrations/banks/bank.types';
import { OtpChallenge } from '../auth/entities/otp-challenge.entity';
import { SavedBeneficiary } from './entities/beneficiary.entity';

@Injectable()
export class BeneficiariesService {
  constructor(
    @InjectRepository(SavedBeneficiary)
    private readonly rows: Repository<SavedBeneficiary>,
    @InjectRepository(OtpChallenge)
    private readonly otps: Repository<OtpChallenge>,
    private readonly config: ConfigService,
  ) {}

  async create(
    merchantId: string,
    input: {
      name: string;
      mobile?: string;
      accountNumber?: string;
      ifsc?: string;
      bankName?: string;
      vpa?: string;
      paymentMode?: string;
      scope?: 'PERSONAL' | 'ORG';
      isVerified?: boolean;
    },
  ) {
    const saved = await this.rows.save(
      this.rows.create({
        merchantId,
        name: input.name.trim(),
        mobile: input.mobile?.replace(/\D/g, '').slice(-10) ?? null,
        accountNumber: input.accountNumber ?? null,
        accountLast4: input.accountNumber
          ? input.accountNumber.slice(-4)
          : null,
        ifsc: input.ifsc?.toUpperCase() ?? null,
        bankName: input.bankName ?? null,
        vpa: input.vpa ?? null,
        paymentMode: input.paymentMode ?? 'IMPS',
        scope: input.scope ?? 'PERSONAL',
        isVerified: input.isVerified ?? false,
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

  async requestOtp(mobile: string) {
    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
    const demoCode = this.config.get<string>('auth.otpCode') ?? '123456';
    await this.otps.save(
      this.otps.create({
        mobile: cleanMobile,
        purpose: 'BENEFICIARY',
        codeHash: await bcrypt.hash(demoCode, 8),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        consumedAt: null,
      }),
    );
    return {
      sent: true,
      mobile: cleanMobile,
      demoCode:
        this.config.get<string>('nodeEnv') === 'production' ? undefined : demoCode,
    };
  }

  async verifyOtp(input: {
    mobile: string;
    code?: string;
    action?: string;
    beneficiaryId?: string;
  }) {
    if (input.action === 'send' || !input.code) {
      return this.requestOtp(input.mobile);
    }
    const cleanMobile = input.mobile.replace(/\D/g, '').slice(-10);
    const row = await this.otps.findOne({
      where: {
        mobile: cleanMobile,
        purpose: 'BENEFICIARY',
        consumedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });
    if (!row || row.expiresAt.getTime() < Date.now()) {
      throw new NexaraError(
        ErrorCodes.UNAUTHORIZED,
        'OTP expired or invalid',
        401,
      );
    }
    const ok = await bcrypt.compare(input.code, row.codeHash);
    if (!ok) {
      throw new NexaraError(
        ErrorCodes.UNAUTHORIZED,
        'OTP expired or invalid',
        401,
      );
    }
    row.consumedAt = new Date();
    await this.otps.save(row);

    if (input.beneficiaryId) {
      const beneficiary = await this.rows.findOne({
        where: { id: input.beneficiaryId },
      });
      if (beneficiary) {
        beneficiary.isVerified = true;
        beneficiary.mobile = cleanMobile;
        await this.rows.save(beneficiary);
      }
    }

    return { verified: true, mobile: cleanMobile };
  }

  async lookupIfsc(ifsc: string) {
    const code = ifsc.toUpperCase().trim();
    const url =
      this.config.get<string>('ifsc.lookupUrl') ??
      'https://ifsc.razorpay.com';
    const res = await fetch(`${url}/${code}`);
    if (!res.ok) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'Invalid IFSC code',
        400,
      );
    }
    const data = (await res.json()) as Record<string, string>;
    return {
      ifsc: data.IFSC ?? code,
      bankName: data.BANK,
      branch: data.BRANCH,
      city: data.CITY,
    };
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
      mobile: row.mobile ?? '',
      name: row.name,
      accountNumber: row.accountNumber ?? '',
      accountLast4: row.accountLast4,
      ifsc: row.ifsc,
      bankName: row.bankName,
      vpa: row.vpa,
      paymentMode: row.paymentMode,
      scope: row.scope,
      isVerified: row.isVerified,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
