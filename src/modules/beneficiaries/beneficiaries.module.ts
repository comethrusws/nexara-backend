import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OtpChallenge } from '../auth/entities/otp-challenge.entity';
import { BeneficiariesService } from './beneficiaries.service';
import { SavedBeneficiary } from './entities/beneficiary.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SavedBeneficiary, OtpChallenge])],
  providers: [BeneficiariesService],
  exports: [BeneficiariesService],
})
export class BeneficiariesModule {}
