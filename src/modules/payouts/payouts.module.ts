import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankModule } from '../../integrations/banks/bank.module';
import { FineractModule } from '../../integrations/fineract/fineract.module';
import { BeneficiariesModule } from '../beneficiaries/beneficiaries.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { WalletModule } from '../wallet/wallet.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { Payout } from './entities/payout.entity';
import { PayoutStatusEvent } from './entities/payout-status-event.entity';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payout, PayoutStatusEvent]),
    BeneficiariesModule,
    MerchantsModule,
    OrganizationsModule,
    WalletModule,
    FineractModule,
    BankModule,
    NotificationsModule,
    WebhooksModule,
  ],
  controllers: [PayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
