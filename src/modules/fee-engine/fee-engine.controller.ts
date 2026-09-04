import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.constants';
import { UpdatePlatformFeeConfigDto } from './dto/fee-config.dto';
import { FeeEngineService } from './fee-engine.service';

@Controller('ops/fee-config')
@Roles(UserRole.ADMIN, UserRole.OPS)
@ApiTags('Ops — Fee Engine')
@ApiBearerAuth('JWT')
export class FeeEngineController {
  constructor(private readonly feeEngine: FeeEngineService) {}

  @Get()
  @ApiOperation({ summary: 'Get platform fee slabs and commission rates' })
  get() {
    return this.feeEngine.getConfig();
  }

  @Put()
  @ApiOperation({ summary: 'Update platform fee slabs and commission rates' })
  update(
    @Body() body: UpdatePlatformFeeConfigDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.feeEngine.updateConfig(body, user.email);
  }
}
