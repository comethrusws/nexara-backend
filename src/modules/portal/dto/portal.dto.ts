import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateBeneficiaryDto {
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

  @IsOptional()
  @IsIn(['IMPS', 'NEFT', 'RTGS', 'UPI'])
  paymentMode?: string;
}

export class CreateWebhookDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsOptional()
  events?: string[];
}

export class BroadcastNotificationDto {
  @IsIn(['ALL', 'ADMIN', 'SUPER_DISTRIBUTOR', 'DISTRIBUTOR', 'MERCHANT'])
  audience: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string;
}

export class MerchantPayoutDto {
  @IsOptional()
  @IsUUID()
  beneficiaryId?: string;

  @IsOptional()
  @IsString()
  beneficiaryName?: string;

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
  paymentMode: 'IMPS' | 'NEFT' | 'RTGS' | 'UPI';

  @IsString()
  @IsNotEmpty()
  amount: string;

  @IsString()
  @IsNotEmpty()
  merchantReference: string;
}
