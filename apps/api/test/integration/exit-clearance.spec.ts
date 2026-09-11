import { type INestApplication } from '@nestjs/common';
import { AssetStatus, AssignmentStatus, EmployeeStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '@asset/shared';
import { type PrismaService } from '../../src/common/prisma/prisma.service';
import { createTestApp, createUser } from '../support/test-app';
import {
  type World,
  buildWorld,
  makeAsset,
  makeEmployee,
  resetFixtureCounters,
} from '../support/fixtures';

/**
 * CLAUDE.md §7.7 and phase 3's acceptance criterion: an employee cannot be
 * marked exited while they still hold a laptop, and once it is written off,
 * the asset's history still shows them as its former holder.
 */
describe('employee exit clearance (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let world: World;
  let token: string;

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

    const user = await createUser(prisma, { role: UserRole.ADMIN });
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    token = body.accessToken as string;
  });

  const post = (path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const get = (path: string) =>
    request(app.getHttpServer()).get(`/api/v1${path}`).set('Authorization', `Bearer ${token}`);

  describe('GET /employees/:id/clearance', () => {
    it('reports clear when the employee holds nothing', async () => {
      const alice = await makeEmployee(prisma, world);

      const response = await get(`/employees/${alice.id}/clearance`).expect(200);
      expect(response.body).toMatchObject({
        employeeId: alice.id,
        fullName: alice.fullName,
        isClear: true,
        openAssignments: [],
      });
    });

    it('lists every open assignment with enough detail to act on it', async () => {
      const alice = await makeEmployee(prisma, world);
      const laptop = await makeAsset(prisma, world);
      const monitor = await makeAsset(prisma, world);

      await post(`/assets/${laptop.id}/issue`, {
        employeeId: alice.id,
        conditionOut: 'NEW',
        issuedOn: '2026-01-01',
      }).expect(200);
      await post(`/assets/${monitor.id}/issue`, {
        employeeId: alice.id,
        conditionOut: 'GOOD',
      }).expect(200);

      const response = await get(`/employees/${alice.id}/clearance`).expect(200);
      expect(response.body.isClear).toBe(false);
      expect(response.body.openAssignments).toHaveLength(2);
      expect(response.body.openAssignments[0]).toMatchObject({
        assetTag: laptop.assetTag,
        categoryName: 'Laptop',
        manufacturer: 'Dell',
        issuedOn: '2026-01-01',
      });
      expect(response.body.openAssignments[0].heldForDays).toBeGreaterThan(0);
    });

    it('ignores assignments that are already closed', async () => {
      const alice = await makeEmployee(prisma, world);
      const laptop = await makeAsset(prisma, world);

      await post(`/assets/${laptop.id}/issue`, {
        employeeId: alice.id,
        conditionOut: 'NEW',
      }).expect(200);
      await post(`/assets/${laptop.id}/return`, { conditionIn: 'GOOD' }).expect(200);

      const response = await get(`/employees/${alice.id}/clearance`).expect(200);
      expect(response.body.isClear).toBe(true);
    });
  });

  describe('POST /employees/:id/exit', () => {
    it('refuses while the employee still holds a laptop', async () => {
      const alice = await makeEmployee(prisma, world);
      const laptop = await makeAsset(prisma, world);
      await post(`/assets/${laptop.id}/issue`, {
        employeeId: alice.id,
        conditionOut: 'NEW',
      }).expect(200);

      const response = await post(`/employees/${alice.id}/exit`, {
        dateExited: '2026-09-30',
      }).expect(422);

      expect(response.body.error.code).toBe(ErrorCode.EMPLOYEE_HAS_OPEN_ASSIGNMENTS);
      expect(response.body.error.details).toMatchObject({ openCount: 1 });

      const unchanged = await prisma.employee.findUniqueOrThrow({ where: { id: alice.id } });
      expect(unchanged.status).toBe(EmployeeStatus.ACTIVE);
      expect(unchanged.dateExited).toBeNull();
    });

    it('succeeds once everything is returned', async () => {
      const alice = await makeEmployee(prisma, world);
      const laptop = await makeAsset(prisma, world);

      await post(`/assets/${laptop.id}/issue`, {
        employeeId: alice.id,
        conditionOut: 'NEW',
      }).expect(200);
      await post(`/employees/${alice.id}/exit`, { dateExited: '2026-09-30' }).expect(422);

      await post(`/assets/${laptop.id}/return`, { conditionIn: 'GOOD' }).expect(200);

      const response = await post(`/employees/${alice.id}/exit`, {
        dateExited: '2026-09-30',
      }).expect(200);
      expect(response.body).toMatchObject({ status: 'EXITED', dateExited: '2026-09-30' });
    });

    it('succeeds once the outstanding item is written off', async () => {
      const alice = await makeEmployee(prisma, world);
      const laptop = await makeAsset(prisma, world);

      await post(`/assets/${laptop.id}/issue`, {
        employeeId: alice.id,
        conditionOut: 'NEW',
      }).expect(200);
      const assignment = await prisma.assignment.findFirstOrThrow({
        where: { employeeId: alice.id },
      });

      await post(`/assignments/${assignment.id}/write-off`, {
        reason: 'Left without returning the laptop',
        markAssetLost: true,
      }).expect(200);

      const clearance = await get(`/employees/${alice.id}/clearance`).expect(200);
      expect(clearance.body.isClear).toBe(true);

      await post(`/employees/${alice.id}/exit`, { dateExited: '2026-09-30' }).expect(200);
    });

    it('keeps the exited employee as the former holder in the asset history', async () => {
      const alice = await makeEmployee(prisma, world);
      const laptop = await makeAsset(prisma, world);

      await post(`/assets/${laptop.id}/issue`, {
        employeeId: alice.id,
        conditionOut: 'NEW',
      }).expect(200);
      const assignment = await prisma.assignment.findFirstOrThrow({
        where: { employeeId: alice.id },
      });
      await post(`/assignments/${assignment.id}/write-off`, {
        reason: 'Not returned at exit',
        markAssetLost: true,
      }).expect(200);
      await post(`/employees/${alice.id}/exit`, { dateExited: '2026-09-30' }).expect(200);

      // The whole point of the system: the trail survives the person leaving.
      const history = await get(`/assets/${laptop.id}/history`).expect(200);
      const involving = history.body.data.filter(
        (event: { employee?: { id: string } | null }) => event.employee?.id === alice.id,
      );
      expect(involving.length).toBeGreaterThanOrEqual(2);
      expect(involving[0].employee.fullName).toBe(alice.fullName);

      const ledger = await get(`/employees/${alice.id}/assignments`).expect(200);
      expect(ledger.body.data[0]).toMatchObject({
        status: AssignmentStatus.WRITTEN_OFF,
        returnedOn: null,
        conditionIn: null,
      });

      // And the employee row itself is still there, just archived.
      const stored = await prisma.employee.findUnique({ where: { id: alice.id } });
      expect(stored).not.toBeNull();
      expect(stored?.status).toBe(EmployeeStatus.EXITED);
    });

    it('refuses to exit the same employee twice', async () => {
      const alice = await makeEmployee(prisma, world);
      await post(`/employees/${alice.id}/exit`, { dateExited: '2026-09-30' }).expect(200);

      const response = await post(`/employees/${alice.id}/exit`, {
        dateExited: '2026-10-31',
      }).expect(422);
      expect(response.body.error.code).toBe(ErrorCode.EMPLOYEE_ALREADY_EXITED);
    });

    it('refuses an exit date before the joining date', async () => {
      const alice = await makeEmployee(prisma, world);
      await post(`/employees/${alice.id}/exit`, { dateExited: '2020-01-01' }).expect(422);
    });

    it('offers no way to delete an employee at all (§2.2)', async () => {
      const alice = await makeEmployee(prisma, world);
      await request(app.getHttpServer())
        .delete(`/api/v1/employees/${alice.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('write-off', () => {
    it('can close an assignment without condemning the asset', async () => {
      const alice = await makeEmployee(prisma, world);
      const laptop = await makeAsset(prisma, world);
      await post(`/assets/${laptop.id}/issue`, {
        employeeId: alice.id,
        conditionOut: 'NEW',
      }).expect(200);
      const assignment = await prisma.assignment.findFirstOrThrow({
        where: { employeeId: alice.id },
      });

      await post(`/assignments/${assignment.id}/write-off`, {
        reason: 'Laptop left at a desk; will be collected',
        markAssetLost: false,
      }).expect(200);

      const asset = await prisma.asset.findUniqueOrThrow({ where: { id: laptop.id } });
      expect(asset.status).toBe(AssetStatus.ASSIGNED);

      // The ledger is closed even though the asset status did not move, so the
      // clearance screen unblocks.
      const clearance = await get(`/employees/${alice.id}/clearance`).expect(200);
      expect(clearance.body.isClear).toBe(true);
    });

    it('refuses to write off an assignment that is already closed', async () => {
      const alice = await makeEmployee(prisma, world);
      const laptop = await makeAsset(prisma, world);
      await post(`/assets/${laptop.id}/issue`, {
        employeeId: alice.id,
        conditionOut: 'NEW',
      }).expect(200);
      await post(`/assets/${laptop.id}/return`, { conditionIn: 'GOOD' }).expect(200);

      const assignment = await prisma.assignment.findFirstOrThrow({
        where: { employeeId: alice.id },
      });
      const response = await post(`/assignments/${assignment.id}/write-off`, {
        reason: 'x',
      }).expect(422);
      expect(response.body.error.code).toBe(ErrorCode.ASSIGNMENT_NOT_OPEN);
    });

    it('requires a reason', async () => {
      const alice = await makeEmployee(prisma, world);
      const laptop = await makeAsset(prisma, world);
      await post(`/assets/${laptop.id}/issue`, {
        employeeId: alice.id,
        conditionOut: 'NEW',
      }).expect(200);
      const assignment = await prisma.assignment.findFirstOrThrow({
        where: { employeeId: alice.id },
      });

      await post(`/assignments/${assignment.id}/write-off`, { markAssetLost: true }).expect(400);
    });
  });
});
