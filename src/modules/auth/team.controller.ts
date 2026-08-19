import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { Roles } from './decorators/roles.decorator';
import { UserRole } from './auth.constants';

@ApiTags('Ops Team')
@Controller('ops/team')
export class TeamController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OPS)
  listTeam() {
    return this.users.listStaffUsers();
  }

  @Post()
  @Roles(UserRole.ADMIN) // ONLY ROOT ADMIN CAN ADD OPERATIONS USERS
  createStaffMember(
    @Body() body: { email: string; name: string; role?: UserRole; password?: string },
  ) {
    return this.users.createStaffUser({
      email: body.email,
      name: body.name,
      role: body.role ?? UserRole.OPS,
      password: body.password,
    });
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN) // ONLY ROOT ADMIN CAN DELETE OPERATIONS USERS
  deleteStaffMember(@Param('id') id: string) {
    return this.users.deleteStaffUser(id);
  }
}
