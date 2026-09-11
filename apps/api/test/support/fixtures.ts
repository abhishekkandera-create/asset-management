import {
  AssetStatus,
  ConditionGrade,
  EmployeeStatus,
  LocationType,
  TrackingMode,
} from '@prisma/client';
import { type PrismaService } from '../../src/common/prisma/prisma.service';

/**
 * A minimal but realistic world: one store room, one laptop category, one
 * model. Tests add assets and employees to it as they need them.
 */
export interface World {
  locationId: string;
  altLocationId: string;
  categoryId: string;
  modelId: string;
  bulkCategoryId: string;
  bulkModelId: string;
}

export async function buildWorld(prisma: PrismaService): Promise<World> {
  const location = await prisma.location.create({
    data: { name: 'Gurugram Store Room', type: LocationType.STORE_ROOM, city: 'Gurugram' },
  });
  const altLocation = await prisma.location.create({
    data: { name: 'Bengaluru Office', type: LocationType.OFFICE, city: 'Bengaluru' },
  });

  const category = await prisma.assetCategory.create({
    data: {
      name: 'Laptop',
      code: 'LAP',
      trackingMode: TrackingMode.SERIALIZED,
      requiresSerial: true,
    },
  });
  const model = await prisma.assetModel.create({
    data: {
      categoryId: category.id,
      manufacturer: 'Dell',
      modelName: 'Latitude 5440',
      defaultWarrantyMonths: 36,
    },
  });

  const bulkCategory = await prisma.assetCategory.create({
    data: { name: 'Charger', code: 'CHG', trackingMode: TrackingMode.BULK, requiresSerial: false },
  });
  const bulkModel = await prisma.assetModel.create({
    data: { categoryId: bulkCategory.id, manufacturer: 'Dell', modelName: '65W USB-C Adapter' },
  });

  return {
    locationId: location.id,
    altLocationId: altLocation.id,
    categoryId: category.id,
    modelId: model.id,
    bulkCategoryId: bulkCategory.id,
    bulkModelId: bulkModel.id,
  };
}

let assetCounter = 0;
let employeeCounter = 0;

export async function makeAsset(
  prisma: PrismaService,
  world: World,
  overrides: Partial<{
    status: AssetStatus;
    conditionGrade: ConditionGrade;
    locationId: string;
    serialNumber: string | null;
    warrantyExpiresOn: Date | null;
  }> = {},
): Promise<{ id: string; assetTag: string }> {
  assetCounter += 1;
  const assetTag = `LAP-${String(assetCounter).padStart(4, '0')}`;

  const asset = await prisma.asset.create({
    data: {
      assetTag,
      serialNumber:
        overrides.serialNumber === undefined ? `SN-${assetCounter}` : overrides.serialNumber,
      modelId: world.modelId,
      locationId: overrides.locationId ?? world.locationId,
      status: overrides.status ?? AssetStatus.IN_STOCK,
      conditionGrade: overrides.conditionGrade ?? ConditionGrade.GOOD,
      warrantyExpiresOn: overrides.warrantyExpiresOn ?? null,
    },
  });

  return { id: asset.id, assetTag };
}

export async function makeEmployee(
  prisma: PrismaService,
  world: World,
  overrides: Partial<{ status: EmployeeStatus; dateExited: Date; department: string }> = {},
): Promise<{ id: string; fullName: string; employeeCode: string }> {
  employeeCounter += 1;
  const employeeCode = `EMP${1000 + employeeCounter}`;

  const employee = await prisma.employee.create({
    data: {
      employeeCode,
      firstName: 'Test',
      lastName: `Employee${employeeCounter}`,
      email: `${employeeCode.toLowerCase()}@example.com`,
      department: overrides.department ?? 'Engineering',
      designation: 'Software Engineer',
      locationId: world.locationId,
      dateJoined: new Date('2024-01-01T00:00:00Z'),
      status: overrides.status ?? EmployeeStatus.ACTIVE,
      dateExited:
        overrides.status === EmployeeStatus.EXITED
          ? (overrides.dateExited ?? new Date('2026-01-01T00:00:00Z'))
          : null,
    },
  });

  return {
    id: employee.id,
    fullName: `${employee.firstName} ${employee.lastName}`,
    employeeCode,
  };
}

/** Counters are module-level, so reset them when the database is truncated. */
export function resetFixtureCounters(): void {
  assetCounter = 0;
  employeeCounter = 0;
}
