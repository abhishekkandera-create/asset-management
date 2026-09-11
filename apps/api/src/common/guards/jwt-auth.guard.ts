import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthUser, ErrorCode, accessTokenPayloadSchema } from '@asset/shared';
import { AppConfig } from '../../config/config.module';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { RequestWithUser } from '../decorators/current-user.decorator';

/**
 * Verifies the access token and loads the user. The database lookup on every
 * request is deliberate: a deactivated account must lose access immediately,
 * not fifteen minutes later when its token expires.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException({
        error: { code: ErrorCode.UNAUTHENTICATED, message: 'Authentication is required' },
      });
    }

    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync(token, { secret: this.config.get('JWT_ACCESS_SECRET') });
    } catch {
      throw new UnauthorizedException({
        error: { code: ErrorCode.UNAUTHENTICATED, message: 'Access token is invalid or expired' },
      });
    }

    const claims = accessTokenPayloadSchema.safeParse(payload);
    if (!claims.success) {
      throw new UnauthorizedException({
        error: { code: ErrorCode.UNAUTHENTICATED, message: 'Access token payload is malformed' },
      });
    }

    const user = await this.prisma.appUser.findUnique({
      where: { id: claims.data.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        error: { code: ErrorCode.USER_INACTIVE, message: 'This account is no longer active' },
      });
    }

    request.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    } satisfies AuthUser;

    return true;
  }
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!scheme || !value) return null;
  return scheme.toLowerCase() === 'bearer' ? value.trim() : null;
}
