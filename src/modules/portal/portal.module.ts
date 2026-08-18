import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BeneficiariesModule } from '../beneficiaries/beneficiaries.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { WalletModule } from '../wallet/wallet.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { OnboardingController } from './onboarding.controller';
import { PortalController } from './portal.controller';
import { SessionController } from './session.controller';

@Module({
  imports: [
    AuthModule,
    MerchantsModule,
    WalletModule,
    PayoutsModule,
    BeneficiariesModule,
    NotificationsModule,
    WebhooksModule,
  ],
  controllers: [SessionController, PortalController, OnboardingController],
})
export class PortalModule {}
