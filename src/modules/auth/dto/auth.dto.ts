import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RequestOtpDto {
  @IsString()
  @Matches(/^(\+?91)?[6-9]\d{9}$/, { message: 'mobile must be 10 digits' })
  mobile: string;
}

export class VerifyOtpDto {
  @IsString()
  @Matches(/^(\+?91)?[6-9]\d{9}$/, { message: 'mobile must be 10 digits' })
  mobile: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;
}
