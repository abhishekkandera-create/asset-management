import { SetMetadata } from '@nestjs/common';
import { type UserRole } from '@asset/shared';

export const ROLES_KEY = 'requiredRole';

/**
 * Minimum role required. Roles are ranked, so `@Roles(STORE_KEEPER)` admits
 * ADMIN too (CLAUDE.md §7.10).
 */
export const Roles = (role: UserRole): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, role);
