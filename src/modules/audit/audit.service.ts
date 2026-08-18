import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent } from './entities/audit-event.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEvent)
    private readonly events: Repository<AuditEvent>,
  ) {}

  async record(input: {
    actorEmail: string;
    actorRole: string;
    action: string;
    merchantId?: string | null;
    reference?: string | null;
    details: string;
    previousValue?: unknown;
    newValue?: unknown;
  }): Promise<void> {
    await this.events.save(
      this.events.create({
        actorEmail: input.actorEmail,
        actorRole: input.actorRole,
        action: input.action,
        merchantId: input.merchantId ?? null,
        reference: input.reference ?? null,
        details: input.details,
        previousValue: input.previousValue
          ? JSON.stringify(input.previousValue)
          : null,
        newValue: input.newValue ? JSON.stringify(input.newValue) : null,
      }),
    );
  }

  async list(filters?: { action?: string; search?: string }) {
    const qb = this.events.createQueryBuilder('event').orderBy('event.createdAt', 'DESC');
    if (filters?.action) {
      qb.andWhere('event.action = :action', { action: filters.action });
    }
    if (filters?.search) {
      qb.andWhere(
        '(event.actorEmail ILIKE :q OR event.details ILIKE :q OR event.reference ILIKE :q)',
        { q: `%${filters.search}%` },
      );
    }
    return qb.take(200).getMany();
  }
}
