import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { PlatformFeeConfig } from './entities/platform-fee-config.entity';
import { FeeEngineController } from './fee-engine.controller';
import { FeeEngineService } from './fee-engine.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlatformFeeConfig]), AuditModule],
  controllers: [FeeEngineController],
  providers: [FeeEngineService],
  exports: [FeeEngineService],
})
export class FeeEngineModule {}
