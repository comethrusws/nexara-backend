import { Body, Controller, HttpCode, Post, SetMetadata } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY, type AuthUser } from './auth.constants';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
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

  // Authenticated (class is @Public, so opt back into the guard here).
  // Revokes the current server session — the access token stops working
  // immediately instead of lingering until JWT expiry.
  @SetMetadata(IS_PUBLIC_KEY, false)
  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: AuthUser) {
    if (user.sid) {
      await this.auth.revokeSession(user.sid, user.id);
    }
    return { success: true };
  }
}
