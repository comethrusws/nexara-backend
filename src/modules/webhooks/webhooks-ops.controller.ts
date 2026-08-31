import { Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '../auth/auth.constants';
import { Roles } from '../auth/decorators/roles.decorator';
import { WebhooksService } from './webhooks.service';

@Controller('ops/webhooks')
@Roles(UserRole.ADMIN, UserRole.OPS)
@ApiTags('Ops — Webhooks')
@ApiBearerAuth('JWT')
export class WebhooksOpsController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  @ApiOperation({ summary: 'List all merchant webhooks' })
  listAll() {
    return this.webhooks.listAll();
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'Delivery log across all merchants' })
  listAllDeliveries() {
    return this.webhooks.listAllDeliveries();
  }
}

@Controller('me/webhooks')
@Roles(UserRole.MERCHANT)
@ApiTags('Merchant portal')
@ApiBearerAuth('JWT')
export class WebhooksMerchantController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post(':id/test')
  @ApiOperation({ summary: 'Send test webhook ping' })
  @ApiParam({ name: 'id', format: 'uuid' })
  test(@Param('id') id: string) {
    return this.webhooks.sendTest(id);
  }
}
