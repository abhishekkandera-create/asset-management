import { type INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '@asset/shared';
import { type PrismaService } from '../../src/common/prisma/prisma.service';
import { createTestApp, createUser } from '../support/test-app';

describe('auth (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.truncateAll();
  });

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });

  describe('POST /auth/login', () => {
    it('returns a token pair and the user for correct credentials', async () => {
      const user = await createUser(prisma, { role: UserRole.STORE_KEEPER });

      const response = await login(user.email, user.password).expect(200);

      expect(response.body.accessToken).toBeTypeOf('string');
      expect(response.body.refreshToken).toBeTypeOf('string');
      expect(response.body.expiresIn).toBe(900);
      expect(response.body.user).toMatchObject({
        id: user.id,
        email: user.email,
        role: UserRole.STORE_KEEPER,
      });
      // The password hash must never ride along in a response.
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it('records the sign-in time', async () => {
      const user = await createUser(prisma);
      await login(user.email, user.password).expect(200);

      const stored = await prisma.appUser.findUniqueOrThrow({ where: { id: user.id } });
      expect(stored.lastLoginAt).not.toBeNull();
    });

    it('rejects a wrong password with INVALID_CREDENTIALS', async () => {
      const user = await createUser(prisma);
      const response = await login(user.email, 'wrong-password').expect(401);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    });

    it('gives an unknown email the same answer as a wrong password', async () => {
      const response = await login('nobody@example.com', 'whatever').expect(401);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
      expect(response.body.error.message).toBe('Email or password is incorrect');
    });

    it('refuses a deactivated account', async () => {
      const user = await createUser(prisma, { isActive: false });
      const response = await login(user.email, user.password).expect(403);
      expect(response.body.error.code).toBe(ErrorCode.USER_INACTIVE);
    });

    it('is case-insensitive about the email', async () => {
      const user = await createUser(prisma, { email: 'casing@example.com' });
      await login('CASING@example.com', user.password).expect(200);
    });

    it('returns the validation envelope for a malformed body', async () => {
      const response = await login('not-an-email', '').expect(400);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'email' })]),
      );
    });
  });

  describe('GET /auth/me', () => {
    it('requires a token', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
      expect(response.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
    });

    it('rejects a token that is not a real JWT', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not.a.jwt')
        .expect(401);
    });

    it('returns the signed-in user', async () => {
      const user = await createUser(prisma);
      const { body } = await login(user.email, user.password).expect(200);

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({ id: user.id, email: user.email });
    });

    it('stops accepting a valid token once the account is deactivated', async () => {
      const user = await createUser(prisma);
      const { body } = await login(user.email, user.password).expect(200);

      await prisma.appUser.update({ where: { id: user.id }, data: { isActive: false } });

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(401);
      expect(response.body.error.code).toBe(ErrorCode.USER_INACTIVE);
    });
  });

  describe('POST /auth/refresh', () => {
    it('exchanges a refresh token for a new pair', async () => {
      const user = await createUser(prisma);
      const { body: first } = await login(user.email, user.password).expect(200);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);

      expect(response.body.refreshToken).not.toBe(first.refreshToken);
      expect(response.body.user.id).toBe(user.id);
    });

    it('revokes every session when a rotated token is replayed', async () => {
      const user = await createUser(prisma);
      const { body: first } = await login(user.email, user.password).expect(200);

      const { body: second } = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);

      // Replaying the old token is the signature of a stolen token, so the
      // safe response is to invalidate the whole chain.
      const replay = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(401);
      expect(replay.body.error.code).toBe(ErrorCode.INVALID_REFRESH_TOKEN);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: second.refreshToken })
        .expect(401);
    });

    it('rejects a refresh token signed with the access secret', async () => {
      const user = await createUser(prisma);
      const { body } = await login(user.email, user.password).expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: body.accessToken })
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the refresh token', async () => {
      const user = await createUser(prisma);
      const { body } = await login(user.email, user.password).expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: body.refreshToken })
        .expect(204);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: body.refreshToken })
        .expect(401);
    });

    it('is idempotent — signing out twice is not an error', async () => {
      const user = await createUser(prisma);
      const { body } = await login(user.email, user.password).expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: body.refreshToken })
        .expect(204);
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: body.refreshToken })
        .expect(204);
    });
  });

  describe('POST /auth/change-password', () => {
    it('changes the password and signs out every session', async () => {
      const user = await createUser(prisma);
      const { body } = await login(user.email, user.password).expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .send({ currentPassword: user.password, newPassword: 'Br4ndNewPassword' })
        .expect(204);

      await login(user.email, user.password).expect(401);
      await login(user.email, 'Br4ndNewPassword').expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: body.refreshToken })
        .expect(401);
    });

    it('refuses when the current password is wrong', async () => {
      const user = await createUser(prisma);
      const { body } = await login(user.email, user.password).expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .send({ currentPassword: 'not-it', newPassword: 'Br4ndNewPassword' })
        .expect(401);
    });

    it('rejects a new password that is too weak', async () => {
      const user = await createUser(prisma);
      const { body } = await login(user.email, user.password).expect(200);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .send({ currentPassword: user.password, newPassword: 'short' })
        .expect(400);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });
});
