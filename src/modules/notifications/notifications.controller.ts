import { Body, Controller, Get, Post } from '@nestjs/common';
import { UserRole } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.constants';
import { AuditService } from '../audit/audit.service';
import { BroadcastNotificationDto } from '../portal/dto/portal.dto';
import { NotificationsService } from './notifications.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@Controller('ops/notifications')
@Roles(UserRole.ADMIN, UserRole.OPS)
@ApiTags('Ops — Notifications')
@ApiBearerAuth('JWT')
export class NotificationsOpsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list() {
    return this.notifications.listAll();
  }

  @Post('broadcast')
  async broadcast(
    @Body() body: BroadcastNotificationDto,
    @CurrentUser() user: AuthUser,
  ) {
    const note = await this.notifications.broadcast(body);
    await this.audit.record({
      actorEmail: user.email,
      actorRole: user.role,
      action: 'NOTIFICATION_BROADCAST',
      details: `Broadcast to ${body.audience}: ${body.title}`,
    });
    return note;
  }
}
