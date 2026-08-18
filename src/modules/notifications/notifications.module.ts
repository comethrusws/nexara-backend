import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { NotificationRead } from './entities/notification-read.entity';
import { Notification } from './entities/notification.entity';
import { NotificationsOpsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationRead]),
    AuditModule,
  ],
  controllers: [NotificationsOpsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
