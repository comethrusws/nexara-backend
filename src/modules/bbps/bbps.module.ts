import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { WalletModule } from '../wallet/wallet.module';
import { BbpsController } from './bbps.controller';
import { BbpsService } from './bbps.service';
import { BillPayment } from './entities/bill-payment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BillPayment]),
    AuthModule,
    MerchantsModule,
    WalletModule,
  ],
  controllers: [BbpsController],
  providers: [BbpsService],
  exports: [BbpsService],
})
export class BbpsModule {}
