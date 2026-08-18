import { Controller, Get, Query } from '@nestjs/common';
import { UserRole } from '../auth/auth.constants';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@Controller('ops/audit')
@Roles(UserRole.ADMIN, UserRole.OPS)
@ApiTags('Ops — Audit')
@ApiBearerAuth('JWT')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @Query('action') action?: string,
    @Query('search') search?: string,
  ) {
    return this.audit.list({ action, search });
  }
}
