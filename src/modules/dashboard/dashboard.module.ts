import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { Merchant } from '../merchants/entities/merchant.entity';
import { Payout } from '../payouts/entities/payout.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([Payout, Merchant, User])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
