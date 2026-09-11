import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AssetCategory,
  AssetModel,
  CreateAssetModel,
  Location,
  Paginated,
  UpdateAssetModel,
  Vendor,
} from '@asset/shared';
import { ErrorCode } from '@asset/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BusinessRuleError, RecordNotFoundError } from '../../common/errors';
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

    return paginate(rows.map(toModel), total, query.page, query.pageSize);
  }

  /**
   * Specs are a free-form JSON blob because a laptop and a charger share no
   * fields worth naming (CLAUDE.md §5.1). Validation is therefore structural
   * only — keys map to strings, numbers or booleans — and the presentation
   * layer decides how each key is labelled.
   */
  async createModel(input: CreateAssetModel, actorId: string): Promise<AssetModel> {
    const category = await this.prisma.assetCategory.findUnique({
      where: { id: input.categoryId },
      select: { id: true, name: true, isActive: true },
    });
    if (!category) throw new RecordNotFoundError('Asset category', input.categoryId);
    if (!category.isActive) {
      throw new BusinessRuleError(
        ErrorCode.REFERENCED_RECORD_INACTIVE,
        `${category.name} is inactive and cannot take new models`,
        { categoryId: input.categoryId },
      );
    }

    const row = await this.prisma.assetModel.create({
      data: {
        categoryId: input.categoryId,
        manufacturer: input.manufacturer,
        modelName: input.modelName,
        specs: input.specs,
        defaultWarrantyMonths: input.defaultWarrantyMonths ?? null,
        isActive: input.isActive,
        createdBy: actorId,
        updatedBy: actorId,
      },
      include: { category: { select: { id: true, name: true, code: true, trackingMode: true } } },
    });

    return toModel(row);
  }

  async updateModel(id: string, input: UpdateAssetModel, actorId: string): Promise<AssetModel> {
    const existing = await this.prisma.assetModel.findUnique({ where: { id } });
    if (!existing) throw new RecordNotFoundError('Asset model', id);

    // Moving a model to another category would silently reclassify every asset
    // already created against it, including across the serialized/bulk divide.
    if (input.categoryId && input.categoryId !== existing.categoryId) {
      const assetCount = await this.prisma.asset.count({ where: { modelId: id } });
      if (assetCount > 0) {
        throw new BusinessRuleError(
          ErrorCode.RECORD_IN_USE,
          `This model already has ${assetCount} asset${assetCount === 1 ? '' : 's'}, so its category cannot be changed`,
          { modelId: id, assetCount },
        );
      }
    }

    const row = await this.prisma.assetModel.update({
      where: { id },
      data: {
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        ...(input.manufacturer ? { manufacturer: input.manufacturer } : {}),
        ...(input.modelName ? { modelName: input.modelName } : {}),
        ...(input.specs !== undefined ? { specs: input.specs } : {}),
        ...(input.defaultWarrantyMonths !== undefined
          ? { defaultWarrantyMonths: input.defaultWarrantyMonths ?? null }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        updatedBy: actorId,
      },
      include: { category: { select: { id: true, name: true, code: true, trackingMode: true } } },
    });

    return toModel(row);
  }

  async findModel(id: string): Promise<AssetModel> {
    const row = await this.prisma.assetModel.findUnique({
      where: { id },
      include: { category: { select: { id: true, name: true, code: true, trackingMode: true } } },
    });
    if (!row) throw new RecordNotFoundError('Asset model', id);
    return toModel(row);
  }

  async findCategory(id: string): Promise<AssetCategory> {
    const row = await this.prisma.assetCategory.findUnique({ where: { id } });
    if (!row) throw new RecordNotFoundError('Asset category', id);
    return toCategory(row);
  }
}

interface ModelRow {
  id: string;
  categoryId: string;
  manufacturer: string;
  modelName: string;
  specs: unknown;
  defaultWarrantyMonths: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  category?: { id: string; name: string; code: string; trackingMode: AssetCategory['trackingMode'] };
}

function toModel(row: ModelRow): AssetModel {
  return {
    id: row.id,
    categoryId: row.categoryId,
    manufacturer: row.manufacturer,
    modelName: row.modelName,
    specs: (row.specs ?? {}) as Record<string, string | number | boolean>,
    defaultWarrantyMonths: row.defaultWarrantyMonths,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.category ? { category: row.category } : {}),
  };
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
