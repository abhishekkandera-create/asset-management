import { type INestApplication } from '@nestjs/common';
import {
  AssetEventType,
  AssetStatus,
  AssignmentStatus,
  ConditionGrade,
  EmployeeStatus,
  LocationType,
  Prisma,
  TrackingMode,
} from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type PrismaService } from '../../src/common/prisma/prisma.service';
import { isOpenAssignmentConflict } from '../../src/common/errors/prisma-error';
import { createTestApp, createUser } from '../support/test-app';

/**
 * These assert the guarantees CLAUDE.md §2 says must hold at the database,
 * not in application code. Every one of them would still pass if a service
 * forgot its check — which is the point.
 */
describe('database-level guarantees (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let locationId: string;
  let modelId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.truncateAll();
    userId = (await createUser(prisma)).id;

    const location = await prisma.location.create({
      data: { name: 'Test Store', type: LocationType.STORE_ROOM, city: 'Gurugram' },
    });
    locationId = location.id;

    const category = await prisma.assetCategory.create({
      data: { name: 'Laptop', code: 'LAP', trackingMode: TrackingMode.SERIALIZED },
    });
    const model = await prisma.assetModel.create({
      data: { categoryId: category.id, manufacturer: 'Dell', modelName: 'Latitude 5440' },
    });
    modelId = model.id;
  });

  async function makeEmployee(code: string) {
    return prisma.employee.create({
      data: {
        employeeCode: code,
        firstName: 'Test',
        lastName: code,
        email: `${code.toLowerCase()}@example.com`,
        department: 'Engineering',
        designation: 'Software Engineer',
        locationId,
        dateJoined: new Date('2024-01-01T00:00:00Z'),
      },
    });
  }

  async function makeAsset(tag: string) {
    return prisma.asset.create({
      data: {
        assetTag: tag,
        modelId,
        locationId,
        conditionGrade: ConditionGrade.NEW,
        status: AssetStatus.IN_STOCK,
      },
    });
  }

  function openAssignmentData(assetId: string, employeeId: string) {
    return {
      assetId,
      employeeId,
      issuedOn: new Date('2026-01-01T00:00:00Z'),
      issuedBy: userId,
      conditionOut: ConditionGrade.GOOD,
      status: AssignmentStatus.OPEN,
    };
  }

  describe('§2.4 — one open assignment per asset', () => {
    it('rejects a second open assignment on the same asset', async () => {
      const asset = await makeAsset('LAP-0001');
      const first = await makeEmployee('EMP1');
      const second = await makeEmployee('EMP2');

      await prisma.assignment.create({ data: openAssignmentData(asset.id, first.id) });

      const attempt = prisma.assignment.create({
        data: openAssignmentData(asset.id, second.id),
      });

      await expect(attempt).rejects.toSatisfy(isOpenAssignmentConflict);
    });

    it('stops two concurrent issues, so only one wins the race', async () => {
      const asset = await makeAsset('LAP-0002');
      const first = await makeEmployee('EMP1');
      const second = await makeEmployee('EMP2');

      // Both inserts are in flight before either commits — the situation an
      // application-level SELECT check cannot catch.
      const results = await Promise.allSettled([
        prisma.assignment.create({ data: openAssignmentData(asset.id, first.id) }),
        prisma.assignment.create({ data: openAssignmentData(asset.id, second.id) }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected');
      expect(isOpenAssignmentConflict((rejected as PromiseRejectedResult).reason)).toBe(true);
      expect(await prisma.assignment.count({ where: { status: AssignmentStatus.OPEN } })).toBe(1);
    });

    it('allows a new assignment once the previous one is closed', async () => {
      const asset = await makeAsset('LAP-0003');
      const first = await makeEmployee('EMP1');
      const second = await makeEmployee('EMP2');

      const opened = await prisma.assignment.create({
        data: openAssignmentData(asset.id, first.id),
      });
      await prisma.assignment.update({
        where: { id: opened.id },
        data: {
          status: AssignmentStatus.CLOSED,
          returnedOn: new Date('2026-02-01T00:00:00Z'),
          closedOn: new Date('2026-02-01T00:00:00Z'),
          conditionIn: ConditionGrade.GOOD,
        },
      });

      await expect(
        prisma.assignment.create({ data: openAssignmentData(asset.id, second.id) }),
      ).resolves.toBeDefined();
    });

    it('allows many closed assignments for the same asset — history is unbounded', async () => {
      const asset = await makeAsset('LAP-0004');
      for (let i = 0; i < 4; i += 1) {
        const employee = await makeEmployee(`EMP${i}`);
        await prisma.assignment.create({
          data: {
            ...openAssignmentData(asset.id, employee.id),
            status: AssignmentStatus.CLOSED,
            returnedOn: new Date('2026-02-01T00:00:00Z'),
            closedOn: new Date('2026-02-01T00:00:00Z'),
            conditionIn: ConditionGrade.GOOD,
          },
        });
      }
      expect(await prisma.assignment.count({ where: { assetId: asset.id } })).toBe(4);
    });
  });

  describe('§2.3 — asset_event is append-only', () => {
    it('refuses to update an event row', async () => {
      const asset = await makeAsset('LAP-0005');
      const event = await prisma.assetEvent.create({
        data: {
          assetId: asset.id,
          eventType: AssetEventType.STOCK_IN,
          performedBy: userId,
          toStatus: AssetStatus.IN_STOCK,
          notes: 'original',
        },
      });

      await expect(
        prisma.assetEvent.update({ where: { id: event.id }, data: { notes: 'tampered' } }),
      ).rejects.toThrow(/append-only/);

      const unchanged = await prisma.assetEvent.findUniqueOrThrow({ where: { id: event.id } });
      expect(unchanged.notes).toBe('original');
    });

    it('refuses to delete an event row', async () => {
      const asset = await makeAsset('LAP-0006');
      const event = await prisma.assetEvent.create({
        data: {
          assetId: asset.id,
          eventType: AssetEventType.STOCK_IN,
          performedBy: userId,
          toStatus: AssetStatus.IN_STOCK,
        },
      });

      await expect(prisma.assetEvent.delete({ where: { id: event.id } })).rejects.toThrow(
        /append-only/,
      );
      expect(await prisma.assetEvent.count()).toBe(1);
    });
  });

  describe('§2.2 — employees and assets are archived, never deleted', () => {
    it('refuses to delete an employee who has any assignment history', async () => {
      const asset = await makeAsset('LAP-0007');
      const employee = await makeEmployee('EMP1');
      await prisma.assignment.create({ data: openAssignmentData(asset.id, employee.id) });

      await expect(prisma.employee.delete({ where: { id: employee.id } })).rejects.toThrow();
    });

    it('refuses to delete an asset that has events', async () => {
      const asset = await makeAsset('LAP-0008');
      await prisma.assetEvent.create({
        data: {
          assetId: asset.id,
          eventType: AssetEventType.STOCK_IN,
          performedBy: userId,
          toStatus: AssetStatus.IN_STOCK,
        },
      });

      await expect(prisma.asset.delete({ where: { id: asset.id } })).rejects.toThrow();
    });

    it('keeps history pointing at a real employee after they exit', async () => {
      const asset = await makeAsset('LAP-0009');
      const employee = await makeEmployee('EMP1');
      const assignment = await prisma.assignment.create({
        data: {
          ...openAssignmentData(asset.id, employee.id),
          status: AssignmentStatus.WRITTEN_OFF,
          closedOn: new Date('2026-03-01T00:00:00Z'),
          returnRemarks: 'Left without returning',
        },
      });

      await prisma.employee.update({
        where: { id: employee.id },
        data: { status: EmployeeStatus.EXITED, dateExited: new Date('2026-03-01T00:00:00Z') },
      });

      const stored = await prisma.assignment.findUniqueOrThrow({
        where: { id: assignment.id },
        include: { employee: true },
      });
      expect(stored.employee.status).toBe(EmployeeStatus.EXITED);
      expect(stored.employee.firstName).toBe('Test');
    });
  });

  describe('consistency checks', () => {
    it('requires an exit date whenever the status is EXITED', async () => {
      const employee = await makeEmployee('EMP1');
      await expect(
        prisma.employee.update({
          where: { id: employee.id },
          data: { status: EmployeeStatus.EXITED },
        }),
      ).rejects.toThrow(/employee_exited_has_date/);
    });

    it('requires a condition grade whenever a return date is recorded', async () => {
      const asset = await makeAsset('LAP-0010');
      const employee = await makeEmployee('EMP1');
      const assignment = await prisma.assignment.create({
        data: openAssignmentData(asset.id, employee.id),
      });

      await expect(
        prisma.assignment.update({
          where: { id: assignment.id },
          data: {
            status: AssignmentStatus.CLOSED,
            returnedOn: new Date('2026-02-01T00:00:00Z'),
            closedOn: new Date('2026-02-01T00:00:00Z'),
          },
        }),
      ).rejects.toThrow(/assignment_returned_has_condition_in/);
    });

    it('refuses a BULK category that requires serial numbers', async () => {
      await expect(
        prisma.assetCategory.create({
          data: {
            name: 'Chargers',
            code: 'CHG',
            trackingMode: TrackingMode.BULK,
            requiresSerial: true,
          },
        }),
      ).rejects.toThrow(/asset_category_bulk_needs_no_serial/);
    });

    it('treats null serial numbers as distinct, so many assets may have none', async () => {
      await makeAsset('LAP-0011');
      await expect(makeAsset('LAP-0012')).resolves.toBeDefined();
      expect(await prisma.asset.count({ where: { serialNumber: null } })).toBe(2);
    });

    it('still rejects two assets sharing a non-null serial number', async () => {
      await prisma.asset.create({
        data: {
          assetTag: 'LAP-0013',
          serialNumber: 'SN-1',
          modelId,
          locationId,
          conditionGrade: ConditionGrade.NEW,
        },
      });
      await expect(
        prisma.asset.create({
          data: {
            assetTag: 'LAP-0014',
            serialNumber: 'SN-1',
            modelId,
            locationId,
            conditionGrade: ConditionGrade.NEW,
          },
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });
  });
});
