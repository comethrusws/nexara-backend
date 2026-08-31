import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '../auth/auth.constants';
import { Roles } from '../auth/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

@Controller('ops/dashboard-stats')
@Roles(UserRole.ADMIN, UserRole.OPS)
@ApiTags('Ops — Dashboard')
@ApiBearerAuth('JWT')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Admin dashboard analytics',
    description:
      'Returns GTV, success rates, user stats, and usage analytics for the selected period.',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['day', 'week', 'month', 'year'],
    example: 'year',
  })
  stats(@Query('period') period?: string) {
    return this.dashboard.stats(period ?? 'year');
  }
}
