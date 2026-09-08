import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import type { AuthUser } from '../auth/auth.constants';
import { UserRole } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UsersService } from '../auth/users.service';
import { UpdatePendingOnboardingDto } from '../merchants/dto/merchant.dto';
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

  @Patch('onboarding')
  @Roles(UserRole.MERCHANT, UserRole.DISTRIBUTOR, UserRole.SUPER_DISTRIBUTOR)
  @ApiOperation({
    summary: 'Update pending KYC / onboarding submission',
    description:
      'Allows a logged-in merchant to correct profile, location, or selfie while status is CREATED or KYC_PENDING. Mobile, PAN, and Aadhaar are locked.',
  })
  @ApiResponse({ status: 200, description: 'Pending onboarding updated' })
  @ApiResponse({
    status: 409,
    description: 'Merchant is not in an editable KYC state',
  })
  updateOnboarding(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdatePendingOnboardingDto,
  ) {
    if (!user.merchantId) {
      throw new NexaraError(
        ErrorCodes.FORBIDDEN,
        'Only merchant accounts can update onboarding',
        403,
      );
    }
    return this.merchants.updatePendingOnboarding(
      user.merchantId,
      user.id,
      body,
      user.email,
    );
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
