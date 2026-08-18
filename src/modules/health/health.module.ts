import { Module } from '@nestjs/common';
import { FineractModule } from '../../integrations/fineract/fineract.module';
import { HealthController } from './health.controller';

@Module({
  imports: [FineractModule],
  controllers: [HealthController],
})
export class HealthModule {}
