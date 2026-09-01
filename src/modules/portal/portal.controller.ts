import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import type { AuthUser } from '../auth/auth.constants';
import { UserRole } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UsersService } from '../auth/users.service';
import { BeneficiariesService } from '../beneficiaries/beneficiaries.service';
import { MerchantsService } from '../merchants/merchants.service';
import { PayoutsService } from '../payouts/payouts.service';
import { FundWalletDto } from '../wallet/dto/funding.dto';
import { WalletService } from '../wallet/wallet.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import {
  BeneficiaryOtpDto,
  CreateBeneficiaryDto,
  CreateWebhookDto,
  IfscLookupDto,
  MerchantPayoutDto,
  ResetMpinDto,
  ResetMpinWithPanDto,
  SetMpinDto,
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
    private readonly users: UsersService,
    private readonly merchants: MerchantsService,
  ) {}

  @Get('wallet')
  @ApiOperation({ summary: 'Wallet balances and limits' })
  wallet(@CurrentUser() user: AuthUser) {
    return this.wallets.getWallet(this.merchantId(user));
  }

  @Get('activity')
  @ApiOperation({ summary: 'Wallet activity feed' })
  activity(@CurrentUser() user: AuthUser) {
    return this.wallets.getActivity(this.merchantId(user));
  }

  @Get('statement')
  @ApiOperation({ summary: 'Wallet statement with optional date range' })
  @ApiQuery({ name: 'from', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-01-31' })
  statement(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.wallets.getStatement(this.merchantId(user), { from, to });
  }

  @Post('funding')
  @ApiOperation({ summary: 'Register wallet funding (NEFT / UPI collection)' })
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
  @ApiOperation({ summary: 'List merchant payouts' })
  @ApiQuery({ name: 'status', required: false, example: 'SUCCESS' })
  listPayouts(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
  ) {
    return this.payouts.list({
      merchantId: this.merchantId(user),
      status: status && status !== 'ALL' ? status : undefined,
    });
  }

  @Post('payouts')
  @ApiOperation({
    summary: 'Create payout',
    description: 'Requires a valid 6-digit MPIN set during onboarding.',
  })
  @ApiResponse({ status: 401, description: 'MPIN_INVALID' })
  @ApiResponse({ status: 403, description: 'MPIN_NOT_SET' })
  async createPayout(
    @CurrentUser() user: AuthUser,
    @Body() body: MerchantPayoutDto,
  ) {
    const merchantId = this.merchantId(user);
    await this.users.verifyMpinForMerchant(merchantId, body.mpin);
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
  @ApiOperation({ summary: 'Get payout by ID' })
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

  @Post('payouts/:id/enquire')
  @ApiOperation({ summary: 'Refresh payout status from bank' })
  enquirePayout(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payouts.enquireForMerchant(id, this.merchantId(user));
  }

  @Get('beneficiaries')
  @ApiOperation({ summary: 'List saved beneficiaries' })
  beneficiariesList(@CurrentUser() user: AuthUser) {
    return this.beneficiaries.list(this.merchantId(user));
  }

  @Post('beneficiaries')
  @ApiOperation({ summary: 'Add beneficiary' })
  createBeneficiary(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateBeneficiaryDto,
  ) {
    return this.beneficiaries.create(this.merchantId(user), body);
  }

  @Post('beneficiaries/verify-otp')
  @ApiOperation({
    summary: 'Send or verify OTP for beneficiary mobile',
    description: 'Omit code or set action=send to request OTP.',
  })
  verifyBeneficiaryOtp(@Body() body: BeneficiaryOtpDto) {
    return this.beneficiaries.verifyOtp(body);
  }

  @Post('beneficiaries/ifsc-lookup')
  @ApiOperation({ summary: 'Resolve bank details from IFSC' })
  lookupIfsc(@Body() body: IfscLookupDto) {
    return this.beneficiaries.lookupIfsc(body.ifsc);
  }

  @Post('mpin')
  @ApiOperation({
    summary: 'Set or change transaction PIN',
    description:
      'Use when you know your current PIN. For forgotten PIN, use the reset flow instead.',
  })
  setMpin(@CurrentUser() user: AuthUser, @Body() body: SetMpinDto) {
    return this.users.setMpin(user.id, body.mpin, body.currentMpin);
  }

  @Post('mpin/reset/request')
  @ApiOperation({
    summary: 'Request OTP to reset forgotten transaction PIN',
    description: 'Sends a 6-digit OTP to the merchant registered mobile number.',
  })
  requestMpinReset(@CurrentUser() user: AuthUser) {
    return this.users.requestMpinResetOtp(user.id);
  }

  @Post('mpin/reset')
  @ApiOperation({
    summary: 'Reset transaction PIN with OTP',
    description:
      'Complete reset after `POST /me/mpin/reset/request`. Does not require the old PIN.',
  })
  resetMpin(@CurrentUser() user: AuthUser, @Body() body: ResetMpinDto) {
    return this.users.resetMpinWithOtp(user.id, body.code, body.mpin);
  }

  @Post('mpin/reset-with-pan')
  @ApiOperation({
    summary: 'Reset transaction PIN with registered PAN verification',
  })
  async resetMpinWithPan(
    @CurrentUser() user: AuthUser,
    @Body() body: ResetMpinWithPanDto,
  ) {
    const merchantId = this.merchantId(user);
    const merchant = await this.merchants.get(merchantId);
    const registeredPan = merchant.kyc?.panMasked || null;
    return this.users.resetMpinWithPan(user.id, body.pan, body.mpin, registeredPan);
  }

  @Get('webhooks')
  @ApiOperation({ summary: 'List merchant webhooks' })
  webhooksList(@CurrentUser() user: AuthUser) {
    return this.webhooks.list(this.merchantId(user));
  }

  @Post('webhooks')
  @ApiOperation({ summary: 'Register webhook endpoint' })
  createWebhook(@CurrentUser() user: AuthUser, @Body() body: CreateWebhookDto) {
    return this.webhooks.create(this.merchantId(user), body.url, body.events);
  }

  @Get('webhooks/deliveries')
  @ApiOperation({ summary: 'Webhook delivery log' })
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
