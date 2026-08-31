import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Merchant } from '../merchants/entities/merchant.entity';
import { Payout } from '../payouts/entities/payout.entity';
import { PayoutsModule } from '../payouts/payouts.module';
import { ReconciliationItem } from './entities/reconciliation.entity';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReconciliationItem, Payout, Merchant]),
    PayoutsModule,
  ],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
