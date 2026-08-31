import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import { UserRole } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.constants';
import { Roles } from '../auth/decorators/roles.decorator';
import { UsersService } from '../auth/users.service';
import { BbpsService } from './bbps.service';
import { BbpsPayDto } from '../portal/dto/portal.dto';

@Controller('me/bill-payments')
@Roles(UserRole.MERCHANT)
@ApiTags('Merchant — BBPS')
@ApiBearerAuth('JWT')
export class BbpsController {
  constructor(
    private readonly bbps: BbpsService,
    private readonly users: UsersService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List bill payments or fetch billers / bill details',
    description:
      'Use action=billers for catalog, action=fetchBill with billerId and consumerNumber, or omit action for payment history.',
  })
  @ApiQuery({ name: 'action', required: false, enum: ['billers', 'fetchBill'] })
  @ApiQuery({ name: 'billerId', required: false })
  @ApiQuery({ name: 'consumerNumber', required: false })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('action') action?: string,
    @Query('billerId') billerId?: string,
    @Query('consumerNumber') consumerNumber?: string,
  ) {
    if (action === 'billers') {
      return this.bbps.listBillers();
    }
    if (action === 'fetchBill') {
      if (!billerId || !consumerNumber) {
        throw new NexaraError(
          ErrorCodes.INVALID_REQUEST,
          'billerId and consumerNumber are required',
        );
      }
      return this.bbps.fetchBill(billerId, consumerNumber);
    }
    const merchantId = user.merchantId;
    if (!merchantId) {
      throw new NexaraError(ErrorCodes.FORBIDDEN, 'No merchant context', 403);
    }
    return this.bbps.listForMerchant(merchantId);
  }

  @Post()
  @ApiOperation({
    summary: 'Pay a bill',
    description: 'Mock BBPS payment; requires merchant MPIN.',
  })
  @ApiResponse({ status: 401, description: 'MPIN_INVALID' })
  async pay(@CurrentUser() user: AuthUser, @Body() body: BbpsPayDto) {
    const merchantId = user.merchantId;
    if (!merchantId) {
      throw new NexaraError(ErrorCodes.FORBIDDEN, 'No merchant context', 403);
    }
    await this.users.verifyMpinForMerchant(merchantId, body.mpin);
    return this.bbps.pay({
      merchantId,
      billerId: body.billerId,
      consumerNumber: body.consumerNumber,
      amount: body.amount,
    });
  }
}
