import { Injectable } from '@nestjs/common';
import { AssetStatus as PrismaAssetStatus, AssignmentStatus, EmployeeStatus } from '@prisma/client';
import { ASSET_STATUSES, AssetStatus, DashboardSummary } from '@asset/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { addDays, todayUtc } from '../../common/utils';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(): Promise<DashboardSummary> {
    const today = todayUtc();
    const in30 = addDays(today, 30);
    const in60 = addDays(today, 60);
    const in90 = addDays(today, 90);

    const [statusGroups, categoryRows, employeesActive, openAssignments, warranty] =
      await Promise.all([
        this.prisma.asset.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.$queryRaw<Array<{ categoryId: string; categoryName: string; count: bigint }>>`
          SELECT c."id"   AS "categoryId",
                 c."name" AS "categoryName",
                 COUNT(a."id") AS "count"
          FROM "asset_category" c
          JOIN "asset_model" m ON m."category_id" = c."id"
          JOIN "asset" a       ON a."model_id"    = m."id"
          GROUP BY c."id", c."name"
          ORDER BY COUNT(a."id") DESC
        `,
        this.prisma.employee.count({ where: { status: EmployeeStatus.ACTIVE } }),
        this.prisma.assignment.count({ where: { status: AssignmentStatus.OPEN } }),
        this.warrantyBuckets(today, in30, in60, in90),
      ]);

    const counts = new Map<string, number>(
      statusGroups.map((group) => [group.status, group._count._all]),
    );
    // Every status appears, including the ones with no assets, so the
    // dashboard renders a stable set of tiles rather than a shifting one.
    const assetsByStatus = ASSET_STATUSES.map((status: AssetStatus) => ({
      status,
      count: counts.get(status) ?? 0,
    }));

    const total = assetsByStatus.reduce((sum, row) => sum + row.count, 0);

    return {
      assetsByStatus,
      totals: {
        assets: total,
        assigned: counts.get(PrismaAssetStatus.ASSIGNED) ?? 0,
        inStock: counts.get(PrismaAssetStatus.IN_STOCK) ?? 0,
        employeesActive,
        openAssignments,
        // Repair tickets arrive in phase 6; the tile renders zero until then.
        openRepairTickets: 0,
      },
      warrantyExpiring: warranty,
      // Bulk stock arrives in phase 5.
      lowStock: [],
      assetsByCategory: categoryRows.map((row) => ({
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        count: Number(row.count),
      })),
    };
  }

  /**
   * Warranties expiring within 30/60/90 days. Retired and lost assets are
   * excluded — nobody needs to be warned about hardware they no longer have.
   */
  private async warrantyBuckets(
    today: Date,
    in30: Date,
    in60: Date,
    in90: Date,
  ): Promise<DashboardSummary['warrantyExpiring']> {
    const notGone = {
      status: { notIn: [PrismaAssetStatus.RETIRED, PrismaAssetStatus.LOST] },
    };

    const [in30Days, in60Days, in90Days] = await Promise.all([
      this.prisma.asset.count({
        where: { ...notGone, warrantyExpiresOn: { gte: today, lte: in30 } },
      }),
      this.prisma.asset.count({
        where: { ...notGone, warrantyExpiresOn: { gte: today, lte: in60 } },
      }),
      this.prisma.asset.count({
        where: { ...notGone, warrantyExpiresOn: { gte: today, lte: in90 } },
      }),
    ]);

    return { in30Days, in60Days, in90Days };
  }
}
