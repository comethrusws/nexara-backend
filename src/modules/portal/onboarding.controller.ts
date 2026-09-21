import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
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
import { UsersService } from '../auth/users.service';
import { PublicOnboardingDto } from '../merchants/dto/merchant.dto';
import { AgreementService } from '../merchants/agreement/agreement.service';
import { MerchantsService } from '../merchants/merchants.service';

@Public()
@ApiTags('Onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    private readonly agreement: AgreementService,
  ) {}

  @Get('agreement')
  @ApiOperation({
    summary: 'Current Merchant Services Agreement',
    description:
      'Returns the current versioned agreement text shown in onboarding Step 4. Public so the pre-login onboarding page can render it.',
  })
  @ApiResponse({ status: 200, description: 'Current agreement record' })
  getAgreement() {
    return this.agreement.getCurrent();
  }

  @Get('agreement.pdf')
  @ApiOperation({
    summary: 'Personalized agreement PDF for wet signing',
    description:
      'Generates the current agreement pre-filled with the provisioned merchant details plus a deterministic document reference. Print, sign by hand, and upload the scan in onboarding Step 4.',
  })
  @ApiResponse({ status: 200, description: 'Agreement PDF bytes' })
  async getAgreementPdf(@Query('mobile') mobile?: string) {
    const digits = String(mobile ?? '')
      .replace(/\D/g, '')
      .slice(-10);
    if (!digits) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'Query parameter mobile is required',
        400,
      );
    }
    const merchant = await this.merchants.findLatestByMobile(digits);
    if (!merchant) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'This mobile number is not provisioned. Please contact your administrator.',
        404,
      );
    }
    const pdf = await this.agreement.renderPdf({
      merchantId: merchant.id,
      businessName: merchant.businessName,
      tradeName: (merchant as { tradeName?: string }).tradeName,
      contactPerson: merchant.contactPerson,
      mobile: merchant.mobile,
    });
    // StreamableFile sets headers only on the success path. (A method-level
    // @Header would also stick to thrown-error responses, letting JSON
    // errors masquerade as PDFs downstream.)
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="Nexara-Agreement-${digits}.pdf"`,
    });
  }

  @Post()
  @ApiOperation({
    summary: 'Self-serve merchant registration',
    description:
      'Creates merchant, runs mock KYC, stores selfie in S3, and returns a login session. MPIN is optional here and required only when initiating payouts.',
  })
  @ApiResponse({ status: 201, description: 'Merchant created and session issued' })
  async register(
    @Body() raw: Record<string, unknown>,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const normalized = this.normalize(raw);
    const body = plainToInstance(PublicOnboardingDto, normalized);
    const errors = await validate(body, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      const message = errors
        .flatMap((error: any) => Object.values(error.constraints ?? {}))
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
    const merchant = await this.merchants.registerSelfServe(
      {
        ...body,
        password,
      },
      { ip, userAgent },
    );
    const user = await this.users.findByMobile(body.mobile);
    if (!user) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'Merchant account was created but login user was not found',
        500,
      );
    }
    const session = await this.auth.issueSessionForUser(user);
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
      agreementVersion: raw.agreementVersion
        ? String(raw.agreementVersion)
        : undefined,
      signatureMethod: raw.signatureMethod
        ? String(raw.signatureMethod)
        : undefined,
      typedName: raw.typedName ? String(raw.typedName) : undefined,
      signaturePngBase64: raw.signaturePngBase64
        ? String(raw.signaturePngBase64)
        : undefined,
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
