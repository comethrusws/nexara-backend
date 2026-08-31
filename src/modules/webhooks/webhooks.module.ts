import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantWebhook } from './entities/merchant-webhook.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import {
  WebhooksMerchantController,
  WebhooksOpsController,
} from './webhooks-ops.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [TypeOrmModule.forFeature([MerchantWebhook, WebhookDelivery])],
  controllers: [WebhooksOpsController, WebhooksMerchantController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
