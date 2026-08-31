import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { MPIN_PATTERN, MPIN_VALIDATION_MESSAGE } from '../../../common/dto/mpin';

export class CreateBeneficiaryDto {
  @ApiProperty({ example: 'Rahul Sharma' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  mobile?: string;

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

  @ApiPropertyOptional({ enum: ['IMPS', 'NEFT', 'RTGS', 'UPI'], default: 'IMPS' })
  @IsOptional()
  @IsIn(['IMPS', 'NEFT', 'RTGS', 'UPI'])
  paymentMode?: string;

  @ApiPropertyOptional({ enum: ['PERSONAL', 'ORG'], default: 'PERSONAL' })
  @IsOptional()
  @IsIn(['PERSONAL', 'ORG'])
  scope?: 'PERSONAL' | 'ORG';

  @ApiPropertyOptional()
  @IsOptional()
  isVerified?: boolean;
}

export class BeneficiaryOtpDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @IsNotEmpty()
  mobile: string;

  @ApiPropertyOptional({
    description: 'Omit or set action=send to request OTP; include code to verify',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'send' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  beneficiaryId?: string;
}

export class IfscLookupDto {
  @ApiProperty({ example: 'YESB0000123' })
  @IsString()
  @IsNotEmpty()
  ifsc: string;
}

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://merchant.example.com/webhooks/nexara' })
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiPropertyOptional({ type: [String], example: ['payout.success', 'payout.failed'] })
  @IsOptional()
  events?: string[];
}

export class BroadcastNotificationDto {
  @ApiProperty({
    enum: ['ALL', 'ADMIN', 'SUPER_DISTRIBUTOR', 'DISTRIBUTOR', 'MERCHANT', 'SPECIFIC'],
  })
  @IsIn([
    'ALL',
    'ADMIN',
    'SUPER_DISTRIBUTOR',
    'DISTRIBUTOR',
    'MERCHANT',
    'SPECIFIC',
  ])
  audience: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required when audience is SPECIFIC',
  })
  @IsOptional()
  @IsUUID()
  recipientId?: string;

  @ApiProperty({ example: 'Scheduled maintenance' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Payouts may be delayed between 2–4 AM IST.' })
  @IsString()
  @IsNotEmpty()
  body: string;
}

export class MerchantPayoutDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  beneficiaryId?: string;

  @ApiPropertyOptional({ example: 'Rahul Sharma' })
  @IsOptional()
  @IsString()
  beneficiaryName?: string;

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
  paymentMode: 'IMPS' | 'NEFT' | 'RTGS' | 'UPI';

  @ApiProperty({ example: '1500.00' })
  @IsString()
  @IsNotEmpty()
  amount: string;

  @ApiProperty({ example: 'INV-2026-001' })
  @IsString()
  @IsNotEmpty()
  merchantReference: string;

  @ApiProperty({
    description: '6-digit merchant transaction PIN set during onboarding',
    example: '123456',
  })
  @IsString()
  @Matches(MPIN_PATTERN, { message: MPIN_VALIDATION_MESSAGE })
  mpin: string;
}

export class SetMpinDto {
  @ApiProperty({ description: 'New 6-digit transaction PIN', example: '123456' })
  @IsString()
  @Matches(MPIN_PATTERN, { message: MPIN_VALIDATION_MESSAGE })
  mpin: string;

  @ApiPropertyOptional({
    description: 'Required when changing an existing PIN (not for OTP reset)',
    example: '654321',
  })
  @IsOptional()
  @IsString()
  @Matches(MPIN_PATTERN, { message: MPIN_VALIDATION_MESSAGE })
  currentMpin?: string;
}

export class ResetMpinDto {
  @ApiProperty({
    description: 'OTP sent to registered mobile via POST /me/mpin/reset/request',
    example: '123456',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;

  @ApiProperty({ description: 'New 6-digit transaction PIN', example: '789012' })
  @IsString()
  @Matches(MPIN_PATTERN, { message: MPIN_VALIDATION_MESSAGE })
  mpin: string;
}

export class BbpsPayDto {
  @ApiProperty({ example: 'biller-electricity-maharashtra' })
  @IsString()
  @IsNotEmpty()
  billerId: string;

  @ApiProperty({ example: '1234567890' })
  @IsString()
  @IsNotEmpty()
  consumerNumber: string;

  @ApiPropertyOptional({ example: '1450.00' })
  @IsOptional()
  @IsString()
  amount?: string;

  @ApiProperty({ description: '6-digit merchant transaction PIN', example: '123456' })
  @IsString()
  @Matches(MPIN_PATTERN, { message: MPIN_VALIDATION_MESSAGE })
  mpin: string;
}

export class ReconciliationResolveDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  payoutId?: string;

  @ApiPropertyOptional({ description: 'Alias for payoutId (e.g. rec_<uuid>)' })
  @IsOptional()
  @IsString()
  itemId?: string;

  @ApiPropertyOptional({ example: 'ACCEPT' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ example: 'Matched with bank statement' })
  @IsOptional()
  @IsString()
  notes?: string;
}
