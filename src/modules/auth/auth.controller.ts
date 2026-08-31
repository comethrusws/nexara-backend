import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto, RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';

@Public()
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Post('otp/request')
  requestOtp(@Body() body: RequestOtpDto) {
    return this.auth.requestOtp(body.mobile, body.purpose ?? 'LOGIN');
  }

  @Post('otp/verify')
  verifyOtp(@Body() body: VerifyOtpDto) {
    return this.auth.verifyOtp(
      body.mobile,
      body.code,
      body.purpose ?? 'LOGIN',
    );
  }
}
