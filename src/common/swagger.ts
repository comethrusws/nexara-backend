import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { LoginDto, RequestOtpDto, VerifyOtpDto } from '../modules/auth/dto/auth.dto';
import { PublicOnboardingDto } from '../modules/merchants/dto/merchant.dto';
import { BeneficiaryDto } from '../modules/payouts/dto/payout.dto';
import {
  BbpsPayDto,
  BeneficiaryOtpDto,
  CreateBeneficiaryDto,
  MerchantPayoutDto,
  ReconciliationResolveDto,
  ResetMpinDto,
  SetMpinDto,
} from '../modules/portal/dto/portal.dto';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Nexara API')
    .setDescription(
      [
        'Payment orchestration API. Nest owns merchants, KYC, hierarchy, payout orders, and bank routing.',
        'Apache Fineract is the wallet ledger (balances and statement).',
        '',
        '**Auth:** Use **Authorize** with the `accessToken` from `POST /v1/auth/login`.',
        'Staff: `admin@nexara.com` / `NexaraAdmin#2026`.',
        '',
        '**MPIN:** Self-serve merchants set a 6-digit transaction PIN during `POST /v1/onboarding`.',
        'It is required on `POST /v1/me/payouts` and `POST /v1/me/bill-payments`.',
        'Change PIN: `POST /v1/me/mpin` (with currentMpin). Forgot PIN: `POST /v1/me/mpin/reset/request` then `POST /v1/me/mpin/reset`.',
        'Ops can clear a merchant PIN: `POST /v1/ops/merchants/:id/mpin/reset`.',
        '',
        'Written guide: `docs/END-TO-END.md`.',
      ].join('\n\n'),
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT',
    )
    .addTag('Auth', 'Login and OTP')
    .addTag('Onboarding', 'Public self-serve merchant registration')
    .addTag('Session', 'Current user profile')
    .addTag('Merchant portal', 'Wallet, payouts, beneficiaries, webhooks')
    .addTag('Merchant — BBPS', 'Bill payments (mock)')
    .addTag('Ops — Dashboard', 'Admin analytics')
    .addTag('Ops — Merchants', 'Merchant lifecycle and KYC')
    .addTag('Ops — Payouts', 'Ops-initiated payouts')
    .addTag('Ops — Wallets', 'Wallet ops')
    .addTag('Ops — Reconciliation', 'Payout reconciliation')
    .addTag('Ops — Webhooks', 'Cross-merchant webhook monitor')
    .addTag('Ops — Organizations & banks', 'Hierarchy and bank rails')
    .addTag('Ops — Notifications', 'Broadcast notifications')
    .addTag('Ops — Audit', 'Audit log')
    .addTag('Ops Team', 'Staff user management')
    .addTag('Health', 'Liveness checks')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [
      BeneficiaryDto,
      PublicOnboardingDto,
      MerchantPayoutDto,
      SetMpinDto,
      ResetMpinDto,
      BbpsPayDto,
      BeneficiaryOtpDto,
      CreateBeneficiaryDto,
      ReconciliationResolveDto,
      LoginDto,
      RequestOtpDto,
      VerifyOtpDto,
    ],
  });
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
}
