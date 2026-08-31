import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@nexara.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'NexaraAdmin#2026' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RequestOtpDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(/^(\+?91)?[6-9]\d{9}$/, { message: 'mobile must be 10 digits' })
  mobile: string;

  @ApiPropertyOptional({ enum: ['LOGIN', 'ONBOARDING'], default: 'LOGIN' })
  @IsOptional()
  @IsIn(['LOGIN', 'ONBOARDING'])
  purpose?: 'LOGIN' | 'ONBOARDING';
}

export class VerifyOtpDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(/^(\+?91)?[6-9]\d{9}$/, { message: 'mobile must be 10 digits' })
  mobile: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;

  @ApiPropertyOptional({ enum: ['LOGIN', 'ONBOARDING'], default: 'LOGIN' })
  @IsOptional()
  @IsIn(['LOGIN', 'ONBOARDING'])
  purpose?: 'LOGIN' | 'ONBOARDING';
}
