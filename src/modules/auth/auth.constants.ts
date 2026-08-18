export const UserRole = {
  ADMIN: 'ADMIN',
  OPS: 'OPS',
  MERCHANT: 'MERCHANT',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  merchantId: string | null;
  organizationId: string | null;
};
