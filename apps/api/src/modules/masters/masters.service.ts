import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AssetCategory, AssetModel, Location, Paginated, Vendor } from '@asset/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RecordNotFoundError } from '../../common/errors';
import { paginate, toSkipTake } from '../../common/utils';

type ListQuery = {
  page: number;
  pageSize: number;
  search?: string | undefined;
  isActive?: boolean | undefined;
};

/**
 * Read side of the reference data. Full CRUD for these lands with the Masters
 * screen (CLAUDE.md §9 screen 11); the list endpoints exist now because the
 * asset filters, the model picker and the location picker all need them.
 */
@Injectable()
export class MastersService {
  constructor(private readonly prisma: PrismaService) {}

  async listLocations(
    query: ListQuery & { type?: string | undefined; city?: string | undefined },
  ): Promise<Paginated<Location>> {
    const where: Prisma.LocationWhereInput = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.type) where.type = query.type as Prisma.LocationWhereInput['type'];
    if (query.city) where.city = { equals: query.city, mode: 'insensitive' };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
        { address: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.location.findMany({
        where,
        orderBy: [{ city: 'asc' }, { name: 'asc' }],
        skip,
        take,
      }),
      this.prisma.location.count({ where }),
    ]);

    return paginate(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        address: row.address,
        city: row.city,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async listVendors(
    query: ListQuery & { isServiceCentre?: boolean | undefined },
  ): Promise<Paginated<Vendor>> {
    const where: Prisma.VendorWhereInput = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.isServiceCentre !== undefined) where.isServiceCentre = query.isServiceCentre;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { contactPerson: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { gstin: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.vendor.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
      this.prisma.vendor.count({ where }),
    ]);

    return paginate(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        contactPerson: row.contactPerson,
        phone: row.phone,
        email: row.email,
        gstin: row.gstin,
        address: row.address,
        isServiceCentre: row.isServiceCentre,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async listCategories(
    query: ListQuery & { trackingMode?: string | undefined },
  ): Promise<Paginated<AssetCategory>> {
    const where: Prisma.AssetCategoryWhereInput = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.trackingMode) {
      where.trackingMode = query.trackingMode as Prisma.AssetCategoryWhereInput['trackingMode'];
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.assetCategory.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
      this.prisma.assetCategory.count({ where }),
    ]);

    return paginate(rows.map(toCategory), total, query.page, query.pageSize);
  }

  async listModels(
    query: ListQuery & { categoryId?: string | undefined },
  ): Promise<Paginated<AssetModel>> {
    const where: Prisma.AssetModelWhereInput = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) {
      where.OR = [
        { manufacturer: { contains: query.search, mode: 'insensitive' } },
        { modelName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.assetModel.findMany({
        where,
        include: { category: { select: { id: true, name: true, code: true, trackingMode: true } } },
        orderBy: [{ manufacturer: 'asc' }, { modelName: 'asc' }],
        skip,
        take,
      }),
      this.prisma.assetModel.count({ where }),
    ]);

    return paginate(
      rows.map((row) => ({
        id: row.id,
        categoryId: row.categoryId,
        manufacturer: row.manufacturer,
        modelName: row.modelName,
        specs: (row.specs ?? {}) as Record<string, string | number | boolean>,
        defaultWarrantyMonths: row.defaultWarrantyMonths,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        category: row.category,
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async findCategory(id: string): Promise<AssetCategory> {
    const row = await this.prisma.assetCategory.findUnique({ where: { id } });
    if (!row) throw new RecordNotFoundError('Asset category', id);
    return toCategory(row);
  }
}

function toCategory(row: {
  id: string;
  name: string;
  code: string;
  trackingMode: AssetCategory['trackingMode'];
  requiresSerial: boolean;
  defaultUsefulLifeMonths: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AssetCategory {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    trackingMode: row.trackingMode,
    requiresSerial: row.requiresSerial,
    defaultUsefulLifeMonths: row.defaultUsefulLifeMonths,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
