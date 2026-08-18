import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateOrganizationDto,
  SetBankDto,
  SetDefaultBankDto,
  SetFeaturesDto,
  SetOrganizationStatusDto,
  UpdateBankConnectorDto,
} from './dto/organization.dto';
import { OrganizationType } from './organization.constants';
import { OrganizationsService } from './organizations.service';
import { UserRole } from '../auth/auth.constants';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@Controller('ops')
@Roles(UserRole.ADMIN, UserRole.OPS)
@ApiTags('Ops — Organizations & banks')
@ApiBearerAuth('JWT')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get('catalog')
  catalog() {
    return this.organizations.catalog();
  }

  @Get('banks')
  listBanks() {
    return this.organizations.listBanks();
  }

  @Put('banks/default')
  setDefaultBank(@Body() body: SetDefaultBankDto) {
    return this.organizations.setDefaultBank(body.bankCode);
  }

  @Put('banks/:code')
  setBankEnabled(
    @Param('code') code: string,
    @Body() body: UpdateBankConnectorDto,
  ) {
    return this.organizations.setBankEnabled(code.toUpperCase(), body.enabled);
  }

  @Post('organizations')
  create(@Body() body: CreateOrganizationDto) {
    return this.organizations.create(body);
  }

  @Get('organizations')
  list(
    @Query('parentId') parentId?: string,
    @Query('type') type?: OrganizationType,
  ) {
    return this.organizations.list({ parentId, type });
  }

  @Get('organizations/:id')
  get(@Param('id') id: string) {
    return this.organizations.get(id);
  }

  @Get('organizations/:id/children')
  children(@Param('id') id: string) {
    return this.organizations.children(id);
  }

  @Put('organizations/:id/features')
  setFeatures(@Param('id') id: string, @Body() body: SetFeaturesDto) {
    return this.organizations.setFeatures(id, body);
  }

  @Put('organizations/:id/bank')
  setBank(@Param('id') id: string, @Body() body: SetBankDto) {
    return this.organizations.setBank(id, body.bankCode);
  }

  @Put('organizations/:id/status')
  setStatus(@Param('id') id: string, @Body() body: SetOrganizationStatusDto) {
    return this.organizations.setStatus(id, body.status);
  }
}
