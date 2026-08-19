import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import type { AuthUser } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MerchantsService } from '../merchants/merchants.service';
import { NotificationsService } from '../notifications/notifications.service';

@Controller('me')
@ApiTags('Session')
@ApiBearerAuth('JWT')
export class SessionController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    if (!user.merchantId) {
      return { user, merchant: null };
    }
    return {
      user,
      merchant: await this.merchants.get(user.merchantId),
    };
  }

  @Get('notifications')
  listNotifications(@CurrentUser() user: AuthUser) {
    return this.notifications.listFor(user);
  }

  @Post('notifications/read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }

  @Post('notifications/:id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }
}
