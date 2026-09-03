import { IsOptional, IsString, Matches } from 'class-validator';

const PERCENT = /^\d+(\.\d{1,4})?$/;
const AMOUNT = /^\d+(\.\d{1,2})?$/;

export class UpdatePlatformFeeConfigDto {
  @IsOptional()
  @IsString()
  standardSlabsJson?: string;

  @IsOptional()
  @IsString()
  apiSlabsJson?: string;

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
  @IsString()
  @Matches(AMOUNT, { message: 'gstPercent must be a number like 18 or 18.00' })
  gstPercent?: string;
}
