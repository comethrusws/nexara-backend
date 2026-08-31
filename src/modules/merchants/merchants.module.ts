import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KycModule } from '../../integrations/kyc/kyc.module';
import { StorageModule } from '../../integrations/storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { Payout } from '../payouts/entities/payout.entity';
import { WalletModule } from '../wallet/wallet.module';
import { MerchantKyc } from './entities/merchant-kyc.entity';
import { Merchant } from './entities/merchant.entity';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Merchant, MerchantKyc, Payout]),
    KycModule,
    StorageModule,
    WalletModule,
    OrganizationsModule,
    AuthModule,
    NotificationsModule,
    AuditModule,
  ],
  controllers: [MerchantsController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}
