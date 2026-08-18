import { Module } from '@nestjs/common';
import { FineractModule } from '../../integrations/fineract/fineract.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { HealthController } from './health.controller';

@Module({
  imports: [FineractModule, OrganizationsModule],
  controllers: [HealthController],
})
export class HealthModule {}
