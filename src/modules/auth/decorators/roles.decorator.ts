import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY, type UserRole } from '../auth.constants';

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
