import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import { type AuthUser } from '@asset/shared';

export interface RequestWithUser extends Request {
  user?: AuthUser;
}

/**
 * The authenticated app user, attached by JwtAuthGuard. Every mutation records
 * this id in `performed_by` / `created_by` so the audit trail always names an
 * actor.
 */
export const CurrentUser = createParamDecorator(
  (
    field: keyof AuthUser | undefined,
    ctx: ExecutionContext,
  ): AuthUser | AuthUser[keyof AuthUser] => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) {
      // Unreachable behind JwtAuthGuard; a loud throw beats a silent undefined.
      throw new Error('CurrentUser used on a route that is not behind JwtAuthGuard');
    }
    return field ? user[field] : user;
  },
);
