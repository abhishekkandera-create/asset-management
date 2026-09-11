import { Injectable } from '@nestjs/common';
import { AssignmentStatus, Prisma } from '@prisma/client';
import type { Asset, ListAssetsQuery } from '@asset/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { addDays, formatDateOnlyOrNull, todayUtc, toSkipTake } from '../../common/utils';

/**
 * The current holder is never a column — it is read from the single OPEN row
 * in `assignment` (CLAUDE.md §2.1). Including at most one open assignment per
 * asset is how every read in this file derives it.
 */
export const ASSET_INCLUDE = {
  model: {
    include: {
      category: { select: { id: true, name: true, code: true, trackingMode: true } },
    },
  },
  location: { select: { id: true, name: true, city: true, type: true } },
  assignments: {
    where: { status: AssignmentStatus.OPEN },
    take: 1,
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          department: true,
          email: true,
        },
      },
    },
  },
} satisfies Prisma.AssetInclude;

export type AssetRow = Prisma.AssetGetPayload<{ include: typeof ASSET_INCLUDE }>;

@Injectable()
export class AssetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<AssetRow | null> {
    return this.prisma.asset.findUnique({ where: { id }, include: ASSET_INCLUDE });
  }

  async findByTag(assetTag: string): Promise<AssetRow | null> {
    return this.prisma.asset.findUnique({ where: { assetTag }, include: ASSET_INCLUDE });
  }

  async list(query: ListAssetsQuery): Promise<{ rows: AssetRow[]; total: number }> {
    const where = buildAssetWhere(query);
    const { skip, take } = toSkipTake(query.page, query.pageSize);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.asset.findMany({
        where,
        include: ASSET_INCLUDE,
        orderBy: buildAssetOrderBy(query),
        skip,
        take,
      }),
      this.prisma.asset.count({ where }),
    ]);

    return { rows, total };
  }

  /** Unpaginated, for CSV/XLSX export. Capped so a stray call cannot OOM. */
  async listForExport(query: ListAssetsQuery, limit = 10_000): Promise<AssetRow[]> {
    return this.prisma.asset.findMany({
      where: buildAssetWhere(query),
      include: ASSET_INCLUDE,
      orderBy: buildAssetOrderBy(query),
      take: limit,
    });
  }
}

export function buildAssetWhere(query: ListAssetsQuery): Prisma.AssetWhereInput {
  const where: Prisma.AssetWhereInput = {};

  if (query.status) {
    where.status = Array.isArray(query.status) ? { in: query.status } : query.status;
  }
  if (query.modelId) where.modelId = query.modelId;
  if (query.locationId) where.locationId = query.locationId;
  if (query.conditionGrade) where.conditionGrade = query.conditionGrade;
  if (query.categoryId) where.model = { categoryId: query.categoryId };

  // "Held by this employee" is a question about the assignment ledger, not
  // about a column on the asset.
  if (query.employeeId) {
    where.assignments = {
      some: { employeeId: query.employeeId, status: AssignmentStatus.OPEN },
    };
  }

  if (query.warrantyExpiringInDays !== undefined) {
    const today = todayUtc();
    where.warrantyExpiresOn = { gte: today, lte: addDays(today, query.warrantyExpiringInDays) };
  }

  if (query.search) {
    const term = query.search.trim();
    where.OR = [
      { assetTag: { contains: term, mode: 'insensitive' } },
      { serialNumber: { contains: term, mode: 'insensitive' } },
      { model: { modelName: { contains: term, mode: 'insensitive' } } },
      { model: { manufacturer: { contains: term, mode: 'insensitive' } } },
      { notes: { contains: term, mode: 'insensitive' } },
    ];
  }

  return where;
}

function buildAssetOrderBy(query: ListAssetsQuery): Prisma.AssetOrderByWithRelationInput[] {
  const direction = query.sortOrder;
  switch (query.sortBy) {
    case 'createdAt':
      return [{ createdAt: direction }, { assetTag: 'asc' }];
    case 'status':
      return [{ status: direction }, { assetTag: 'asc' }];
    case 'warrantyExpiresOn':
      // Assets with no warranty date sort last whichever way the user sorts.
      return [{ warrantyExpiresOn: { sort: direction, nulls: 'last' } }, { assetTag: 'asc' }];
    default:
      return [{ assetTag: direction }];
  }
}

/** Row -> API shape, with the holder derived from the open assignment. */
export function toAsset(row: AssetRow): Asset {
  const open = row.assignments[0];

  return {
    id: row.id,
    assetTag: row.assetTag,
    serialNumber: row.serialNumber,
    modelId: row.modelId,
    status: row.status,
    conditionGrade: row.conditionGrade,
    locationId: row.locationId,
    purchaseItemId: row.purchaseItemId,
    warrantyExpiresOn: formatDateOnlyOrNull(row.warrantyExpiresOn),
    notes: row.notes,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    model: {
      id: row.model.id,
      categoryId: row.model.categoryId,
      manufacturer: row.model.manufacturer,
      modelName: row.model.modelName,
      specs: (row.model.specs ?? {}) as Record<string, string | number | boolean>,
      defaultWarrantyMonths: row.model.defaultWarrantyMonths,
      isActive: row.model.isActive,
      category: row.model.category,
    },
    location: row.location,
    currentHolder: open
      ? {
          assignmentId: open.id,
          employeeId: open.employeeId,
          employeeCode: open.employee.employeeCode,
          fullName: `${open.employee.firstName} ${open.employee.lastName}`,
          department: open.employee.department,
          email: open.employee.email,
          issuedOn: formatDateOnlyOrNull(open.issuedOn) ?? '',
          expectedReturnOn: formatDateOnlyOrNull(open.expectedReturnOn),
        }
      : null,
  };
}
