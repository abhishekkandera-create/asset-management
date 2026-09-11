import { type INestApplication } from '@nestjs/common';
import { AssetStatus, ConditionGrade, LocationType, TrackingMode } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ASSET_STATUSES } from '@asset/shared';
import { type PrismaService } from '../../src/common/prisma/prisma.service';
import { createTestApp, createUser } from '../support/test-app';

describe('health and dashboard (integration)', () => {
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

  async function accessToken(): Promise<string> {
    const user = await createUser(prisma);
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    return body.accessToken as string;
  }

  describe('GET /health', () => {
    it('is reachable without a token and reports the database', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      expect(response.body).toMatchObject({ status: 'ok', checks: { database: 'up' } });
    });
  });

  describe('GET /dashboard/summary', () => {
    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/dashboard/summary').expect(401);
    });

    it('returns every status on an empty database, so the tiles are stable', async () => {
      const token = await accessToken();
      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.assetsByStatus.map((row: { status: string }) => row.status)).toEqual(
        ASSET_STATUSES,
      );
      expect(response.body.totals.assets).toBe(0);
      expect(response.body.assetsByCategory).toEqual([]);
    });

    it('counts assets by status and by category', async () => {
      const token = await accessToken();

      const location = await prisma.location.create({
        data: { name: 'Store', type: LocationType.STORE_ROOM, city: 'Gurugram' },
      });
      const category = await prisma.assetCategory.create({
        data: { name: 'Laptop', code: 'LAP', trackingMode: TrackingMode.SERIALIZED },
      });
      const model = await prisma.assetModel.create({
        data: { categoryId: category.id, manufacturer: 'Dell', modelName: 'Latitude 5440' },
      });

      const statuses = [
        AssetStatus.IN_STOCK,
        AssetStatus.IN_STOCK,
        AssetStatus.ASSIGNED,
        AssetStatus.IN_REPAIR,
      ];
      for (const [index, status] of statuses.entries()) {
        await prisma.asset.create({
          data: {
            assetTag: `LAP-000${index}`,
            modelId: model.id,
            locationId: location.id,
            conditionGrade: ConditionGrade.GOOD,
            status,
          },
        });
      }

      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.totals).toMatchObject({ assets: 4, inStock: 2, assigned: 1 });
      expect(response.body.assetsByCategory).toEqual([
        { categoryId: category.id, categoryName: 'Laptop', count: 4 },
      ]);
    });

    it('counts warranties expiring in the next 30, 60 and 90 days', async () => {
      const token = await accessToken();

      const location = await prisma.location.create({
        data: { name: 'Store', type: LocationType.STORE_ROOM, city: 'Gurugram' },
      });
      const category = await prisma.assetCategory.create({
        data: { name: 'Laptop', code: 'LAP', trackingMode: TrackingMode.SERIALIZED },
      });
      const model = await prisma.assetModel.create({
        data: { categoryId: category.id, manufacturer: 'Dell', modelName: 'Latitude 5440' },
      });

      const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
      const inDays = (days: number) => {
        const date = new Date(today.getTime());
        date.setUTCDate(date.getUTCDate() + days);
        return date;
      };

      // 10 days: in all three buckets. 45: in 60 and 90. 75: in 90 only.
      // -5 (already expired) and a retired asset: in none.
      const fixtures: Array<[string, Date, AssetStatus]> = [
        ['LAP-A', inDays(10), AssetStatus.IN_STOCK],
        ['LAP-B', inDays(45), AssetStatus.IN_STOCK],
        ['LAP-C', inDays(75), AssetStatus.IN_STOCK],
        ['LAP-D', inDays(-5), AssetStatus.IN_STOCK],
        ['LAP-E', inDays(10), AssetStatus.RETIRED],
      ];
      for (const [tag, warrantyExpiresOn, status] of fixtures) {
        await prisma.asset.create({
          data: {
            assetTag: tag,
            modelId: model.id,
            locationId: location.id,
            conditionGrade: ConditionGrade.GOOD,
            status,
            warrantyExpiresOn,
          },
        });
      }

      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.warrantyExpiring).toEqual({ in30Days: 1, in60Days: 2, in90Days: 3 });
    });
  });
});
