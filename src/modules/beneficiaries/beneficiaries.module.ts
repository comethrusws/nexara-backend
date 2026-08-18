import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BeneficiariesService } from './beneficiaries.service';
import { SavedBeneficiary } from './entities/beneficiary.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SavedBeneficiary])],
  providers: [BeneficiariesService],
  exports: [BeneficiariesService],
})
export class BeneficiariesModule {}
