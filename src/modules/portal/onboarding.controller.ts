import { Body, Controller, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import { AuthService } from '../auth/auth.service';
import { Public } from '../auth/decorators/public.decorator';
import { PublicOnboardingDto } from '../merchants/dto/merchant.dto';
import { MerchantsService } from '../merchants/merchants.service';

@Public()
@ApiTags('Onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Self-serve merchant registration',
    description:
      'Creates merchant, runs mock KYC, stores selfie in S3, and returns a login session. MPIN is optional here and required only when initiating payouts.',
  })
  @ApiResponse({ status: 201, description: 'Merchant created and session issued' })
  async register(@Body() raw: Record<string, unknown>) {
    const normalized = this.normalize(raw);
    const body = plainToInstance(PublicOnboardingDto, normalized);
    const errors = await validate(body, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      const message = errors
        .flatMap((error) => Object.values(error.constraints ?? {}))
        .join('; ');
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        message || 'Invalid onboarding payload',
      );
    }

    const password =
      body.password ??
      this.config.get<string>('auth.merchantDefaultPassword') ??
      'ChangeMe#2026';
    const merchant = await this.merchants.registerSelfServe({
      ...body,
      password,
    });
    const session = await this.auth.login(body.email, password);
    return { merchant, ...session };
  }

  private normalize(raw: Record<string, unknown>) {
    const mobileSource = String(raw.mobile ?? raw.phone ?? '');
    const mobile = mobileSource.replace(/\D/g, '').slice(-10);
    const pan = raw.pan ? String(raw.pan).toUpperCase().trim() : undefined;
    const aadhaar = raw.aadhaar
      ? String(raw.aadhaar).replace(/\D/g, '')
      : undefined;
    const mpin = raw.mpin != null ? String(raw.mpin).replace(/\D/g, '') : undefined;
    return {
      mobile,
      businessName: String(
        raw.businessName ?? raw.legalName ?? raw.tradeName ?? '',
      ).trim(),
      contactPerson: String(
        raw.contactPerson ?? raw.contactName ?? '',
      ).trim(),
      email: String(raw.email ?? '')
        .trim()
        .toLowerCase(),
      address: String(raw.address ?? '').trim(),
      password: raw.password ? String(raw.password) : undefined,
      mpin,
      dailyPayoutLimit: raw.dailyPayoutLimit
        ? String(raw.dailyPayoutLimit)
        : undefined,
      parentOrganizationId: raw.parentOrganizationId
        ? String(raw.parentOrganizationId)
        : undefined,
      pan,
      aadhaar,
      latitude:
        raw.latitude != null
          ? String(raw.latitude)
          : raw.lat != null
            ? String(raw.lat)
            : undefined,
      longitude:
        raw.longitude != null
          ? String(raw.longitude)
          : raw.lng != null
            ? String(raw.lng)
            : undefined,
      shopType: raw.shopType ? String(raw.shopType) : undefined,
      agreementAccepted:
        raw.agreementAccepted === true || raw.agreementAccepted === 'true',
      selfieBase64: raw.selfieBase64
        ? String(raw.selfieBase64)
        : raw.selfie
          ? String(raw.selfie)
          : undefined,
      selfieContentType: raw.selfieContentType
        ? String(raw.selfieContentType)
        : undefined,
    };
  }
}
