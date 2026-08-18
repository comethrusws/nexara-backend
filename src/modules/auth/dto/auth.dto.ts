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
  @Matches(/^\d{10}$/, { message: 'mobile must be 10 digits' })
  mobile: string;
}

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\d{10}$/, { message: 'mobile must be 10 digits' })
  mobile: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;
}
