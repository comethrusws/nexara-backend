import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KycModule } from '../../integrations/kyc/kyc.module';
import { StorageModule } from '../../integrations/storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { FeeEngineModule } from '../fee-engine/fee-engine.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { Payout } from '../payouts/entities/payout.entity';
import { WalletModule } from '../wallet/wallet.module';
import { MerchantKyc } from './entities/merchant-kyc.entity';
import { Merchant } from './entities/merchant.entity';
import { AgreementService } from './agreement/agreement.service';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Merchant, MerchantKyc, Payout]),
    KycModule,
    StorageModule,
    forwardRef(() => WalletModule),
    OrganizationsModule,
    AuthModule,
    NotificationsModule,
    AuditModule,
    FeeEngineModule,
  ],
  controllers: [MerchantsController],
  providers: [MerchantsService, AgreementService],
  exports: [MerchantsService, AgreementService],
})
export class MerchantsModule {}
