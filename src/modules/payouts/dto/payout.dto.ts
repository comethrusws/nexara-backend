import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import type { PaymentMode } from '../../../integrations/banks/bank.types';

export class BeneficiaryDto {
  @ApiProperty({ example: 'Rahul Sharma' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: '123456789012' })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({ example: 'YESB0000123' })
  @IsOptional()
  @IsString()
  ifsc?: string;

  @ApiPropertyOptional({ example: 'YES Bank' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ example: 'rahul@upi' })
  @IsOptional()
  @IsString()
  vpa?: string;

  @ApiProperty({ enum: ['IMPS', 'NEFT', 'RTGS', 'UPI'], example: 'IMPS' })
  @IsIn(['IMPS', 'NEFT', 'RTGS', 'UPI'])
  paymentMode: PaymentMode;
}

export class CreatePayoutDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  @IsNotEmpty()
  merchantId: string;

  @ApiProperty({ example: 'OPS-REF-001' })
  @IsString()
  @IsNotEmpty()
  merchantReference: string;

  @ApiProperty({ example: '1500.00' })
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  beneficiaryId?: string;

  @ApiPropertyOptional({ type: BeneficiaryDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BeneficiaryDto)
  beneficiary?: BeneficiaryDto;
}
