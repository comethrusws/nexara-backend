import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { IsNull, Repository } from 'typeorm';
import { MPIN_PATTERN, MPIN_VALIDATION_MESSAGE } from '../../common/dto/mpin';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import { UserRole } from './auth.constants';
import { OtpChallenge } from './entities/otp-challenge.entity';
import { User } from './entities/user.entity';

const MPIN_RESET_PURPOSE = 'MPIN_RESET';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(OtpChallenge)
    private readonly otps: Repository<OtpChallenge>,
    private readonly config: ConfigService,
  ) { }

  async onModuleInit(): Promise<void> {
    await this.ensureStaffUser(
      this.config.get<string>('auth.adminEmail') ?? 'admin@nexara.com',
      this.config.get<string>('auth.adminPassword') ?? 'NexaraAdmin#2026',
      'Platform Root Admin',
      UserRole.ADMIN,
    );
    await this.ensureStaffUser(
      this.config.get<string>('auth.opsEmail') ?? 'ops@nexara.com',
      this.config.get<string>('auth.adminPassword') ?? 'NexaraAdmin#2026',
      'Nexara Operations Specialist',
      UserRole.OPS,
    );
  }

  async requireActive(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user || user.status !== 'ACTIVE') {
      throw new NexaraError(ErrorCodes.UNAUTHORIZED, 'User is not active', 401);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async findByMobile(mobile: string): Promise<User | null> {
    return this.users.findOne({ where: { mobile } });
  }

  async findMerchantUser(merchantId: string): Promise<User | null> {
    return this.users.findOne({
      where: { merchantId, role: UserRole.MERCHANT, status: 'ACTIVE' },
    });
  }

  async verifyMpinForMerchant(merchantId: string, mpin: string): Promise<void> {
    const user = await this.findMerchantUser(merchantId);
    if (!user?.mpinHash) {
      throw new NexaraError(
        ErrorCodes.MPIN_NOT_SET,
        'Transaction PIN is not set. Set your 6-digit MPIN before making payouts.',
        403,
      );
    }
    const ok = await bcrypt.compare(mpin, user.mpinHash);
    if (!ok) {
      throw new NexaraError(
        ErrorCodes.MPIN_INVALID,
        'Invalid transaction PIN',
        401,
      );
    }
  }

  async setMpin(
    userId: string,
    mpin: string,
    currentMpin?: string,
  ): Promise<{ success: true }> {
    if (!MPIN_PATTERN.test(mpin)) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        MPIN_VALIDATION_MESSAGE,
        400,
      );
    }
    const user = await this.requireActive(userId);
    if (user.role !== UserRole.MERCHANT) {
      throw new NexaraError(
        ErrorCodes.FORBIDDEN,
        'Only merchant accounts can set a transaction PIN',
        403,
      );
    }
    if (user.mpinHash) {
      if (!currentMpin) {
        throw new NexaraError(
          ErrorCodes.INVALID_REQUEST,
          'currentMpin is required to change an existing PIN',
          400,
        );
      }
      const ok = await bcrypt.compare(currentMpin, user.mpinHash);
      if (!ok) {
        throw new NexaraError(
          ErrorCodes.MPIN_INVALID,
          'Current transaction PIN is incorrect',
          401,
        );
      }
    }
    user.mpinHash = await bcrypt.hash(mpin, 10);
    await this.users.save(user);
    return { success: true };
  }

  async requestMpinResetOtp(userId: string) {
    const user = await this.requireActive(userId);
    if (user.role !== UserRole.MERCHANT) {
      throw new NexaraError(
        ErrorCodes.FORBIDDEN,
        'Only merchant accounts can reset a transaction PIN',
        403,
      );
    }
    if (!user.mobile) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'No mobile number is linked to this account',
        400,
      );
    }
    const cleanMobile = user.mobile.replace(/\D/g, '').slice(-10);
    const demoCode = this.config.get<string>('auth.otpCode') ?? '123456';
    await this.otps.save(
      this.otps.create({
        mobile: cleanMobile,
        purpose: MPIN_RESET_PURPOSE,
        codeHash: await bcrypt.hash(demoCode, 8),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        consumedAt: null,
      }),
    );
    return {
      sent: true,
      mobile: cleanMobile,
      purpose: MPIN_RESET_PURPOSE,
      demoCode:
        this.config.get<string>('nodeEnv') === 'production' ? undefined : demoCode,
    };
  }

  async resetMpinWithOtp(userId: string, code: string, mpin: string) {
    if (!MPIN_PATTERN.test(mpin)) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        MPIN_VALIDATION_MESSAGE,
        400,
      );
    }
    const user = await this.requireActive(userId);
    if (user.role !== UserRole.MERCHANT) {
      throw new NexaraError(
        ErrorCodes.FORBIDDEN,
        'Only merchant accounts can reset a transaction PIN',
        403,
      );
    }
    if (!user.mobile) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'No mobile number is linked to this account',
        400,
      );
    }
    const cleanMobile = user.mobile.replace(/\D/g, '').slice(-10);
    const row = await this.otps.findOne({
      where: {
        mobile: cleanMobile,
        purpose: MPIN_RESET_PURPOSE,
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
    const ok = await bcrypt.compare(code, row.codeHash);
    if (!ok) {
      throw new NexaraError(
        ErrorCodes.UNAUTHORIZED,
        'OTP expired or invalid',
        401,
      );
    }
    row.consumedAt = new Date();
    await this.otps.save(row);
    user.mpinHash = await bcrypt.hash(mpin, 10);
    await this.users.save(user);
    return { success: true, reset: true };
  }

  async resetMpinWithPan(
    userId: string,
    pan: string,
    mpin: string,
    merchantPan?: string | null,
  ) {
    if (!MPIN_PATTERN.test(mpin)) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        MPIN_VALIDATION_MESSAGE,
        400,
      );
    }
    const user = await this.requireActive(userId);
    if (user.role !== UserRole.MERCHANT) {
      throw new NexaraError(
        ErrorCodes.FORBIDDEN,
        'Only merchant accounts can reset a transaction PIN',
        403,
      );
    }
    const cleanInputPan = pan.toUpperCase().trim();
    if (merchantPan && merchantPan.trim().length > 0) {
      const cleanMerchantPan = merchantPan.toUpperCase().trim();
      const match =
        cleanInputPan === cleanMerchantPan ||
        cleanMerchantPan.includes(cleanInputPan) ||
        cleanInputPan.includes(cleanMerchantPan);
      if (!match) {
        throw new NexaraError(
          ErrorCodes.INVALID_REQUEST,
          'PAN number does not match registered merchant records',
          400,
        );
      }
    }
    user.mpinHash = await bcrypt.hash(mpin, 10);
    await this.users.save(user);
    return { success: true, reset: true };
  }

  async clearMpinForMerchant(merchantId: string): Promise<{ success: true }> {
    const user = await this.findMerchantUser(merchantId);
    if (!user) {
      throw new NexaraError(
        ErrorCodes.MERCHANT_NOT_FOUND,
        'Merchant user was not found',
        404,
      );
    }
    user.mpinHash = null;
    await this.users.save(user);
    return { success: true };
  }

  async createMerchantUser(input: {
    email: string;
    name: string;
    mobile: string;
    merchantId: string;
    organizationId: string | null;
    password?: string;
    mpin?: string;
  }): Promise<User> {
    const email = input.email.toLowerCase().trim();
    const existingEmail = await this.findByEmail(email);
    if (existingEmail) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'A user with this email already exists',
        409,
      );
    }
    const existingMobile = await this.findByMobile(input.mobile);
    if (existingMobile) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'A user with this mobile already exists',
        409,
      );
    }
    const password =
      input.password ??
      this.config.get<string>('auth.merchantDefaultPassword') ??
      'ChangeMe#2026';
    const user = this.users.create({
      email,
      name: input.name,
      mobile: input.mobile,
      role: UserRole.MERCHANT,
      merchantId: input.merchantId,
      organizationId: input.organizationId,
      passwordHash: await bcrypt.hash(password, 10),
      mpinHash: input.mpin ? await bcrypt.hash(input.mpin, 10) : null,
      status: 'ACTIVE',
    });
    return this.users.save(user);
  }

  async createStaffUser(input: {
    email: string;
    name: string;
    role?: UserRole;
    password?: string;
  }): Promise<User> {
    const email = input.email.toLowerCase().trim();
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'A staff user with this email already exists',
        409,
      );
    }
    const password = input.password ?? 'NexaraOps#2026';
    const user = this.users.create({
      email,
      name: input.name,
      mobile: null,
      role: input.role || UserRole.OPS,
      merchantId: null,
      organizationId: null,
      passwordHash: await bcrypt.hash(password, 10),
      status: 'ACTIVE',
    });
    return this.users.save(user);
  }

  async listStaffUsers(): Promise<User[]> {
    return this.users.find({
      where: [
        { role: UserRole.ADMIN, status: 'ACTIVE' },
        { role: UserRole.OPS, status: 'ACTIVE' },
      ],
      order: { createdAt: 'ASC' },
    });
  }

  async deleteStaffUser(id: string): Promise<{ success: boolean }> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) {
      throw new NexaraError(ErrorCodes.INVALID_REQUEST, 'User not found', 404);
    }
    if (user.role === UserRole.ADMIN) {
      throw new NexaraError(
        ErrorCodes.FORBIDDEN,
        'Root Platform Admin user cannot be deleted',
        403,
      );
    }
    user.status = 'DISABLED';
    await this.users.save(user);
    return { success: true };
  }

  async listByRole(role: UserRole): Promise<User[]> {
    return this.users.find({ where: { role, status: 'ACTIVE' } });
  }

  async listAllActive(): Promise<User[]> {
    return this.users.find({ where: { status: 'ACTIVE' } });
  }

  private async ensureStaffUser(
    email: string,
    password: string,
    name: string,
    role: UserRole,
  ): Promise<void> {
    const existing = await this.findByEmail(email);
    if (existing) {
      return;
    }
    await this.users.save(
      this.users.create({
        email: email.toLowerCase().trim(),
        name,
        mobile: null,
        role,
        merchantId: null,
        organizationId: null,
        passwordHash: await bcrypt.hash(password, 10),
        status: 'ACTIVE',
      }),
    );
  }
}
