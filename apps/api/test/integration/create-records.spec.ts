import { INestApplication } from '@nestjs/common';
import { AssetEventType, AssetStatus, EmployeeStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '@asset/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { createTestApp, createUser } from '../support/test-app';
import { World, buildWorld, makeEmployee, resetFixtureCounters } from '../support/fixtures';

/**
 * Adding an employee who has just joined, and adding the laptop they will be
 * given. Both are ADMIN-only and both are the entry point to everything else,
 * so a broken one leaves the system unusable on a fresh database.
 */
describe('creating employees and assets (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let world: World;
  let adminToken: string;
  let storeKeeperToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.truncateAll();
    resetFixtureCounters();
    world = await buildWorld(prisma);
    adminToken = await signIn(UserRole.ADMIN);
    storeKeeperToken = await signIn(UserRole.STORE_KEEPER);
  });

  async function signIn(role: UserRole): Promise<string> {
    const user = await createUser(prisma, { role });
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    return body.accessToken as string;
  }

  const post = (path: string, body: Record<string, unknown>, auth = adminToken) =>
    request(app.getHttpServer())
      .post(`/api/v1${path}`)
      .set('Authorization', `Bearer ${auth}`)
      .send(body);

  const validEmployee = () => ({
    employeeCode: 'EMP2001',
    firstName: 'Nisha',
    lastName: 'Kulkarni',
    email: 'nisha.kulkarni@example.com',
    department: 'Engineering',
    designation: 'Senior Software Engineer',
    locationId: world.locationId,
    dateJoined: '2026-09-01',
  });

  const validAsset = () => ({
    assetTag: 'LAP-9001',
    serialNumber: 'DL900123',
    modelId: world.modelId,
    conditionGrade: 'NEW',
    locationId: world.locationId,
  });

  describe('POST /employees', () => {
    it('adds someone who can immediately be issued an asset', async () => {
      const response = await post('/employees', validEmployee()).expect(201);

      expect(response.body).toMatchObject({
        employeeCode: 'EMP2001',
        fullName: 'Nisha Kulkarni',
        status: EmployeeStatus.ACTIVE,
        dateJoined: '2026-09-01',
        dateExited: null,
      });

      // The whole point: the new person can hold hardware straight away.
      const asset = await post('/assets', validAsset()).expect(201);
      const issued = await post(`/assets/${asset.body.id}/issue`, {
        employeeId: response.body.id,
        conditionOut: 'NEW',
      }).expect(200);
      expect(issued.body.currentHolder.fullName).toBe('Nisha Kulkarni');
    });

    it('normalises the code to upper case and the email to lower', async () => {
      const response = await post('/employees', {
        ...validEmployee(),
        employeeCode: 'emp2002',
        email: 'Nisha.KULKARNI@Example.com',
      }).expect(201);

      expect(response.body.employeeCode).toBe('EMP2002');
      expect(response.body.email).toBe('nisha.kulkarni@example.com');
    });

    it('refuses a duplicate employee code', async () => {
      await post('/employees', validEmployee()).expect(201);
      const response = await post('/employees', {
        ...validEmployee(),
        email: 'someone.else@example.com',
      }).expect(409);

      expect(response.body.error.code).toBe(ErrorCode.DUPLICATE_EMPLOYEE_CODE);
    });

    it('refuses a duplicate email', async () => {
      await post('/employees', validEmployee()).expect(201);
      const response = await post('/employees', {
        ...validEmployee(),
        employeeCode: 'EMP2003',
      }).expect(409);

      expect(response.body.error.code).toBe(ErrorCode.DUPLICATE_EMPLOYEE_EMAIL);
    });

    it('rejects a malformed body with per-field messages', async () => {
      const response = await post('/employees', {
        ...validEmployee(),
        email: 'not-an-email',
        dateJoined: '01-09-2026',
      }).expect(400);

      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'email' }),
          expect.objectContaining({ path: 'dateJoined' }),
        ]),
      );
    });

    it('refuses an unknown location', async () => {
      await post('/employees', {
        ...validEmployee(),
        locationId: '01a0900b-0000-7000-8000-000000000000',
      }).expect(404);
    });

    it('links a reporting manager when one is given', async () => {
      const manager = await makeEmployee(prisma, world);
      const response = await post('/employees', {
        ...validEmployee(),
        reportingManagerId: manager.id,
      }).expect(201);

      expect(response.body.reportingManager).toMatchObject({ id: manager.id });
    });

    it('is closed to a STORE_KEEPER', async () => {
      await post('/employees', validEmployee(), storeKeeperToken).expect(403);
    });
  });

  describe('POST /assets', () => {
    it('creates the asset in stock with a STOCK_IN event opening its history', async () => {
      const response = await post('/assets', validAsset()).expect(201);

      expect(response.body).toMatchObject({
        assetTag: 'LAP-9001',
        status: AssetStatus.IN_STOCK,
        conditionGrade: 'NEW',
        currentHolder: null,
      });

      const events = await prisma.assetEvent.findMany({ where: { assetId: response.body.id } });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventType: AssetEventType.STOCK_IN,
        fromStatus: null,
        toStatus: AssetStatus.IN_STOCK,
      });
    });

    it('upper-cases the asset tag', async () => {
      const response = await post('/assets', { ...validAsset(), assetTag: 'lap-9002' }).expect(201);
      expect(response.body.assetTag).toBe('LAP-9002');
    });

    it('computes the warranty date from the model default when none is given', async () => {
      // The world's model carries a 36-month default warranty.
      const response = await post('/assets', validAsset()).expect(201);

      expect(response.body.warrantyExpiresOn).not.toBeNull();
      const today = new Date();
      const expiry = new Date(`${response.body.warrantyExpiresOn}T00:00:00Z`);
      const months =
        (expiry.getUTCFullYear() - today.getUTCFullYear()) * 12 +
        (expiry.getUTCMonth() - today.getUTCMonth());
      expect(months).toBe(36);
    });

    it('keeps an explicit warranty date exactly as given', async () => {
      const response = await post('/assets', {
        ...validAsset(),
        warrantyExpiresOn: '2028-03-31',
      }).expect(201);

      expect(response.body.warrantyExpiresOn).toBe('2028-03-31');
    });

    it('refuses a duplicate asset tag', async () => {
      await post('/assets', validAsset()).expect(201);
      const response = await post('/assets', {
        ...validAsset(),
        serialNumber: 'DL900999',
      }).expect(409);

      expect(response.body.error.code).toBe(ErrorCode.DUPLICATE_ASSET_TAG);
    });

    it('refuses a duplicate serial number', async () => {
      await post('/assets', validAsset()).expect(201);
      const response = await post('/assets', { ...validAsset(), assetTag: 'LAP-9003' }).expect(409);

      expect(response.body.error.code).toBe(ErrorCode.DUPLICATE_SERIAL_NUMBER);
    });

    it('requires a serial number when the category demands one', async () => {
      const response = await post('/assets', {
        ...validAsset(),
        serialNumber: undefined,
      }).expect(422);

      expect(response.body.error.code).toBe(ErrorCode.SERIAL_REQUIRED);
    });

    it('refuses to create an individual asset for a bulk category', async () => {
      // Chargers are counted in stock, not created one row at a time.
      const response = await post('/assets', {
        ...validAsset(),
        assetTag: 'CHG-9001',
        serialNumber: null,
        modelId: world.bulkModelId,
      }).expect(422);

      expect(response.body.error.message).toMatch(/bulk-tracked/i);
    });

    it('refuses an inactive location', async () => {
      await prisma.location.update({
        where: { id: world.altLocationId },
        data: { isActive: false },
      });

      const response = await post('/assets', {
        ...validAsset(),
        locationId: world.altLocationId,
      }).expect(422);

      expect(response.body.error.code).toBe(ErrorCode.REFERENCED_RECORD_INACTIVE);
    });

    it('is closed to a STORE_KEEPER', async () => {
      await post('/assets', validAsset(), storeKeeperToken).expect(403);
    });
  });
});
