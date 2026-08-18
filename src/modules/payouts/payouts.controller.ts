import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { UserRole } from '../auth/auth.constants';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreatePayoutDto } from './dto/payout.dto';
import { PayoutsService } from './payouts.service';

@Controller('ops/payouts')
@Roles(UserRole.ADMIN, UserRole.OPS)
@ApiTags('Ops — Payouts')
@ApiBearerAuth('JWT')
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Post()
  create(@Body() body: CreatePayoutDto) {
    return this.payouts.create(body);
  }

  @Get()
  list(
    @Query('merchantId') merchantId?: string,
    @Query('status') status?: string,
  ) {
    return this.payouts.list({ merchantId, status });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.payouts.get(id);
  }

  @Post(':id/enquire')
  enquire(@Param('id') id: string) {
    return this.payouts.enquire(id);
  }
}
