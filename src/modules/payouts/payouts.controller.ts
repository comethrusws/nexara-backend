import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { UserRole } from '../auth/auth.constants';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import { BeneficiariesService } from '../beneficiaries/beneficiaries.service';
import { CreatePayoutDto } from './dto/payout.dto';
import { PayoutsService } from './payouts.service';

@Controller('ops/payouts')
@Roles(UserRole.ADMIN, UserRole.OPS)
@ApiTags('Ops — Payouts')
@ApiBearerAuth('JWT')
export class PayoutsController {
  constructor(
    private readonly payouts: PayoutsService,
    private readonly beneficiaries: BeneficiariesService,
  ) {}

  @Post()
  async create(@Body() body: CreatePayoutDto) {
    const beneficiary = body.beneficiaryId
      ? await this.beneficiaries.requireForPayout(
          body.merchantId,
          body.beneficiaryId,
        )
      : body.beneficiary;
    if (!beneficiary) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'beneficiary or beneficiaryId is required',
      );
    }
    return this.payouts.create({
      merchantId: body.merchantId,
      merchantReference: body.merchantReference,
      amount: body.amount,
      beneficiary,
    });
  }

  @Get()
  list(
    @Query('merchantId') merchantId?: string,
    @Query('status') status?: string,
  ) {
    return this.payouts.list({
      merchantId,
      status: status && status !== 'ALL' ? status : undefined,
    });
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
