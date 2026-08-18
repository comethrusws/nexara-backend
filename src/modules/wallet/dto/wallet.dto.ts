import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

const AMOUNT = /^\d+(\.\d{1,2})?$/;

export class OpenWalletDto {
  @IsString()
  @IsNotEmpty()
  merchantId: string;

  @IsString()
  @IsNotEmpty()
  businessName: string;

  @IsOptional()
  @IsString()
  mobileNo?: string;
}

export class CreditWalletDto {
  @IsString()
  @Matches(AMOUNT, {
    message: 'amount must be a positive INR value with up to 2 decimals',
  })
  amount: string;

  @IsString()
  @IsNotEmpty()
  externalPaymentReference: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
