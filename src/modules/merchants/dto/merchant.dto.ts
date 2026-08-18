import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { FeeType, MerchantStatus, MerchantTier } from '../merchant.enums';

const AMOUNT = /^\d+(\.\d{1,2})?$/;
const MOBILE = /^\d{10}$/;

export class CreateMerchantDto {
  @IsString()
  @IsNotEmpty()
  businessName: string;

  @IsString()
  @IsNotEmpty()
  contactPerson: string;

  @IsString()
  @Matches(MOBILE, { message: 'mobile must be 10 digits' })
  mobile: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @Matches(AMOUNT)
  dailyPayoutLimit: string;

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
  @IsString()
  @Matches(AMOUNT)
  perPayoutLimit?: string;

  @IsOptional()
  @IsEnum(MerchantTier)
  tier?: MerchantTier;

  @IsOptional()
  @IsString()
  password?: string;
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
