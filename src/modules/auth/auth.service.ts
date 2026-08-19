import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { IsNull, Repository } from 'typeorm';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import { OtpChallenge } from './entities/otp-challenge.entity';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(OtpChallenge)
    private readonly otps: Repository<OtpChallenge>,
  ) {}

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user || user.status !== 'ACTIVE') {
      throw new NexaraError(
        ErrorCodes.UNAUTHORIZED,
        'Invalid email or password',
        401,
      );
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new NexaraError(
        ErrorCodes.UNAUTHORIZED,
        'Invalid email or password',
        401,
      );
    }
    return this.issue(user);
  }

  private normalizeMobile(mobile: string): string {
    const digits = mobile.replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

  async requestOtp(mobile: string) {
    const cleanMobile = this.normalizeMobile(mobile);
    const user = await this.users.findByMobile(cleanMobile);
    if (!user || user.status !== 'ACTIVE') {
      throw new NexaraError(
        ErrorCodes.UNAUTHORIZED,
        'This mobile number is not registered',
        401,
      );
    }
    const demoCode = this.config.get<string>('auth.otpCode') ?? '123456';
    const challenge = this.otps.create({
      mobile: cleanMobile,
      codeHash: await bcrypt.hash(demoCode, 8),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
    });
    await this.otps.save(challenge);
    return {
      sent: true,
      demoCode:
        this.config.get<string>('nodeEnv') === 'production' ? undefined : demoCode,
    };
  }

  async verifyOtp(mobile: string, code: string) {
    const cleanMobile = this.normalizeMobile(mobile);
    const user = await this.users.findByMobile(cleanMobile);
    if (!user || user.status !== 'ACTIVE') {
      throw new NexaraError(
        ErrorCodes.UNAUTHORIZED,
        'This mobile number is not registered',
        401,
      );
    }
    const row = await this.otps.findOne({
      where: { mobile: cleanMobile, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (!row || row.consumedAt || row.expiresAt.getTime() < Date.now()) {
      throw new NexaraError(ErrorCodes.UNAUTHORIZED, 'OTP expired or invalid', 401);
    }
    const ok = await bcrypt.compare(code, row.codeHash);
    if (!ok) {
      throw new NexaraError(ErrorCodes.UNAUTHORIZED, 'OTP expired or invalid', 401);
    }
    row.consumedAt = new Date();
    await this.otps.save(row);
    return this.issue(user);
  }

  private issue(user: User) {
    const accessToken = this.jwt.sign({
      sub: user.id,
      role: user.role,
      merchantId: user.merchantId,
      organizationId: user.organizationId,
    });
    return {
      accessToken,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        merchantId: user.merchantId,
        organizationId: user.organizationId,
      },
    };
  }
}
