import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthUser, ChangePasswordRequest, LoginRequest, LoginResponse } from '@asset/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  InvalidCredentialsError,
  RecordNotFoundError,
  UserInactiveError,
} from '../../common/errors';
import { TokenService } from './token.service';

export interface RequestContext {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

/**
 * argon2id with parameters sized for an internal tool: ~64MB and 3 passes is
 * comfortably above the OWASP floor and still fast enough for a login form.
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  static hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTIONS);
  }

  async login(input: LoginRequest, context: RequestContext = {}): Promise<LoginResponse> {
    const user = await this.prisma.appUser.findUnique({ where: { email: input.email } });

    // Verify against a dummy hash when the user is absent, so a missing
    // account and a wrong password take the same time to answer.
    if (!user) {
      await argon2.verify(DUMMY_HASH, input.password).catch(() => false);
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await argon2
      .verify(user.passwordHash, input.password)
      .catch(() => false);
    if (!passwordMatches) throw new InvalidCredentialsError();
    if (!user.isActive) throw new UserInactiveError();

    const tokens = await this.tokens.issuePair(user, context);

    const updated = await this.prisma.appUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log({ userId: user.id, role: user.role }, 'User signed in');

    return { ...tokens, user: toAuthUser(updated) };
  }

  async refresh(refreshToken: string, context: RequestContext = {}): Promise<LoginResponse> {
    const { tokens, userId } = await this.tokens.rotate(refreshToken, context);
    const user = await this.prisma.appUser.findUniqueOrThrow({ where: { id: userId } });
    return { ...tokens, user: toAuthUser(user) };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revoke(refreshToken);
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!user) throw new RecordNotFoundError('User', userId);
    return toAuthUser(user);
  }

  /** Changing a password signs out every other session. */
  async changePassword(userId: string, input: ChangePasswordRequest): Promise<void> {
    const user = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!user) throw new RecordNotFoundError('User', userId);

    const matches = await argon2
      .verify(user.passwordHash, input.currentPassword)
      .catch(() => false);
    if (!matches) throw new InvalidCredentialsError();

    await this.prisma.appUser.update({
      where: { id: userId },
      data: { passwordHash: await AuthService.hashPassword(input.newPassword) },
    });
    await this.tokens.revokeAllForUser(userId);

    this.logger.log({ userId }, 'Password changed; all sessions revoked');
  }
}

function toAuthUser(user: {
  id: string;
  email: string;
  fullName: string;
  role: AuthUser['role'];
  isActive: boolean;
  lastLoginAt: Date | null;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}

/**
 * A real argon2id digest of a throwaway value. Only ever used to burn the same
 * CPU time as a genuine verification when the email does not exist.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZS1zYWx0LXZhbHVlcw$JYRFfqEXWgvyKAXHjb8oqQFAt7fsvkKKxKaGiqScMSA';
