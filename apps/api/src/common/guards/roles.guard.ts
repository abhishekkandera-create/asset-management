import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, UserRole, roleAtLeast } from '@asset/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { RequestWithUser } from '../decorators/current-user.decorator';

/**
 * Enforces the minimum role from `@Roles()`. Undecorated endpoints are
 * readable by any authenticated user, which makes VIEWER read-only by default
 * (CLAUDE.md §7.10).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) return false;

    if (!roleAtLeast(user.role, required)) {
      throw new ForbiddenException({
        error: {
          code: ErrorCode.FORBIDDEN,
          message: `This action requires the ${required} role`,
          details: { requiredRole: required, actualRole: user.role },
        },
      });
    }
    return true;
  }
}
