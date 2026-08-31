import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { In, Repository } from 'typeorm';
import { ErrorCodes, NexaraError } from '../../common/errors/nexara-error';
import { MerchantWebhook } from './entities/merchant-webhook.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';

const DEFAULT_EVENTS = [
  'payout.success',
  'payout.failed',
  'payout.unknown',
  'wallet.funded',
];

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(MerchantWebhook)
    private readonly hooks: Repository<MerchantWebhook>,
    @InjectRepository(WebhookDelivery)
    private readonly deliveries: Repository<WebhookDelivery>,
  ) {}

  async create(merchantId: string, url: string, events?: string[]) {
    if (!url.startsWith('https://') && !url.startsWith('http://localhost')) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'Webhook URL must be https (or localhost for development)',
      );
    }
    const saved = await this.hooks.save(
      this.hooks.create({
        merchantId,
        url,
        events: (events?.length ? events : DEFAULT_EVENTS).join(','),
        secret: `whsec_${randomBytes(16).toString('hex')}`,
        status: 'ACTIVE',
        lastDeliveryAt: null,
      }),
    );
    return this.toView(saved);
  }

  async list(merchantId: string) {
    const rows = await this.hooks.find({
      where: { merchantId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toView(row));
  }

  async listDeliveries(merchantId: string) {
    const hooks = await this.hooks.find({ where: { merchantId } });
    if (hooks.length === 0) {
      return [];
    }
    const ids = hooks.map((hook) => hook.id);
    const rows = await this.deliveries.find({
      where: { webhookId: In(ids) },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return rows.map((row) => this.toDeliveryView(row));
  }

  async listAll() {
    const rows = await this.hooks.find({ order: { createdAt: 'DESC' }, take: 200 });
    return rows.map((row) => this.toView(row));
  }

  async listAllDeliveries() {
    const rows = await this.deliveries.find({
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return rows.map((row) => this.toDeliveryView(row));
  }

  async sendTest(webhookId: string) {
    const hook = await this.hooks.findOne({ where: { id: webhookId } });
    if (!hook) {
      throw new NexaraError(
        ErrorCodes.WEBHOOK_NOT_FOUND,
        'Webhook was not found',
        404,
      );
    }
    const payload = {
      id: 'test_payout_01',
      merchantReference: 'TEST-REF',
      amount: '100.00',
      status: 'SUCCESS',
    };
    await this.emit(hook.merchantId, 'payout.success', payload);
    return { success: true, message: 'Test webhook dispatched' };
  }

  async emit(
    merchantId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const hooks = await this.hooks.find({ where: { merchantId } });
    for (const hook of hooks) {
      const subscribed = hook.events.split(',').map((item) => item.trim());
      if (!subscribed.includes(event) && !subscribed.includes('*')) {
        continue;
      }
      const summary = `${event} ${String(payload.id ?? payload.merchantReference ?? '')}`.trim();
      try {
        const response = await fetch(hook.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-nexara-event': event,
            'x-nexara-signature': hook.secret,
          },
          body: JSON.stringify({ event, data: payload }),
          signal: AbortSignal.timeout(4000),
        });
        hook.lastDeliveryAt = new Date();
        hook.status = response.ok ? 'ACTIVE' : 'FAILING';
        await this.hooks.save(hook);
        await this.deliveries.save(
          this.deliveries.create({
            webhookId: hook.id,
            event,
            payloadSummary: summary.slice(0, 255),
            statusCode: response.status,
            attempts: 1,
            status: response.ok ? 'SUCCESS' : 'FAILED',
          }),
        );
      } catch (error) {
        this.logger.warn(
          `Webhook ${hook.id} failed: ${error instanceof Error ? error.message : 'error'}`,
        );
        hook.status = 'FAILING';
        await this.hooks.save(hook);
        await this.deliveries.save(
          this.deliveries.create({
            webhookId: hook.id,
            event,
            payloadSummary: summary.slice(0, 255),
            statusCode: null,
            attempts: 1,
            status: 'FAILED',
          }),
        );
      }
    }
  }

  private toView(hook: MerchantWebhook) {
    return {
      id: hook.id,
      merchantId: hook.merchantId,
      url: hook.url,
      events: hook.events.split(','),
      secret: hook.secret,
      status: hook.status,
      createdAt: hook.createdAt,
      lastDeliveryAt: hook.lastDeliveryAt,
    };
  }

  private toDeliveryView(row: WebhookDelivery) {
    return {
      id: row.id,
      webhookId: row.webhookId,
      event: row.event,
      payloadSummary: row.payloadSummary,
      statusCode: row.statusCode ?? 0,
      timestamp: row.createdAt,
      attempts: row.attempts,
      status: row.status,
    };
  }
}
