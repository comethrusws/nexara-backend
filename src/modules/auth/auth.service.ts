import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { IsNull, Not, Repository } from 'typeorm';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import { OtpChallenge } from './entities/otp-challenge.entity';
import { AuthSession } from './entities/auth-session.entity';
import { User } from './entities/user.entity';
import { UserRole } from './auth.constants';
import {
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  SESSION_TOUCH_MS,
} from './auth.constants';
import { UsersService } from './users.service';
import { Merchant } from '../merchants/entities/merchant.entity';
import { MerchantStatus } from '../merchants/merchant.enums';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationType } from '../organizations/organization.constants';

export type OtpPurpose = 'LOGIN' | 'ONBOARDING';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(OtpChallenge)
    private readonly otps: Repository<OtpChallenge>,
    @InjectRepository(Merchant)
    private readonly merchants: Repository<Merchant>,
    @InjectRepository(Organization)
    private readonly orgs: Repository<Organization>,
    @InjectRepository(AuthSession)
    private readonly sessions: Repository<AuthSession>,
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
    const syncedUser = await this.ensureUserRoleSynced(user);
    return this.issue(syncedUser);
  }

  private normalizeMobile(mobile: string): string {
    const digits = mobile.replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

  /** Requires a consumed ONBOARDING OTP for this mobile (signup verification). */
  async assertRecentOnboardingOtp(mobile: string): Promise<void> {
    const cleanMobile = this.normalizeMobile(mobile);
    const windowMs = 30 * 60 * 1000;
    const row = await this.otps.findOne({
      where: {
        mobile: cleanMobile,
        purpose: 'ONBOARDING',
        consumedAt: Not(IsNull()),
      },
      order: { consumedAt: 'DESC' },
    });
    if (!row) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'Please verify your registered mobile number with OTP before completing onboarding',
        400,
      );
    }
    if (Date.now() - row.consumedAt.getTime() > windowMs) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'OTP verification expired. Please verify your mobile number again.',
        400,
      );
    }
  }

  /** Only mobiles pre-provisioned by admin may use ONBOARDING OTP. */
  private async assertProvisionedForOnboarding(cleanMobile: string): Promise<void> {
    const merchant = await this.merchants.findOne({
      where: { mobile: cleanMobile },
      order: { createdAt: 'DESC' },
    });
    if (!merchant) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'This mobile number is not provisioned. Please contact your administrator.',
        404,
      );
    }
    if (merchant.status === MerchantStatus.ACTIVE) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'This mobile number is already registered. Please sign in instead.',
        409,
      );
    }
    if (
      merchant.status !== MerchantStatus.CREATED &&
      merchant.status !== MerchantStatus.KYC_PENDING
    ) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'This merchant account cannot complete onboarding. Please contact support.',
        409,
      );
    }
  }

  async requestOtp(mobile: string, purpose: OtpPurpose = 'LOGIN') {
    const cleanMobile = this.normalizeMobile(mobile);
    const user = await this.users.findByMobile(cleanMobile);

    if (purpose === 'LOGIN') {
      if (user && user.status !== 'ACTIVE') {
        // Disabled accounts must not masquerade as "not registered" — and
        // must not be routable back into onboarding to evade the disable.
        throw new NexaraError(
          ErrorCodes.FORBIDDEN,
          'This account has been disabled. Please contact Nexara support.',
          403,
        );
      }
      if (!user) {
        // Provisioned but never onboarded: no user row exists yet. Tell the
        // client to route into onboarding instead of dead-ending at login.
        const provisioned = await this.merchants.findOne({
          where: { mobile: cleanMobile },
          order: { createdAt: 'DESC' },
        });
        if (provisioned) {
          throw new NexaraError(
            ErrorCodes.ONBOARDING_REQUIRED,
            'This number is provisioned but onboarding is not complete. Verify an onboarding code to continue.',
            409,
          );
        }
        throw new NexaraError(
          ErrorCodes.UNAUTHORIZED,
          'This mobile number is not registered',
          401,
        );
      }
    } else {
      await this.assertProvisionedForOnboarding(cleanMobile);
      if (user && user.status === 'ACTIVE') {
        throw new NexaraError(
          ErrorCodes.INVALID_REQUEST,
          'This mobile number is already registered. Please sign in instead.',
          409,
        );
      }
    }

    const demoCode = this.config.get<string>('auth.otpCode') ?? '123456';
    const challenge = this.otps.create({
      mobile: cleanMobile,
      purpose,
      codeHash: await bcrypt.hash(demoCode, 8),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
    });
    await this.otps.save(challenge);
    return {
      sent: true,
      purpose,
      demoCode:
        this.config.get<string>('nodeEnv') === 'production' ? undefined : demoCode,
    };
  }

  async verifyOtp(
    mobile: string,
    code: string,
    purpose: OtpPurpose = 'LOGIN',
  ) {
    const cleanMobile = this.normalizeMobile(mobile);
    const row = await this.otps.findOne({
      where: {
        mobile: cleanMobile,
        purpose,
        consumedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });
    if (!row || row.consumedAt || row.expiresAt.getTime() < Date.now()) {
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

    if (purpose === 'ONBOARDING') {
      await this.assertProvisionedForOnboarding(cleanMobile);
      const existing = await this.users.findByMobile(cleanMobile);
      if (existing && existing.status === 'ACTIVE') {
        throw new NexaraError(
          ErrorCodes.INVALID_REQUEST,
          'This mobile number is already registered. Please sign in instead.',
          409,
        );
      }
      if (existing) {
        throw new NexaraError(
          ErrorCodes.FORBIDDEN,
          'This account has been disabled. Please contact Nexara support.',
          403,
        );
      }
      // Provisioned tier travels with the onboarding link so the form can
      // lock store-category/role to it without a session. Tier itself stays
      // server-side (organization record) — this is display-only.
      const provisionedMerchant = await this.merchants.findOne({
        where: { mobile: cleanMobile },
        order: { createdAt: 'DESC' },
      });
      let entityType = 'RETAILER';
      if (provisionedMerchant?.organizationId) {
        const org = await this.orgs.findOne({
          where: { id: provisionedMerchant.organizationId },
        });
        if (
          org?.type === OrganizationType.SUPER_DISTRIBUTOR ||
          org?.type === OrganizationType.DISTRIBUTOR
        ) {
          entityType = org.type;
        }
      }
      return {
        verified: true,
        mobile: cleanMobile,
        purpose: 'ONBOARDING' as const,
        entityType,
      };
    }

    const user = await this.users.findByMobile(cleanMobile);
    if (!user || user.status !== 'ACTIVE') {
      throw new NexaraError(
        ErrorCodes.UNAUTHORIZED,
        'This mobile number is not registered',
        401,
      );
    }
    const syncedUser = await this.ensureUserRoleSynced(user);
    return this.issue(syncedUser);
  }

  async issueSessionForUser(user: User) {
    const syncedUser = await this.ensureUserRoleSynced(user);
    return this.issue(syncedUser);
  }

  private async ensureUserRoleSynced(user: User): Promise<User> {
    if (
      user.organizationId &&
      (user.role === UserRole.MERCHANT ||
        user.role === UserRole.DISTRIBUTOR ||
        user.role === UserRole.SUPER_DISTRIBUTOR)
    ) {
      try {
        const org = await this.orgs.findOne({ where: { id: user.organizationId } });
        if (org) {
          let expectedRole: UserRole = UserRole.MERCHANT;
          if (org.type === OrganizationType.SUPER_DISTRIBUTOR) {
            expectedRole = UserRole.SUPER_DISTRIBUTOR;
          } else if (org.type === OrganizationType.DISTRIBUTOR) {
            expectedRole = UserRole.DISTRIBUTOR;
          }
          if (user.role !== expectedRole) {
            user.role = expectedRole;
            await this.users.saveUser(user);
          }
        }
      } catch {
        // ignore fallback
      }
    }
    return user;
  }

  private async issue(user: User) {
    const session = await this.sessions.save(
      this.sessions.create({
        userId: user.id,
        lastSeenAt: new Date(),
        revokedAt: null,
        ip: null,
        userAgent: null,
      }),
    );
    const accessToken = this.jwt.sign({
      sub: user.id,
      sid: session.id,
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

  /** End one login session now — logout, disable, and admin revoke funnel here. */
  async revokeSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.sessions.findOne({
      where: { id: sessionId, userId },
    });
    if (session && !session.revokedAt) {
      session.revokedAt = new Date();
      await this.sessions.save(session);
    }
  }

  /**
   * Guard hook: throws 401 when the session is gone, revoked, idle-timed-out,
   * or past its absolute lifetime. Touches lastSeenAt at most once per
   * SESSION_TOUCH_MS so steady traffic costs ~1 write per 5 minutes.
   */
  async assertSessionActive(sessionId: string, userId: string): Promise<void> {
    const session = await this.sessions.findOne({
      where: { id: sessionId, userId },
    });
    const dead = !session || session.revokedAt;
    if (dead) {
      throw new NexaraError(
        ErrorCodes.UNAUTHORIZED,
        'Session has ended. Please sign in again.',
        401,
      );
    }
    const now = Date.now();
    if (now - session.createdAt.getTime() > SESSION_ABSOLUTE_MS) {
      session.revokedAt = new Date();
      await this.sessions.save(session);
      throw new NexaraError(
        ErrorCodes.UNAUTHORIZED,
        'Session expired. Please sign in again.',
        401,
      );
    }
    if (now - session.lastSeenAt.getTime() > SESSION_IDLE_MS) {
      session.revokedAt = new Date();
      await this.sessions.save(session);
      throw new NexaraError(
        ErrorCodes.UNAUTHORIZED,
        'Session timed out due to inactivity. Please sign in again.',
        401,
      );
    }
    if (now - session.lastSeenAt.getTime() > SESSION_TOUCH_MS) {
      session.lastSeenAt = new Date();
      await this.sessions.save(session);
    }
  }
}
