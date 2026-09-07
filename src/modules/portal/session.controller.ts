import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import type { AuthUser } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from '../auth/users.service';
import { ProvisionDownlineDto } from '../merchants/dto/merchant.dto';
import { MerchantsService } from '../merchants/merchants.service';
import { NotificationsService } from '../notifications/notifications.service';

@Controller('me')
@ApiTags('Session')
@ApiBearerAuth('JWT')
export class SessionController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Current user and merchant profile' })
  async me(@CurrentUser() user: AuthUser) {
    if (!user.merchantId) {
      return { user, merchant: null, hasMpin: false };
    }
    const merchantUser = await this.users.findMerchantUser(user.merchantId);
    return {
      user,
      merchant: await this.merchants.get(user.merchantId),
      hasMpin: Boolean(merchantUser?.mpinHash),
    };
  }

  @Get('downline')
  @ApiOperation({
    summary: 'Distributor downline network with activation status',
    description:
      'Read-only view of merchants below the caller’s organization. No KYC or activation powers are exposed here.',
  })
  async downline(@CurrentUser() user: AuthUser) {
    if (!user.merchantId) {
      throw new NexaraError(
        ErrorCodes.UNAUTHORIZED,
        'No merchant linked to this session',
        401,
      );
    }
    return this.merchants.getDownline(user.merchantId);
  }

  @Post('provision')
  @ApiOperation({
    summary: 'Provision a mobile number inside the caller’s downline',
    description:
      'Creates a CREATED merchant under an organization in the caller’s network. Approval and wallet activation stay ADMIN-only.',
  })
  async provisionDownline(
    @CurrentUser() user: AuthUser,
    @Body() body: ProvisionDownlineDto,
  ) {
    if (!user.merchantId) {
      throw new NexaraError(
        ErrorCodes.UNAUTHORIZED,
        'No merchant linked to this session',
        401,
      );
    }
    return this.merchants.provisionDownline(user.merchantId, body, user.email);
  }

  @Get('notifications')
  @ApiOperation({ summary: 'In-app notifications for current user' })
  listNotifications(@CurrentUser() user: AuthUser) {
    return this.notifications.listFor(user);
  }

  @Post('notifications/read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }

  @Post('notifications/:id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }
}
