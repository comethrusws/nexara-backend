import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import type { AuthUser } from '../auth/auth.constants';
import { UserRole } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { BeneficiariesService } from '../beneficiaries/beneficiaries.service';
import { PayoutsService } from '../payouts/payouts.service';
import { FundWalletDto } from '../wallet/dto/funding.dto';
import { WalletService } from '../wallet/wallet.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import {
  CreateBeneficiaryDto,
  CreateWebhookDto,
  MerchantPayoutDto,
} from './dto/portal.dto';

@Controller('me')
@Roles(UserRole.MERCHANT)
@ApiTags('Merchant portal')
@ApiBearerAuth('JWT')
export class PortalController {
  constructor(
    private readonly wallets: WalletService,
    private readonly payouts: PayoutsService,
    private readonly beneficiaries: BeneficiariesService,
    private readonly webhooks: WebhooksService,
  ) {}

  @Get('wallet')
  wallet(@CurrentUser() user: AuthUser) {
    return this.wallets.getWallet(this.merchantId(user));
  }

  @Get('activity')
  activity(@CurrentUser() user: AuthUser) {
    return this.wallets.getActivity(this.merchantId(user));
  }

  @Post('funding')
  fund(@CurrentUser() user: AuthUser, @Body() body: FundWalletDto) {
    return this.wallets.fund({
      merchantId: this.merchantId(user),
      amount: body.amount,
      channel: body.channel,
      externalRef: body.externalRef,
      notes: body.notes,
      paymentDate: body.paymentDate,
    });
  }

  @Get('payouts')
  listPayouts(@CurrentUser() user: AuthUser) {
    return this.payouts.list({ merchantId: this.merchantId(user) });
  }

  @Post('payouts')
  async createPayout(
    @CurrentUser() user: AuthUser,
    @Body() body: MerchantPayoutDto,
  ) {
    const merchantId = this.merchantId(user);
    const beneficiary = body.beneficiaryId
      ? await this.beneficiaries.requireForPayout(merchantId, body.beneficiaryId)
      : {
          name: body.beneficiaryName ?? '',
          accountNumber: body.accountNumber,
          ifsc: body.ifsc,
          bankName: body.bankName,
          vpa: body.vpa,
          paymentMode: body.paymentMode,
        };
    return this.payouts.create({
      merchantId,
      merchantReference: body.merchantReference,
      amount: body.amount,
      beneficiary,
    });
  }

  @Get('payouts/:id')
  async getPayout(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const payout = await this.payouts.get(id);
    if (payout.merchantId !== this.merchantId(user)) {
      throw new NexaraError(
        ErrorCodes.PAYOUT_NOT_FOUND,
        'Payout was not found',
        404,
      );
    }
    return payout;
  }

  @Get('beneficiaries')
  beneficiariesList(@CurrentUser() user: AuthUser) {
    return this.beneficiaries.list(this.merchantId(user));
  }

  @Post('beneficiaries')
  createBeneficiary(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateBeneficiaryDto,
  ) {
    return this.beneficiaries.create(this.merchantId(user), body);
  }

  @Get('webhooks')
  webhooksList(@CurrentUser() user: AuthUser) {
    return this.webhooks.list(this.merchantId(user));
  }

  @Post('webhooks')
  createWebhook(@CurrentUser() user: AuthUser, @Body() body: CreateWebhookDto) {
    return this.webhooks.create(this.merchantId(user), body.url, body.events);
  }

  @Get('webhooks/deliveries')
  webhookDeliveries(@CurrentUser() user: AuthUser) {
    return this.webhooks.listDeliveries(this.merchantId(user));
  }

  private merchantId(user: AuthUser): string {
    if (!user.merchantId) {
      throw new NexaraError(
        ErrorCodes.FORBIDDEN,
        'This account is not linked to a merchant',
        403,
      );
    }
    return user.merchantId;
  }
}
