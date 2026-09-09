import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FineractModule } from '../../integrations/fineract/fineract.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { WalletFunding } from './entities/wallet-funding.entity';
import { WalletMapping } from './entities/wallet-mapping.entity';
import { WalletOpsController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WalletMapping, WalletFunding]),
    FineractModule,
    forwardRef(() => MerchantsModule),
  ],
  controllers: [WalletOpsController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
