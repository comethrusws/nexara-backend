import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FineractModule } from '../../integrations/fineract/fineract.module';
import { Merchant } from '../merchants/entities/merchant.entity';
import { MerchantsModule } from '../merchants/merchants.module';
import { WalletFunding } from './entities/wallet-funding.entity';
import { WalletMapping } from './entities/wallet-mapping.entity';
import { WalletOpsController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WalletMapping, WalletFunding, Merchant]),
    FineractModule,
    forwardRef(() => MerchantsModule),
  ],
  controllers: [WalletOpsController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
