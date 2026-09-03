import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { MPIN_PATTERN, MPIN_VALIDATION_MESSAGE } from '../../../common/dto/mpin';
import { FeeType, MerchantChannel, MerchantStatus, MerchantTier } from '../merchant.enums';

const AMOUNT = /^\d+(\.\d{1,2})?$/;
const PERCENT = /^\d+(\.\d{1,4})?$/;
const MOBILE = /^\d{10}$/;

export class MerchantServicesDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  payouts?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  bbpsBills?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  licInsurance?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  loanEmi?: boolean;
}

export class FeeTierDto {
  @IsOptional()
  minTxCount?: number;

  @IsOptional()
  maxTxCount?: number | null;

  @IsOptional()
  feePerTx?: number;
}

export class CreateMerchantDto {
  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsString()
  @Matches(MOBILE, { message: 'mobile must be 10 digits' })
  mobile: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @Matches(AMOUNT)
  dailyPayoutLimit?: string;

  @IsOptional()
  @IsEnum(FeeType)
  feeType?: FeeType;

  @IsOptional()
  @IsString()
  @Matches(AMOUNT)
  feeValue?: string;

  @IsOptional()
  @IsString()
  @Matches(AMOUNT)
  gstPercent?: string;

  @IsOptional()
  @IsUUID()
  parentOrganizationId?: string;

  @IsOptional()
  @IsIn(['SUPER_DISTRIBUTOR', 'DISTRIBUTOR', 'RETAILER', 'MERCHANT'])
  entityType?: string;

  @IsOptional()
  @IsString()
  @Matches(AMOUNT)
  perPayoutLimit?: string;

  @IsOptional()
  @IsString()
  feeSlabsJson?: string;

  @IsOptional()
  @IsString()
  distributorCommissionPercent?: string;

  @IsOptional()
  @IsString()
  superDistributorCommissionPercent?: string;

  @IsOptional()
  @IsString()
  masterDistributorCommissionPercent?: string;

  @IsOptional()
  @IsEnum(MerchantChannel)
  channel?: MerchantChannel;

  @IsOptional()
  @IsEnum(MerchantTier)
  tier?: MerchantTier;

  @IsOptional()
  @ValidateNested()
  @Type(() => MerchantServicesDto)
  services?: MerchantServicesDto;

  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({
    description: '6-digit transaction PIN for merchant payouts',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  @Matches(MPIN_PATTERN, { message: MPIN_VALIDATION_MESSAGE })
  mpin?: string;
}

export class SuspendMerchantDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class PublicOnboardingDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(MOBILE, { message: 'mobile must be 10 digits' })
  mobile: string;

  @ApiProperty({ example: 'Sharma General Store' })
  @IsString()
  @IsNotEmpty()
  businessName: string;

  @ApiProperty({ example: 'Rahul Sharma' })
  @IsString()
  @IsNotEmpty()
  contactPerson: string;

  @ApiProperty({ example: 'rahul@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '12 MG Road, Pune' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({ description: 'Login password; auto-generated if omitted' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({
    description:
      'Optional 6-digit transaction PIN; can be set later via POST /v1/me/mpin before payouts',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  @Matches(MPIN_PATTERN, { message: MPIN_VALIDATION_MESSAGE })
  mpin?: string;

  @IsOptional()
  @IsString()
  @Matches(AMOUNT)
  dailyPayoutLimit?: string;

  @IsOptional()
  @IsUUID()
  parentOrganizationId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/, {
    message: 'pan must match ABCDE1234F',
  })
  pan?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{12}$/, { message: 'aadhaar must be 12 digits' })
  aadhaar?: string;

  @IsOptional()
  @IsString()
  latitude?: string;

  @IsOptional()
  @IsString()
  longitude?: string;

  @IsOptional()
  @IsString()
  shopType?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  agreementAccepted?: boolean;

  /** Optional data-URL or raw base64 selfie for S3 storage */
  @IsOptional()
  @IsString()
  selfieBase64?: string;

  @IsOptional()
  @IsString()
  selfieContentType?: string;
}

export class VerifyAadhaarDto {
  @IsString()
  @Matches(/^\d{12}$/, { message: 'aadhaarNumber must be 12 digits' })
  aadhaarNumber: string;
}

export class VerifyPanDto {
  @IsString()
  @Matches(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/, {
    message: 'pan must match ABCDE1234F',
  })
  pan: string;

  @Type(() => String)
  @IsOptional()
  @IsString()
  name?: string;
}

export class UpdateMerchantDto {
  @IsOptional()
  @IsEnum(MerchantStatus)
  status?: MerchantStatus;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  @Matches(AMOUNT)
  dailyPayoutLimit?: string;

  @IsOptional()
  @IsString()
  @Matches(AMOUNT)
  perPayoutLimit?: string;

  @IsOptional()
  @IsEnum(FeeType)
  feeType?: FeeType;

  @IsOptional()
  @IsString()
  @Matches(AMOUNT)
  feeValue?: string;

  @IsOptional()
  @IsString()
  @Matches(AMOUNT)
  gstPercent?: string;

  @IsOptional()
  @IsEnum(MerchantTier)
  tier?: MerchantTier;

  @IsOptional()
  @IsString()
  @Matches(AMOUNT)
  percentFee?: string;

  @IsOptional()
  @IsString()
  feeSlabsJson?: string;

  @IsOptional()
  @IsEnum(MerchantChannel)
  channel?: MerchantChannel;

  @IsOptional()
  @IsString()
  @Matches(PERCENT, {
    message:
      'distributorCommissionPercent must be a percentage like 0.2 or 0.025',
  })
  distributorCommissionPercent?: string;

  @IsOptional()
  @IsString()
  @Matches(PERCENT, {
    message:
      'superDistributorCommissionPercent must be a percentage like 0.025',
  })
  superDistributorCommissionPercent?: string;

  @IsOptional()
  @IsString()
  @Matches(PERCENT, {
    message:
      'masterDistributorCommissionPercent must be a percentage like 0.01',
  })
  masterDistributorCommissionPercent?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MerchantServicesDto)
  services?: MerchantServicesDto;
}

export class OnboardingExtrasDto {
  @IsOptional()
  @IsString()
  latitude?: string;

  @IsOptional()
  @IsString()
  longitude?: string;

  @IsOptional()
  @IsString()
  shopType?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  agreementAccepted?: boolean;
}
