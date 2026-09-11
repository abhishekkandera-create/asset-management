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

describe('asset lifecycle (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let world: World;
  let token: string;
  let viewerToken: string;

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
    token = await signIn(UserRole.ADMIN);
    viewerToken = await signIn(UserRole.VIEWER);
  });

  async function signIn(role: UserRole): Promise<string> {
    const user = await createUser(prisma, { role });
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    return body.accessToken as string;
  }

  const post = (path: string, body: Record<string, unknown>, auth = token) =>
    request(app.getHttpServer())
      .post(`/api/v1${path}`)
      .set('Authorization', `Bearer ${auth}`)
      .send(body);
  const get = (path: string, auth = token) =>
    request(app.getHttpServer()).get(`/api/v1${path}`).set('Authorization', `Bearer ${auth}`);

  /**
   * The acceptance criterion for phase 2 (CLAUDE.md §12): issue a laptop,
   * return it, inspect it, reissue it to someone else, and see every step on
   * the history page.
   */
  describe('the full issue → return → inspect → reissue cycle', () => {
    it('walks the asset through every status and records each step', async () => {
      const asset = await makeAsset(prisma, world);
      const alice = await makeEmployee(prisma, world);
      const bob = await makeEmployee(prisma, world);

      const issued = await post(`/assets/${asset.id}/issue`, {
        employeeId: alice.id,
        conditionOut: 'NEW',
        remarks: 'Standard allocation',
      }).expect(200);
      expect(issued.body.status).toBe(AssetStatus.ASSIGNED);
      expect(issued.body.currentHolder).toMatchObject({
        employeeId: alice.id,
        fullName: alice.fullName,
      });

      const returned = await post(`/assets/${asset.id}/return`, {
        conditionIn: 'FAIR',
        remarks: 'Scratched lid',
      }).expect(200);
      // §7.4 — a return never lands straight in stock.
      expect(returned.body.status).toBe(AssetStatus.RETURNED_PENDING_CHECK);
      expect(returned.body.currentHolder).toBeNull();

      const inspected = await post(`/assets/${asset.id}/inspect`, {
        outcome: 'TO_STOCK',
        conditionGrade: 'GOOD',
        notes: 'Wiped and reimaged',
      }).expect(200);
      expect(inspected.body.status).toBe(AssetStatus.IN_STOCK);

      const reissued = await post(`/assets/${asset.id}/issue`, {
        employeeId: bob.id,
        conditionOut: 'GOOD',
      }).expect(200);
      expect(reissued.body.status).toBe(AssetStatus.ASSIGNED);
      expect(reissued.body.currentHolder.employeeId).toBe(bob.id);

      const history = await get(`/assets/${asset.id}/history`).expect(200);
      expect(history.body.data.map((event: { eventType: string }) => event.eventType)).toEqual([
        'ISSUED',
        'INSPECTED',
        'RETURNED',
        'ISSUED',
      ]);

      // Both holders survive in the ledger; neither overwrote the other.
      const assignments = await get(`/assignments?assetId=${asset.id}`).expect(200);
      expect(assignments.body.meta.total).toBe(2);
      expect(
        assignments.body.data.filter((a: { status: string }) => a.status === 'OPEN'),
      ).toHaveLength(1);
    });

    it('keeps the previous holder visible after the asset moves on', async () => {
      const asset = await makeAsset(prisma, world);
      const alice = await makeEmployee(prisma, world);
      const bob = await makeEmployee(prisma, world);

      await post(`/assets/${asset.id}/issue`, { employeeId: alice.id, conditionOut: 'NEW' }).expect(
        200,
      );
      await post(`/assets/${asset.id}/return`, { conditionIn: 'GOOD' }).expect(200);
      await post(`/assets/${asset.id}/inspect`, {
        outcome: 'TO_STOCK',
        conditionGrade: 'GOOD',
      }).expect(200);
      await post(`/assets/${asset.id}/issue`, { employeeId: bob.id, conditionOut: 'GOOD' }).expect(
        200,
      );

      const aliceHistory = await get(`/employees/${alice.id}/assignments`).expect(200);
      expect(aliceHistory.body.meta.total).toBe(1);
      expect(aliceHistory.body.data[0]).toMatchObject({
        status: AssignmentStatus.CLOSED,
        conditionOut: 'NEW',
        conditionIn: 'GOOD',
      });

      // And she no longer holds it.
      const aliceHoldings = await get(`/employees/${alice.id}/assets`).expect(200);
      expect(aliceHoldings.body.assignments).toHaveLength(0);
    });
  });

  describe('issuing (CLAUDE.md §7.1, §7.2)', () => {
    it('rejects a second issue of an already-issued asset with 409', async () => {
      const asset = await makeAsset(prisma, world);
      const alice = await makeEmployee(prisma, world);
      const bob = await makeEmployee(prisma, world);

      await post(`/assets/${asset.id}/issue`, {
        employeeId: alice.id,
        conditionOut: 'GOOD',
      }).expect(200);
      const conflict = await post(`/assets/${asset.id}/issue`, {
        employeeId: bob.id,
        conditionOut: 'GOOD',
      }).expect(409);

      expect(conflict.body.error.code).toBe(ErrorCode.ASSET_ALREADY_ASSIGNED);
      expect(await prisma.assignment.count({ where: { assetId: asset.id } })).toBe(1);
    });

    it('lets only one of two simultaneous issues win', async () => {
      const asset = await makeAsset(prisma, world);
      const alice = await makeEmployee(prisma, world);
      const bob = await makeEmployee(prisma, world);

      const [first, second] = await Promise.all([
        post(`/assets/${asset.id}/issue`, { employeeId: alice.id, conditionOut: 'GOOD' }),
        post(`/assets/${asset.id}/issue`, { employeeId: bob.id, conditionOut: 'GOOD' }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([200, 409]);
      expect(
        await prisma.assignment.count({
          where: { assetId: asset.id, status: AssignmentStatus.OPEN },
        }),
      ).toBe(1);
      // Exactly one ISSUED event, so no ghost history from the loser.
      expect(await prisma.assetEvent.count({ where: { assetId: asset.id } })).toBe(1);
    });

    it('refuses to issue to an employee who has exited', async () => {
      const asset = await makeAsset(prisma, world);
      const leaver = await makeEmployee(prisma, world, { status: EmployeeStatus.EXITED });

      const response = await post(`/assets/${asset.id}/issue`, {
        employeeId: leaver.id,
        conditionOut: 'GOOD',
      }).expect(422);

      expect(response.body.error.code).toBe(ErrorCode.EMPLOYEE_EXITED);
      expect(await prisma.assignment.count()).toBe(0);
    });

    it.each([AssetStatus.IN_REPAIR, AssetStatus.RETIRED, AssetStatus.LOST])(
      'refuses to issue an asset that is %s',
      async (status) => {
        const asset = await makeAsset(prisma, world, { status });
        const alice = await makeEmployee(prisma, world);

        const response = await post(`/assets/${asset.id}/issue`, {
          employeeId: alice.id,
          conditionOut: 'GOOD',
        }).expect(422);

        expect(response.body.error.code).toBe(ErrorCode.ASSET_NOT_AVAILABLE);
      },
    );

    it('refuses to issue an asset still awaiting inspection', async () => {
      const asset = await makeAsset(prisma, world, { status: AssetStatus.RETURNED_PENDING_CHECK });
      const alice = await makeEmployee(prisma, world);

      const response = await post(`/assets/${asset.id}/issue`, {
        employeeId: alice.id,
        conditionOut: 'GOOD',
      }).expect(422);

      expect(response.body.error.message).toMatch(/inspect/i);
    });

    it('requires a condition grade at issue (§7.3)', async () => {
      const asset = await makeAsset(prisma, world);
      const alice = await makeEmployee(prisma, world);

      const response = await post(`/assets/${asset.id}/issue`, { employeeId: alice.id }).expect(
        400,
      );
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it('rejects an expected return date before the issue date', async () => {
      const asset = await makeAsset(prisma, world);
      const alice = await makeEmployee(prisma, world);

      await post(`/assets/${asset.id}/issue`, {
        employeeId: alice.id,
        conditionOut: 'GOOD',
        issuedOn: '2026-05-01',
        expectedReturnOn: '2026-04-01',
      }).expect(422);
    });
  });

  describe('returning and inspecting', () => {
    it('refuses to return an asset nobody holds', async () => {
      const asset = await makeAsset(prisma, world);
      const response = await post(`/assets/${asset.id}/return`, { conditionIn: 'GOOD' }).expect(
        422,
      );
      expect(response.body.error.code).toBe(ErrorCode.ASSET_NOT_ASSIGNED);
    });

    it('requires a condition grade at return (§7.3)', async () => {
      const asset = await makeAsset(prisma, world);
      const alice = await makeEmployee(prisma, world);
      await post(`/assets/${asset.id}/issue`, {
        employeeId: alice.id,
        conditionOut: 'GOOD',
      }).expect(200);

      await post(`/assets/${asset.id}/return`, { remarks: 'no grade' }).expect(400);
    });

    it.each([
      ['TO_STOCK', AssetStatus.IN_STOCK],
      ['TO_REPAIR', AssetStatus.IN_REPAIR],
      ['RETIRE', AssetStatus.RETIRED],
    ])('inspection outcome %s sends the asset to %s', async (outcome, expected) => {
      const asset = await makeAsset(prisma, world, { status: AssetStatus.RETURNED_PENDING_CHECK });

      const response = await post(`/assets/${asset.id}/inspect`, {
        outcome,
        conditionGrade: 'FAIR',
      }).expect(200);

      expect(response.body.status).toBe(expected);
    });

    it('refuses to inspect an asset that is not awaiting inspection', async () => {
      const asset = await makeAsset(prisma, world);
      const response = await post(`/assets/${asset.id}/inspect`, {
        outcome: 'TO_STOCK',
        conditionGrade: 'GOOD',
      }).expect(422);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_TRANSITION);
    });
  });

  describe('transfer (CLAUDE.md §7.9)', () => {
    it('closes one assignment, opens another and writes three events in one transaction', async () => {
      const asset = await makeAsset(prisma, world);
      const alice = await makeEmployee(prisma, world);
      const bob = await makeEmployee(prisma, world);

      await post(`/assets/${asset.id}/issue`, { employeeId: alice.id, conditionOut: 'NEW' }).expect(
        200,
      );

      const response = await post(`/assets/${asset.id}/transfer`, {
        toEmployeeId: bob.id,
        conditionIn: 'GOOD',
        conditionOut: 'GOOD',
        remarks: 'Alice moved teams',
      }).expect(200);

      expect(response.body.status).toBe(AssetStatus.ASSIGNED);
      expect(response.body.currentHolder.employeeId).toBe(bob.id);

      const history = await get(`/assets/${asset.id}/history`).expect(200);
      expect(history.body.data.map((e: { eventType: string }) => e.eventType)).toEqual([
        'TRANSFERRED',
        'INSPECTED',
        'RETURNED',
        'ISSUED',
      ]);

      const assignments = await prisma.assignment.findMany({
        where: { assetId: asset.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(assignments).toHaveLength(2);
      expect(assignments[0]).toMatchObject({
        employeeId: alice.id,
        status: AssignmentStatus.CLOSED,
        conditionIn: 'GOOD',
      });
      expect(assignments[1]).toMatchObject({ employeeId: bob.id, status: AssignmentStatus.OPEN });
    });

    it('rolls the whole transfer back when the recipient has exited', async () => {
      const asset = await makeAsset(prisma, world);
      const alice = await makeEmployee(prisma, world);
      const leaver = await makeEmployee(prisma, world, { status: EmployeeStatus.EXITED });

      await post(`/assets/${asset.id}/issue`, { employeeId: alice.id, conditionOut: 'NEW' }).expect(
        200,
      );

      await post(`/assets/${asset.id}/transfer`, {
        toEmployeeId: leaver.id,
        conditionIn: 'GOOD',
        conditionOut: 'GOOD',
      }).expect(422);

      // Nothing partial survived: Alice still holds it, and only the original
      // ISSUED event exists.
      const after = await get(`/assets/${asset.id}`).expect(200);
      expect(after.body.status).toBe(AssetStatus.ASSIGNED);
      expect(after.body.currentHolder.employeeId).toBe(alice.id);
      expect(await prisma.assetEvent.count({ where: { assetId: asset.id } })).toBe(1);
      expect(await prisma.assignment.count({ where: { assetId: asset.id } })).toBe(1);
    });

    it('refuses to transfer to the person who already holds it', async () => {
      const asset = await makeAsset(prisma, world);
      const alice = await makeEmployee(prisma, world);
      await post(`/assets/${asset.id}/issue`, { employeeId: alice.id, conditionOut: 'NEW' }).expect(
        200,
      );

      const response = await post(`/assets/${asset.id}/transfer`, {
        toEmployeeId: alice.id,
        conditionIn: 'GOOD',
        conditionOut: 'GOOD',
      }).expect(422);
      expect(response.body.error.code).toBe(ErrorCode.TRANSFER_TO_SAME_EMPLOYEE);
    });

    it('refuses to transfer an asset nobody holds', async () => {
      const asset = await makeAsset(prisma, world);
      const bob = await makeEmployee(prisma, world);
      await post(`/assets/${asset.id}/transfer`, {
        toEmployeeId: bob.id,
        conditionIn: 'GOOD',
        conditionOut: 'GOOD',
      }).expect(422);
    });
  });

  describe('mark lost, recover and retire', () => {
    it('writes off the open assignment when an issued asset is lost', async () => {
      const asset = await makeAsset(prisma, world);
      const alice = await makeEmployee(prisma, world);
      await post(`/assets/${asset.id}/issue`, { employeeId: alice.id, conditionOut: 'NEW' }).expect(
        200,
      );

      const response = await post(`/assets/${asset.id}/mark-lost`, {
        notes: 'Left in an airport lounge',
      }).expect(200);

      expect(response.body.status).toBe(AssetStatus.LOST);
      expect(response.body.currentHolder).toBeNull();

      const assignment = await prisma.assignment.findFirstOrThrow({ where: { assetId: asset.id } });
      // No physical return, so returnedOn and conditionIn stay null (§5.3).
      expect(assignment.status).toBe(AssignmentStatus.WRITTEN_OFF);
      expect(assignment.returnedOn).toBeNull();
      expect(assignment.conditionIn).toBeNull();
      expect(assignment.closedOn).not.toBeNull();

      const history = await get(`/assets/${asset.id}/history`).expect(200);
      expect(history.body.data.map((e: { eventType: string }) => e.eventType)).toEqual([
        'MARKED_LOST',
        'WRITTEN_OFF',
        'ISSUED',
      ]);
    });

    it('marks an unissued asset lost without inventing an assignment', async () => {
      const asset = await makeAsset(prisma, world);
      await post(`/assets/${asset.id}/mark-lost`, { notes: 'Missing at stock audit' }).expect(200);
      expect(await prisma.assignment.count()).toBe(0);
    });

    it('recovers a lost asset back into stock', async () => {
      const asset = await makeAsset(prisma, world, { status: AssetStatus.LOST });

      const response = await post(`/assets/${asset.id}/recover`, {
        conditionGrade: 'FAIR',
        notes: 'Handed in at reception',
      }).expect(200);

      expect(response.body.status).toBe(AssetStatus.IN_STOCK);
      expect(response.body.conditionGrade).toBe('FAIR');
    });

    it('will not bring a retired asset back — RETIRED is terminal', async () => {
      const asset = await makeAsset(prisma, world, { status: AssetStatus.RETIRED });
      const alice = await makeEmployee(prisma, world);

      await post(`/assets/${asset.id}/issue`, {
        employeeId: alice.id,
        conditionOut: 'GOOD',
      }).expect(422);
      await post(`/assets/${asset.id}/recover`, { conditionGrade: 'GOOD', notes: 'x' }).expect(422);
      await post(`/assets/${asset.id}/mark-lost`, { notes: 'x' }).expect(422);
    });
  });

  describe('corrections and notes (CLAUDE.md §7.5)', () => {
    it('records both the old and the new serial number', async () => {
      const asset = await makeAsset(prisma, world, { serialNumber: 'DL100493' });

      await post(`/assets/${asset.id}/correct-serial`, {
        serialNumber: 'DL100439',
        reason: 'Misread at receipt',
      }).expect(201);

      const history = await get(`/assets/${asset.id}/history`).expect(200);
      const note = history.body.data[0];
      expect(note.eventType).toBe('NOTE_ADDED');
      expect(note.notes).toContain('DL100493');
      expect(note.notes).toContain('DL100439');
      expect(note.fromStatus).toBeNull();
      expect(note.toStatus).toBeNull();
    });

    it('does not let a STORE_KEEPER correct a serial number', async () => {
      const asset = await makeAsset(prisma, world);
      const storeKeeperToken = await signIn(UserRole.STORE_KEEPER);

      await post(
        `/assets/${asset.id}/correct-serial`,
        { serialNumber: 'NEW-1', reason: 'x' },
        storeKeeperToken,
      ).expect(403);
    });

    it('never exposes an endpoint that edits the asset tag', async () => {
      const asset = await makeAsset(prisma, world);
      await request(app.getHttpServer())
        .patch(`/api/v1/assets/${asset.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ assetTag: 'HACKED-0001' })
        .expect(200);

      const after = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
      expect(after.assetTag).toBe(asset.assetTag);
    });
  });

  describe('roles (CLAUDE.md §7.10)', () => {
    it('lets a VIEWER read everything', async () => {
      const asset = await makeAsset(prisma, world);
      await get('/assets', viewerToken).expect(200);
      await get(`/assets/${asset.id}`, viewerToken).expect(200);
      await get(`/assets/${asset.id}/history`, viewerToken).expect(200);
      await get('/employees', viewerToken).expect(200);
    });

    it('stops a VIEWER changing anything', async () => {
      const asset = await makeAsset(prisma, world);
      const alice = await makeEmployee(prisma, world);

      await post(
        `/assets/${asset.id}/issue`,
        { employeeId: alice.id, conditionOut: 'GOOD' },
        viewerToken,
      ).expect(403);
      await post(`/assets/${asset.id}/mark-lost`, { notes: 'x' }, viewerToken).expect(403);
      await post(
        '/assets',
        { assetTag: 'X-1', modelId: world.modelId, locationId: world.locationId },
        viewerToken,
      ).expect(403);
    });

    it('lets a STORE_KEEPER run the lifecycle but not create assets', async () => {
      const asset = await makeAsset(prisma, world);
      const alice = await makeEmployee(prisma, world);
      const storeKeeperToken = await signIn(UserRole.STORE_KEEPER);

      await post(
        `/assets/${asset.id}/issue`,
        { employeeId: alice.id, conditionOut: 'GOOD' },
        storeKeeperToken,
      ).expect(200);
      await post(
        '/assets',
        {
          assetTag: 'X-1',
          modelId: world.modelId,
          locationId: world.locationId,
          conditionGrade: 'NEW',
        },
        storeKeeperToken,
      ).expect(403);
    });
  });
});
