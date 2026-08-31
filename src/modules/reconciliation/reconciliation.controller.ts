import { Body, Controller, Get, Post } from '@nestjs/common';
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
import { ReconciliationResolveDto } from '../portal/dto/portal.dto';
import { ReconciliationService } from './reconciliation.service';

@Controller('ops/reconciliation')
@Roles(UserRole.ADMIN, UserRole.OPS)
@ApiTags('Ops — Reconciliation')
@ApiBearerAuth('JWT')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get()
  @ApiOperation({ summary: 'List reconciliation items' })
  list() {
    return this.reconciliation.list();
  }

  @Post()
  @ApiOperation({ summary: 'Resolve a reconciliation item' })
  @ApiResponse({ status: 400, description: 'payoutId is required' })
  resolve(
    @Body() body: ReconciliationResolveDto,
    @CurrentUser() user: AuthUser,
  ) {
    const payoutId =
      body.payoutId ?? body.itemId?.replace(/^rec_/, '') ?? body.itemId;
    if (!payoutId) {
      throw new NexaraError(
        ErrorCodes.INVALID_REQUEST,
        'payoutId is required',
        400,
      );
    }
    return this.reconciliation.resolve({
      payoutId,
      action: body.action,
      notes: body.notes,
      actorEmail: user.email,
    });
  }
}
