import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import type { PaymentMode } from '../../../integrations/banks/bank.types';

export class BeneficiaryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  ifsc?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  vpa?: string;

  @IsIn(['IMPS', 'NEFT', 'RTGS', 'UPI'])
  paymentMode: PaymentMode;
}

export class CreatePayoutDto {
  @IsString()
  @IsNotEmpty()
  merchantId: string;

  @IsString()
  @IsNotEmpty()
  merchantReference: string;

  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount: string;

  @ValidateNested()
  @Type(() => BeneficiaryDto)
  beneficiary: BeneficiaryDto;
}
