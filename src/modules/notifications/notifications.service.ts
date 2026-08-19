import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import type { AuthUser } from '../auth/auth.constants';
import { UserRole } from '../auth/auth.constants';
import { NotificationRead } from './entities/notification-read.entity';
import { Notification } from './entities/notification.entity';

export const NotificationAudience = {
  ALL: 'ALL',
  ADMIN: 'ADMIN',
  SUPER_DISTRIBUTOR: 'SUPER_DISTRIBUTOR',
  DISTRIBUTOR: 'DISTRIBUTOR',
  MERCHANT: 'MERCHANT',
} as const;

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notes: Repository<Notification>,
    @InjectRepository(NotificationRead)
    private readonly reads: Repository<NotificationRead>,
  ) {}

  async notifyUser(input: {
    userId?: string | null;
    organizationId?: string | null;
    merchantId?: string | null;
    audience?: string;
    title: string;
    body: string;
    type: string;
  }): Promise<Notification> {
    return this.notes.save(
      this.notes.create({
        title: input.title,
        body: input.body,
        type: input.type,
        audience: input.audience ?? 'USER',
        userId: input.userId ?? null,
        organizationId: input.organizationId ?? null,
        merchantId: input.merchantId ?? null,
      }),
    );
  }

  async broadcast(input: {
    audience: string;
    title: string;
    body: string;
  }): Promise<Notification> {
    const allowed = Object.values(NotificationAudience);
    if (!allowed.includes(input.audience as (typeof allowed)[number])) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'audience must be ALL, ADMIN, SUPER_DISTRIBUTOR, DISTRIBUTOR, or MERCHANT',
      );
    }
    return this.notifyUser({
      audience: input.audience,
      title: input.title,
      body: input.body,
      type: 'BROADCAST',
    });
  }

  async listAll() {
    return this.notes.find({
      order: { createdAt: "DESC" },
      take: 100,
    });
  }

  async listFor(user: AuthUser) {
    const rows = await this.notes.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const visible = rows.filter((row) => this.isVisible(row, user));
    const readRows = await this.reads.find({
      where: {
        userId: user.id,
        notificationId: In(visible.map((row) => row.id).concat('00000000-0000-0000-0000-000000000000')),
      },
    });
    const readIds = new Set(readRows.map((row) => row.notificationId));
    return visible.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      type: row.type,
      audience: row.audience,
      createdAt: row.createdAt,
      read: readIds.has(row.id),
    }));
  }

  async markRead(userId: string, notificationId: string) {
    const note = await this.notes.findOne({ where: { id: notificationId } });
    if (!note) {
      throw new NexaraError(
        ErrorCodes.NOTIFICATION_NOT_FOUND,
        'Notification was not found',
        404,
      );
    }
    const existing = await this.reads.findOne({
      where: { userId, notificationId },
    });
    if (existing) {
      return { read: true };
    }
    await this.reads.save(
      this.reads.create({ userId, notificationId }),
    );
    return { read: true };
  }

  async markAllRead(user: AuthUser) {
    const visible = await this.listFor(user);
    const unread = visible.filter((n) => !n.read);
    for (const n of unread) {
      const existing = await this.reads.findOne({
        where: { userId: user.id, notificationId: n.id },
      });
      if (!existing) {
        await this.reads.save(
          this.reads.create({ userId: user.id, notificationId: n.id }),
        );
      }
    }
    return { success: true, count: unread.length };
  }

  private isVisible(row: Notification, user: AuthUser): boolean {
    if (row.userId && row.userId === user.id) {
      return true;
    }
    if (row.merchantId && row.merchantId === user.merchantId) {
      return true;
    }
    if (row.organizationId && row.organizationId === user.organizationId) {
      return true;
    }
    if (row.audience === NotificationAudience.ALL) {
      return true;
    }
    if (row.audience === NotificationAudience.ADMIN) {
      return user.role === UserRole.ADMIN || user.role === UserRole.OPS;
    }
    if (row.audience === NotificationAudience.MERCHANT) {
      return user.role === UserRole.MERCHANT;
    }
    if (
      row.audience === NotificationAudience.SUPER_DISTRIBUTOR ||
      row.audience === NotificationAudience.DISTRIBUTOR
    ) {
      return user.role === UserRole.ADMIN || user.role === UserRole.OPS;
    }
    return false;
  }
}
