import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccessTokenPayload, AuthTokens, UserRole, refreshTokenPayloadSchema } from '@asset/shared';
import { AppConfig } from '../../config/config.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InvalidRefreshTokenError } from '../../common/errors';

interface IssueContext {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

/**
 * Issues and rotates the token pair. Refresh tokens are stored only as a
 * SHA-256 digest: a leaked database dump must not yield usable sessions.
 * argon2 is not used here — these are high-entropy random values, not
 * user-chosen passwords, so a fast digest is the right tool.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  async issuePair(
    user: { id: string; email: string; role: UserRole },
    context: IssueContext = {},
  ): Promise<AuthTokens> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_TTL'),
    });

    const jti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti },
      {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_TTL'),
      },
    );

    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: this.refreshExpiryFrom(refreshToken),
        userAgent: context.userAgent ?? null,
        ipAddress: context.ipAddress ?? null,
      },
    });

    return { accessToken, refreshToken, expiresIn: this.accessTtlSeconds() };
  }

  /**
   * Verifies a refresh token and returns the user it belongs to, revoking the
   * presented token. Replay of an already-rotated token revokes every live
   * token for that user — the only safe response to a token that has been in
   * two places at once.
   */
  async rotate(
    presented: string,
    context: IssueContext = {},
  ): Promise<{ tokens: AuthTokens; userId: string }> {
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync(presented, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new InvalidRefreshTokenError();
    }

    const claims = refreshTokenPayloadSchema.safeParse(payload);
    if (!claims.success) throw new InvalidRefreshTokenError();

    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: claims.data.jti },
      include: { user: { select: { id: true, email: true, role: true, isActive: true } } },
    });

    if (!stored || stored.tokenHash !== hashToken(presented)) {
      throw new InvalidRefreshTokenError();
    }

    if (stored.revokedAt) {
      await this.revokeAllForUser(stored.userId);
      throw new InvalidRefreshTokenError(
        'This refresh token was already used. All sessions have been signed out.',
      );
    }

    if (stored.expiresAt.getTime() <= Date.now()) throw new InvalidRefreshTokenError();
    if (!stored.user.isActive) throw new InvalidRefreshTokenError('This account is not active');

    const tokens = await this.issuePair(stored.user, context);
    const newJti = await this.jtiOf(tokens.refreshToken);

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedBy: newJti },
    });

    return { tokens, userId: stored.userId };
  }

  async revoke(presented: string): Promise<void> {
    const jti = await this.jtiOf(presented).catch(() => null);
    if (!jti) return;
    // updateMany, not update: signing out twice must not 404.
    await this.prisma.refreshToken.updateMany({
      where: { id: jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Housekeeping for the nightly job: drop tokens no one can use any more. */
  async purgeExpired(before: Date = new Date()): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: before } },
    });
    return result.count;
  }

  private accessTtlSeconds(): number {
    return parseDuration(this.config.get('JWT_ACCESS_TTL'));
  }

  private refreshExpiryFrom(token: string): Date {
    const decoded = this.jwt.decode(token) as { exp?: number } | null;
    if (decoded?.exp) return new Date(decoded.exp * 1000);
    return new Date(Date.now() + parseDuration(this.config.get('JWT_REFRESH_TTL')) * 1000);
  }

  private async jtiOf(token: string): Promise<string> {
    const decoded = this.jwt.decode(token) as { jti?: string } | null;
    if (!decoded?.jti) throw new InvalidRefreshTokenError();
    return decoded.jti;
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** `15m`, `7d`, `3600` -> seconds. */
export function parseDuration(value: string): number {
  const match = /^(\d+)\s*([smhd]?)$/.exec(value.trim());
  if (!match) throw new Error(`Unsupported duration: ${value}`);
  const amount = Number(match[1]);
  switch (match[2]) {
    case 'd':
      return amount * 86400;
    case 'h':
      return amount * 3600;
    case 'm':
      return amount * 60;
    default:
      return amount;
  }
}
