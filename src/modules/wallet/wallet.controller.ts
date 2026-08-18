import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UserRole } from '../auth/auth.constants';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreditWalletDto, OpenWalletDto } from './dto/wallet.dto';
import { FundWalletDto } from './dto/funding.dto';
import { WalletService } from './wallet.service';

@Controller('ops/wallets')
@Roles(UserRole.ADMIN, UserRole.OPS)
@ApiTags('Ops — Wallets')
@ApiBearerAuth('JWT')
export class WalletOpsController {
  constructor(private readonly wallets: WalletService) {}

  @Post()
  openWallet(@Body() body: OpenWalletDto) {
    return this.wallets.openWallet(body);
  }

  @Get()
  list() {
    return this.wallets.listWallets();
  }

  @Get(':merchantId')
  getWallet(@Param('merchantId') merchantId: string) {
    return this.wallets.getWallet(merchantId);
  }

  @Get(':merchantId/activity')
  getActivity(@Param('merchantId') merchantId: string) {
    return this.wallets.getActivity(merchantId);
  }

  @Get(':merchantId/statement')
  getStatement(@Param('merchantId') merchantId: string) {
    return this.wallets.getStatement(merchantId);
  }

  @Post(':merchantId/credits')
  creditWallet(
    @Param('merchantId') merchantId: string,
    @Body() body: CreditWalletDto,
  ) {
    return this.wallets.creditWallet(merchantId, body);
  }

  @Post(':merchantId/funding')
  fund(
    @Param('merchantId') merchantId: string,
    @Body() body: FundWalletDto,
  ) {
    return this.wallets.fund({
      merchantId,
      amount: body.amount,
      channel: body.channel,
      externalRef: body.externalRef,
      notes: body.notes,
      paymentDate: body.paymentDate,
    });
  }
}
