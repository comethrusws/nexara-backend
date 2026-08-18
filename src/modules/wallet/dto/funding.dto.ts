import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { FundingChannel } from '../entities/wallet-funding.entity';

const AMOUNT = /^\d+(\.\d{1,2})?$/;

export class FundWalletDto {
  @IsString()
  @Matches(AMOUNT)
  amount: string;

  @IsIn(Object.values(FundingChannel))
  channel: (typeof FundingChannel)[keyof typeof FundingChannel];

  @IsString()
  @IsNotEmpty()
  externalRef: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  paymentDate?: string;
}
