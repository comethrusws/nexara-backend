export const UserRole = {
  ADMIN: 'ADMIN',
  OPS: 'OPS',
  SUPER_DISTRIBUTOR: 'SUPER_DISTRIBUTOR',
  DISTRIBUTOR: 'DISTRIBUTOR',
  MERCHANT: 'MERCHANT',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Inactivity window: guarded requests older than this go 401. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;
/** Absolute session lifetime regardless of activity (forces daily re-login). */
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
/** lastSeenAt write throttle — at most one session write per window. */
export const SESSION_TOUCH_MS = 5 * 60 * 1000;

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  merchantId: string | null;
  organizationId: string | null;
  /** Server session id from the access token (`sid` claim). */
  sid?: string;
};
