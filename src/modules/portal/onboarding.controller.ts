import { Body, Controller, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { Public } from '../auth/decorators/public.decorator';
import { CreateMerchantDto } from '../merchants/dto/merchant.dto';
import { MerchantsService } from '../merchants/merchants.service';

@Public()
@ApiTags('Onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  async register(@Body() body: CreateMerchantDto) {
    const password =
      body.password ??
      this.config.get<string>('auth.merchantDefaultPassword') ??
      'ChangeMe#2026';
    const merchant = await this.merchants.create({ ...body, password });
    const session = await this.auth.login(body.email, password);
    return { merchant, ...session };
  }
}
