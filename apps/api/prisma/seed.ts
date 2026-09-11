/**
 * Seeds the fixture described in CLAUDE.md §11. Deterministic: the same run
 * produces the same data, so a bug found on one machine reproduces on another.
 *
 * Phase 1 covers masters, assets, assignments and events. Purchases, stock
 * balances and repair tickets are seeded in phases 4, 5 and 6 respectively;
 * assets that predate the system legitimately have no purchase link, which is
 * why `asset.purchase_item_id` is nullable.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import {
  AssetEventType,
  AssetStatus,
  AssignmentStatus,
  ConditionGrade,
  EmployeeStatus,
  Prisma,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import {
  CATEGORIES,
  DEPARTMENTS,
  DESIGNATIONS_BY_DEPARTMENT,
  FIRST_NAMES,
  LAST_NAMES,
  LOCATIONS,
  MODELS,
  VENDORS,
} from './seed-data';

const prisma = new PrismaClient();

// --- deterministic randomness ----------------------------------------------

/** mulberry32 — small, fast, and identical on every machine. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(20260911);
const randomInt = (min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error('pick() called on an empty list');
  return item;
};

// --- date helpers -----------------------------------------------------------

const TODAY = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  const day = next.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + months);
  if (next.getUTCDate() < day) next.setUTCDate(0);
  return next;
}

/** A `timestamptz` a little after the date it belongs to, for event ordering. */
function instantOn(date: Date, hour: number, minute: number): Date {
  const at = new Date(date.getTime());
  at.setUTCHours(hour - 5, minute - 30, 0, 0); // 09:00 IST -> 03:30 UTC
  return at;
}

/**
 * An asset cannot be issued before it existed. Purchase dates and assignment
 * dates are generated independently, so every issue date is clamped to sit at
 * least a week after the asset was received — otherwise the history reads as
 * chronologically impossible on the very screen the timeline is shown on.
 */
function afterReceipt(asset: SeededAsset, date: Date): Date {
  const earliest = addDays(asset.purchasedOn, 7);
  return date < earliest ? earliest : date;
}

/** Nothing in the fixture may be dated in the future. */
function inThePast(date: Date, atLeastDaysAgo = 1): Date {
  const latest = addDays(TODAY, -atLeastDaysAgo);
  return date > latest ? latest : date;
}

function laterOf(a: Date, b: Date): Date {
  return a > b ? a : b;
}

// --- event collection -------------------------------------------------------

type EventRow = Prisma.AssetEventCreateManyInput;
const events: EventRow[] = [];

function recordEvent(row: Omit<EventRow, 'id'>): void {
  events.push({ id: randomUUID(), ...row });
}

// --- main -------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Seeding IT Asset Management…');
  await wipe();

  const users = await seedAppUsers();
  const locations = await seedLocations(users.system.id);
  await seedVendors(users.system.id);
  const categories = await seedCategories(users.system.id);
  const models = await seedModels(categories, users.system.id);
  const employees = await seedEmployees(locations, users.system.id);
  const assets = await seedAssets(models, locations, users);
  await seedAssignmentsAndHistory(assets, employees, users, locations);

  await prisma.assetEvent.createMany({ data: events });

  await report();
}

/**
 * Deletes in FK order. asset_event has BEFORE DELETE triggers that block row
 * deletes, so it is cleared with a TRUNCATE — which is what the trigger is
 * there to force us to be explicit about.
 */
async function wipe(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "asset_event" CASCADE');
  await prisma.assignment.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.employee.updateMany({ data: { reportingManagerId: null } });
  await prisma.employee.deleteMany();
  await prisma.assetModel.deleteMany();
  await prisma.assetCategory.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.location.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.appUser.deleteMany();
}

// --- app users --------------------------------------------------------------

interface SeededUsers {
  system: { id: string };
  admin: { id: string };
  storeKeeper: { id: string };
  storeKeeperBlr: { id: string };
  viewer: { id: string };
}

async function seedAppUsers(): Promise<SeededUsers> {
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  /**
   * The SYSTEM account owns every record the seed and the scheduled jobs
   * create. It cannot sign in (isActive = false) but it keeps
   * asset_event.performed_by non-null, so no event in the audit trail is ever
   * anonymous.
   */
  const system = await prisma.appUser.create({
    data: {
      email: 'system@asset-management.internal',
      passwordHash,
      fullName: 'System',
      role: UserRole.ADMIN,
      isActive: false,
    },
  });

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const admin = await prisma.appUser.create({
    data: {
      email: adminEmail,
      passwordHash,
      fullName: 'Asha Nair',
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  const storeKeeper = await prisma.appUser.create({
    data: {
      email: 'storekeeper@example.com',
      passwordHash,
      fullName: 'Ramesh Yadav',
      role: UserRole.STORE_KEEPER,
      isActive: true,
    },
  });

  const storeKeeperBlr = await prisma.appUser.create({
    data: {
      email: 'storekeeper.blr@example.com',
      passwordHash,
      fullName: 'Deepa Krishnan',
      role: UserRole.STORE_KEEPER,
      isActive: true,
    },
  });

  const viewer = await prisma.appUser.create({
    data: {
      email: 'viewer@example.com',
      passwordHash,
      fullName: 'Kunal Sethi',
      role: UserRole.VIEWER,
      isActive: true,
    },
  });

  console.log(`  app users: 5 (sign in as ${adminEmail} / ${password})`);
  return { system, admin, storeKeeper, storeKeeperBlr, viewer };
}

// --- masters ----------------------------------------------------------------

type LocationMap = Record<(typeof LOCATIONS)[number]['key'], { id: string; name: string }>;

async function seedLocations(createdBy: string): Promise<LocationMap> {
  const map = {} as LocationMap;
  for (const location of LOCATIONS) {
    const row = await prisma.location.create({
      data: {
        name: location.name,
        type: location.type,
        city: location.city,
        address: location.address,
        isActive: true,
        createdBy,
        updatedBy: createdBy,
      },
    });
    map[location.key] = { id: row.id, name: row.name };
  }
  console.log(`  locations: ${LOCATIONS.length}`);
  return map;
}

async function seedVendors(createdBy: string): Promise<void> {
  await prisma.vendor.createMany({
    data: VENDORS.map((vendor) => ({ ...vendor, isActive: true, createdBy, updatedBy: createdBy })),
  });
  console.log(
    `  vendors: ${VENDORS.length} (${VENDORS.filter((v) => v.isServiceCentre).length} service centres)`,
  );
}

type CategoryMap = Record<
  (typeof CATEGORIES)[number]['key'],
  { id: string; name: string; trackingMode: string }
>;

async function seedCategories(createdBy: string): Promise<CategoryMap> {
  const map = {} as CategoryMap;
  for (const category of CATEGORIES) {
    const row = await prisma.assetCategory.create({
      data: {
        name: category.name,
        code: category.code,
        trackingMode: category.trackingMode,
        requiresSerial: category.requiresSerial,
        defaultUsefulLifeMonths: category.defaultUsefulLifeMonths,
        isActive: true,
        createdBy,
        updatedBy: createdBy,
      },
    });
    map[category.key] = { id: row.id, name: row.name, trackingMode: row.trackingMode };
  }
  console.log(
    `  categories: ${CATEGORIES.length} (${CATEGORIES.filter((c) => c.trackingMode === 'BULK').length} BULK)`,
  );
  return map;
}

interface SeededModel {
  id: string;
  key: string;
  categoryKey: string;
  categoryCode: string;
  manufacturer: string;
  modelName: string;
  warrantyMonths: number;
  isSerialized: boolean;
}

async function seedModels(categories: CategoryMap, createdBy: string): Promise<SeededModel[]> {
  const result: SeededModel[] = [];
  for (const model of MODELS) {
    const category = categories[model.categoryKey];
    const categoryMeta = CATEGORIES.find((c) => c.key === model.categoryKey);
    if (!categoryMeta) throw new Error(`Unknown category ${model.categoryKey}`);

    const row = await prisma.assetModel.create({
      data: {
        categoryId: category.id,
        manufacturer: model.manufacturer,
        modelName: model.modelName,
        specs: model.specs,
        defaultWarrantyMonths: model.defaultWarrantyMonths,
        isActive: true,
        createdBy,
        updatedBy: createdBy,
      },
    });

    result.push({
      id: row.id,
      key: model.key,
      categoryKey: model.categoryKey,
      categoryCode: categoryMeta.code,
      manufacturer: model.manufacturer,
      modelName: model.modelName,
      warrantyMonths: model.defaultWarrantyMonths,
      isSerialized: categoryMeta.trackingMode === 'SERIALIZED',
    });
  }
  console.log(`  models: ${MODELS.length}`);
  return result;
}

// --- employees --------------------------------------------------------------

interface SeededEmployee {
  id: string;
  code: string;
  fullName: string;
  status: EmployeeStatus;
  locationId: string;
}

const EMPLOYEE_COUNT = 60;
const EXITED_EMPLOYEE_COUNT = 5;

async function seedEmployees(
  locations: LocationMap,
  createdBy: string,
): Promise<{ all: SeededEmployee[]; active: SeededEmployee[]; exited: SeededEmployee[] }> {
  const locationIds = [locations['ggn-hq'].id, locations['blr-office'].id, locations['ggn-hq'].id];
  const usedNames = new Set<string>();
  const rows: SeededEmployee[] = [];

  for (let index = 0; index < EMPLOYEE_COUNT; index += 1) {
    let firstName = pick(FIRST_NAMES);
    let lastName = pick(LAST_NAMES);
    let attempts = 0;
    while (usedNames.has(`${firstName} ${lastName}`) && attempts < 50) {
      firstName = pick(FIRST_NAMES);
      lastName = pick(LAST_NAMES);
      attempts += 1;
    }
    usedNames.add(`${firstName} ${lastName}`);

    const department = pick(DEPARTMENTS);
    const designation = pick(DESIGNATIONS_BY_DEPARTMENT[department] ?? ['Associate']);
    // The last few employees are the exited ones, so they always have history.
    const isExited = index >= EMPLOYEE_COUNT - EXITED_EMPLOYEE_COUNT;
    const dateJoined = addDays(TODAY, -randomInt(180, 2200));
    const dateExited = isExited ? addDays(TODAY, -randomInt(10, 150)) : null;

    const employeeCode = `EMP${String(1000 + index + 1)}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}@example.com`;

    const row = await prisma.employee.create({
      data: {
        employeeCode,
        firstName,
        lastName,
        email,
        phone: `+91 9${randomInt(100000000, 999999999)}`,
        department,
        designation,
        locationId: locationIds[index % locationIds.length] ?? locationIds[0]!,
        dateJoined,
        dateExited,
        status: isExited ? EmployeeStatus.EXITED : EmployeeStatus.ACTIVE,
        createdBy,
        updatedBy: createdBy,
      },
    });

    rows.push({
      id: row.id,
      code: employeeCode,
      fullName: `${firstName} ${lastName}`,
      status: row.status,
      locationId: row.locationId,
    });
  }

  // Reporting lines: the first eight active employees are managers.
  const managers = rows.filter((e) => e.status === EmployeeStatus.ACTIVE).slice(0, 8);
  for (const [index, employee] of rows.entries()) {
    if (managers.some((m) => m.id === employee.id)) continue;
    const manager = managers[index % managers.length];
    if (!manager) continue;
    await prisma.employee.update({
      where: { id: employee.id },
      data: { reportingManagerId: manager.id },
    });
  }

  const active = rows.filter((e) => e.status === EmployeeStatus.ACTIVE);
  const exited = rows.filter((e) => e.status === EmployeeStatus.EXITED);
  console.log(`  employees: ${rows.length} (${exited.length} exited)`);
  return { all: rows, active, exited };
}

// --- assets -----------------------------------------------------------------

interface SeededAsset {
  id: string;
  tag: string;
  modelId: string;
  locationId: string;
  status: AssetStatus;
  purchasedOn: Date;
}

/**
 * 200 serialized assets. The distribution is chosen so that every status in
 * the state machine has real rows behind it and the dashboard has something to
 * show on a fresh database (CLAUDE.md §11).
 */
const ASSET_PLAN = {
  [AssetStatus.ASSIGNED]: 60,
  [AssetStatus.IN_STOCK]: 92,
  [AssetStatus.RETURNED_PENDING_CHECK]: 12,
  [AssetStatus.IN_REPAIR]: 14,
  [AssetStatus.RETIRED]: 12,
  [AssetStatus.LOST]: 10,
} as const;

const CONDITION_BY_STATUS: Record<AssetStatus, ConditionGrade[]> = {
  IN_STOCK: [ConditionGrade.NEW, ConditionGrade.GOOD, ConditionGrade.GOOD, ConditionGrade.FAIR],
  ASSIGNED: [ConditionGrade.NEW, ConditionGrade.GOOD, ConditionGrade.GOOD, ConditionGrade.FAIR],
  RETURNED_PENDING_CHECK: [ConditionGrade.GOOD, ConditionGrade.FAIR, ConditionGrade.POOR],
  IN_REPAIR: [ConditionGrade.POOR, ConditionGrade.DAMAGED],
  RETIRED: [ConditionGrade.POOR, ConditionGrade.DAMAGED],
  LOST: [ConditionGrade.GOOD, ConditionGrade.FAIR],
};

async function seedAssets(
  models: SeededModel[],
  locations: LocationMap,
  users: SeededUsers,
): Promise<SeededAsset[]> {
  const serializedModels = models.filter((m) => m.isSerialized);
  const storeRoom = locations['ggn-store'].id;
  const blr = locations['blr-office'].id;
  const hq = locations['ggn-hq'].id;
  const locationPool = [storeRoom, storeRoom, hq, blr];

  const plan: AssetStatus[] = [];
  for (const [status, count] of Object.entries(ASSET_PLAN)) {
    for (let i = 0; i < count; i += 1) plan.push(status as AssetStatus);
  }

  const tagCounters = new Map<string, number>();
  const created: SeededAsset[] = [];

  for (const [index, status] of plan.entries()) {
    const model = serializedModels[index % serializedModels.length]!;
    const nextNumber = (tagCounters.get(model.categoryCode) ?? 0) + 1;
    tagCounters.set(model.categoryCode, nextNumber);

    const assetTag = `${model.categoryCode}-${String(nextNumber).padStart(4, '0')}`;
    const purchasedOn = addDays(TODAY, -randomInt(500, 2400));
    // Warranty is computed once, at creation, and stored (CLAUDE.md §7.6).
    const warrantyExpiresOn = addMonths(purchasedOn, model.warrantyMonths);
    const grades = CONDITION_BY_STATUS[status];
    const conditionGrade = grades[index % grades.length]!;

    const asset = await prisma.asset.create({
      data: {
        assetTag,
        serialNumber:
          model.categoryKey === 'headset'
            ? null // headsets are serialized but the category does not require a serial
            : // `index` is unique across the whole run, which keeps serials unique
              // regardless of how many manufacturers share a two-letter prefix.
              `${model.manufacturer.slice(0, 2).toUpperCase()}${String(500000 + index)}`,
        modelId: model.id,
        status,
        conditionGrade,
        locationId: locationPool[index % locationPool.length]!,
        warrantyExpiresOn,
        notes: null,
        createdBy: users.system.id,
        updatedBy: users.system.id,
      },
    });

    // Every asset starts life with a receipt event, so the history page is
    // never empty (CLAUDE.md §5.4).
    recordEvent({
      assetId: asset.id,
      eventType: index % 3 === 0 ? AssetEventType.PURCHASED : AssetEventType.STOCK_IN,
      occurredAt: instantOn(purchasedOn, 10, 15),
      performedBy: users.system.id,
      fromStatus: null,
      toStatus: AssetStatus.IN_STOCK,
      locationId: asset.locationId,
      notes:
        index % 3 === 0
          ? 'Received against purchase order and tagged'
          : 'Added to stock during opening inventory count',
    });

    created.push({
      id: asset.id,
      tag: assetTag,
      modelId: model.id,
      locationId: asset.locationId,
      status,
      purchasedOn,
    });
  }

  console.log(`  assets: ${created.length}`);
  return created;
}

// --- assignments and the rest of the history --------------------------------

/**
 * Builds 120 assignments and the events that go with them, arranged so the
 * fixture demonstrates every interesting case:
 *  - assets with three and four successive holders
 *  - assets sitting in RETURNED_PENDING_CHECK awaiting inspection
 *  - assets in repair that still have an open assignment (CLAUDE.md §12 phase 6)
 *  - exited employees who returned everything, and one whose laptop was
 *    written off
 */
async function seedAssignmentsAndHistory(
  assets: SeededAsset[],
  employees: { all: SeededEmployee[]; active: SeededEmployee[]; exited: SeededEmployee[] },
  users: SeededUsers,
  locations: LocationMap,
): Promise<void> {
  const byStatus = (status: AssetStatus): SeededAsset[] =>
    assets.filter((asset) => asset.status === status);

  const assigned = byStatus(AssetStatus.ASSIGNED);
  const pendingCheck = byStatus(AssetStatus.RETURNED_PENDING_CHECK);
  const inRepair = byStatus(AssetStatus.IN_REPAIR);
  const retired = byStatus(AssetStatus.RETIRED);
  const lost = byStatus(AssetStatus.LOST);
  const inStock = byStatus(AssetStatus.IN_STOCK);

  const issuers = [users.admin, users.storeKeeper, users.storeKeeperBlr];
  let assignmentCount = 0;

  const nextEmployee = (offset: number): SeededEmployee =>
    employees.active[offset % employees.active.length]!;

  /** One closed assignment: issued, returned, inspected back to stock. */
  async function closedAssignment(
    asset: SeededAsset,
    employee: SeededEmployee,
    requestedIssuedOn: Date,
    requestedReturnedOn: Date,
    options: { transferred?: boolean } = {},
  ): Promise<void> {
    // Issued after the asset existed, returned after it was issued, and
    // neither in the future.
    const issuedOn = inThePast(afterReceipt(asset, requestedIssuedOn), 2);
    const returnedOn = inThePast(laterOf(requestedReturnedOn, addDays(issuedOn, 1)));
    const issuer = pick(issuers);
    const receiver = pick(issuers);
    const conditionOut = pick([ConditionGrade.NEW, ConditionGrade.GOOD]);
    const conditionIn = pick([ConditionGrade.GOOD, ConditionGrade.FAIR]);

    const assignment = await prisma.assignment.create({
      data: {
        assetId: asset.id,
        employeeId: employee.id,
        issuedOn,
        issuedBy: issuer.id,
        conditionOut,
        issueRemarks: 'Issued as part of standard hardware allocation',
        returnedOn,
        closedOn: returnedOn,
        receivedBy: receiver.id,
        conditionIn,
        returnRemarks: options.transferred
          ? 'Returned for immediate reissue to another employee'
          : 'Returned in working order',
        status: AssignmentStatus.CLOSED,
      },
    });
    assignmentCount += 1;

    recordEvent({
      assetId: asset.id,
      eventType: AssetEventType.ISSUED,
      occurredAt: instantOn(issuedOn, 11, 0),
      performedBy: issuer.id,
      fromStatus: AssetStatus.IN_STOCK,
      toStatus: AssetStatus.ASSIGNED,
      employeeId: employee.id,
      locationId: employee.locationId,
      referenceType: 'ASSIGNMENT',
      referenceId: assignment.id,
      notes: `Issued to ${employee.fullName} (${employee.code})`,
    });

    recordEvent({
      assetId: asset.id,
      eventType: options.transferred ? AssetEventType.TRANSFERRED : AssetEventType.RETURNED,
      occurredAt: instantOn(returnedOn, 15, 30),
      performedBy: receiver.id,
      fromStatus: AssetStatus.ASSIGNED,
      toStatus: AssetStatus.RETURNED_PENDING_CHECK,
      employeeId: employee.id,
      referenceType: 'ASSIGNMENT',
      referenceId: assignment.id,
      notes: `Returned by ${employee.fullName}, condition recorded as ${conditionIn}`,
    });

    recordEvent({
      assetId: asset.id,
      eventType: AssetEventType.INSPECTED,
      occurredAt: instantOn(returnedOn, 16, 45),
      performedBy: receiver.id,
      fromStatus: AssetStatus.RETURNED_PENDING_CHECK,
      toStatus: AssetStatus.IN_STOCK,
      referenceType: 'ASSIGNMENT',
      referenceId: assignment.id,
      notes: 'Inspected, wiped and returned to stock',
    });
  }

  /** One open assignment: the asset is currently held by this employee. */
  async function openAssignment(
    asset: SeededAsset,
    employee: SeededEmployee,
    requestedIssuedOn: Date,
    options: { expectedReturnOn?: Date } = {},
  ): Promise<string> {
    const issuedOn = inThePast(afterReceipt(asset, requestedIssuedOn));
    const issuer = pick(issuers);
    const conditionOut = pick([ConditionGrade.NEW, ConditionGrade.GOOD, ConditionGrade.FAIR]);

    const assignment = await prisma.assignment.create({
      data: {
        assetId: asset.id,
        employeeId: employee.id,
        issuedOn,
        issuedBy: issuer.id,
        expectedReturnOn: options.expectedReturnOn ?? null,
        conditionOut,
        issueRemarks: options.expectedReturnOn
          ? 'Temporary loan — expected back on the date shown'
          : 'Issued as part of standard hardware allocation',
        status: AssignmentStatus.OPEN,
      },
    });
    assignmentCount += 1;

    recordEvent({
      assetId: asset.id,
      eventType: AssetEventType.ISSUED,
      occurredAt: instantOn(issuedOn, 11, 0),
      performedBy: issuer.id,
      fromStatus: AssetStatus.IN_STOCK,
      toStatus: AssetStatus.ASSIGNED,
      employeeId: employee.id,
      locationId: employee.locationId,
      referenceType: 'ASSIGNMENT',
      referenceId: assignment.id,
      notes: `Issued to ${employee.fullName} (${employee.code})`,
    });

    return assignment.id;
  }

  // 1. Currently assigned assets. The first ten carry a long history so the
  //    asset detail timeline has something substantial to show.
  let employeeCursor = 0;
  for (const [index, asset] of assigned.entries()) {
    const priorHolders = index < 6 ? 3 : index < 10 ? 2 : 0;
    let cursorDate = afterReceipt(asset, addDays(TODAY, -randomInt(700, 1400)));

    for (let holder = 0; holder < priorHolders; holder += 1) {
      const heldDays = randomInt(90, 200);
      const returnedOn = addDays(cursorDate, heldDays);
      await closedAssignment(asset, nextEmployee(employeeCursor), cursorDate, returnedOn, {
        transferred: holder === 1,
      });
      employeeCursor += 1;
      cursorDate = addDays(returnedOn, randomInt(3, 20));
    }

    const issuedOn =
      priorHolders > 0 ? cursorDate : afterReceipt(asset, addDays(TODAY, -randomInt(20, 500)));
    // A handful of open assignments are temporary loans with a due date, two of
    // which are already overdue so the reports have something to find.
    const expectedReturnOn =
      index % 9 === 0
        ? addDays(TODAY, index % 18 === 0 ? -randomInt(5, 40) : randomInt(10, 60))
        : undefined;

    await openAssignment(asset, nextEmployee(employeeCursor), issuedOn, { expectedReturnOn });
    employeeCursor += 1;
  }

  // 2. Assets returned but not yet inspected — the deliberate gate that stops
  //    damaged hardware being reissued (CLAUDE.md §7.4).
  for (const asset of pendingCheck) {
    const employee = nextEmployee(employeeCursor);
    employeeCursor += 1;
    const issuedOn = afterReceipt(asset, addDays(TODAY, -randomInt(200, 600)));
    const returnedOn = addDays(TODAY, -randomInt(1, 12));
    const issuer = pick(issuers);
    const receiver = pick(issuers);
    const conditionIn = pick([ConditionGrade.FAIR, ConditionGrade.POOR, ConditionGrade.DAMAGED]);

    const assignment = await prisma.assignment.create({
      data: {
        assetId: asset.id,
        employeeId: employee.id,
        issuedOn,
        issuedBy: issuer.id,
        conditionOut: ConditionGrade.GOOD,
        issueRemarks: 'Issued as part of standard hardware allocation',
        returnedOn,
        closedOn: returnedOn,
        receivedBy: receiver.id,
        conditionIn,
        returnRemarks: 'Returned at desk handover; awaiting inspection',
        status: AssignmentStatus.CLOSED,
      },
    });
    assignmentCount += 1;

    recordEvent({
      assetId: asset.id,
      eventType: AssetEventType.ISSUED,
      occurredAt: instantOn(issuedOn, 11, 0),
      performedBy: issuer.id,
      fromStatus: AssetStatus.IN_STOCK,
      toStatus: AssetStatus.ASSIGNED,
      employeeId: employee.id,
      referenceType: 'ASSIGNMENT',
      referenceId: assignment.id,
      notes: `Issued to ${employee.fullName} (${employee.code})`,
    });
    recordEvent({
      assetId: asset.id,
      eventType: AssetEventType.RETURNED,
      occurredAt: instantOn(returnedOn, 15, 30),
      performedBy: receiver.id,
      fromStatus: AssetStatus.ASSIGNED,
      toStatus: AssetStatus.RETURNED_PENDING_CHECK,
      employeeId: employee.id,
      referenceType: 'ASSIGNMENT',
      referenceId: assignment.id,
      notes: `Returned by ${employee.fullName}, condition recorded as ${conditionIn}`,
    });
  }

  // 3. Assets in repair. Six were pulled from an active holder and keep their
  //    open assignment, so "who holds it" and "where is it" differ — exactly
  //    the case the asset detail page has to render honestly.
  for (const [index, asset] of inRepair.entries()) {
    const sentOn = addDays(TODAY, -randomInt(3, 40));
    const keepsHolder = index < 6;

    if (keepsHolder) {
      const employee = nextEmployee(employeeCursor);
      employeeCursor += 1;
      await openAssignment(asset, employee, afterReceipt(asset, addDays(sentOn, -randomInt(120, 400))));
      recordEvent({
        assetId: asset.id,
        eventType: AssetEventType.SENT_FOR_REPAIR,
        occurredAt: instantOn(sentOn, 12, 0),
        performedBy: users.storeKeeper.id,
        fromStatus: AssetStatus.ASSIGNED,
        toStatus: AssetStatus.IN_REPAIR,
        employeeId: employee.id,
        notes: 'Fault reported by the holder; sent to the service centre. Assignment stays open.',
      });
    } else {
      recordEvent({
        assetId: asset.id,
        eventType: AssetEventType.SENT_FOR_REPAIR,
        occurredAt: instantOn(sentOn, 12, 0),
        performedBy: users.storeKeeper.id,
        fromStatus: AssetStatus.IN_STOCK,
        toStatus: AssetStatus.IN_REPAIR,
        notes: 'Fault found during a stock check; sent to the service centre',
      });
    }
  }

  // 4. Lost assets. Four went missing while issued, which writes off the
  //    assignment without a physical return (CLAUDE.md §5.3).
  for (const [index, asset] of lost.entries()) {
    if (index < 4) {
      const employee = index < 2 ? employees.exited[index]! : nextEmployee(employeeCursor);
      if (index >= 2) employeeCursor += 1;
      const issuedOn = inThePast(
        afterReceipt(asset, addDays(TODAY, -randomInt(300, 800))),
        30,
      );
      const lostOn = inThePast(addDays(issuedOn, randomInt(60, 250)), 5);
      const issuer = pick(issuers);

      const assignment = await prisma.assignment.create({
        data: {
          assetId: asset.id,
          employeeId: employee.id,
          issuedOn,
          issuedBy: issuer.id,
          conditionOut: ConditionGrade.GOOD,
          issueRemarks: 'Issued as part of standard hardware allocation',
          closedOn: lostOn,
          returnRemarks: 'Not returned — reported lost',
          status: AssignmentStatus.WRITTEN_OFF,
        },
      });
      assignmentCount += 1;

      recordEvent({
        assetId: asset.id,
        eventType: AssetEventType.ISSUED,
        occurredAt: instantOn(issuedOn, 11, 0),
        performedBy: issuer.id,
        fromStatus: AssetStatus.IN_STOCK,
        toStatus: AssetStatus.ASSIGNED,
        employeeId: employee.id,
        referenceType: 'ASSIGNMENT',
        referenceId: assignment.id,
        notes: `Issued to ${employee.fullName} (${employee.code})`,
      });
      recordEvent({
        assetId: asset.id,
        eventType: AssetEventType.WRITTEN_OFF,
        occurredAt: instantOn(lostOn, 14, 0),
        performedBy: users.admin.id,
        employeeId: employee.id,
        referenceType: 'ASSIGNMENT',
        referenceId: assignment.id,
        notes: 'Assignment written off at exit clearance — device not returned',
      });
      recordEvent({
        assetId: asset.id,
        eventType: AssetEventType.MARKED_LOST,
        occurredAt: instantOn(lostOn, 14, 5),
        performedBy: users.admin.id,
        fromStatus: AssetStatus.ASSIGNED,
        toStatus: AssetStatus.LOST,
        employeeId: employee.id,
        notes: 'Reported lost by the holder; police complaint reference on file',
      });
    } else {
      const lostOn = inThePast(afterReceipt(asset, addDays(TODAY, -randomInt(20, 300))), 5);
      recordEvent({
        assetId: asset.id,
        eventType: AssetEventType.MARKED_LOST,
        occurredAt: instantOn(lostOn, 14, 0),
        performedBy: users.admin.id,
        fromStatus: AssetStatus.IN_STOCK,
        toStatus: AssetStatus.LOST,
        notes: 'Not found during the quarterly stock audit',
      });
    }
  }

  // 5. Retired assets, several of which had a holder first.
  for (const [index, asset] of retired.entries()) {
    let retiredOn = inThePast(afterReceipt(asset, addDays(TODAY, -randomInt(10, 250))), 2);
    if (index < 6) {
      const employee = nextEmployee(employeeCursor);
      employeeCursor += 1;
      const issuedOn = inThePast(afterReceipt(asset, addDays(TODAY, -randomInt(400, 900))), 40);
      const returnedOn = inThePast(addDays(issuedOn, randomInt(200, 500)), 10);
      await closedAssignment(asset, employee, issuedOn, returnedOn);
      // Retired after it came back, not before.
      retiredOn = inThePast(laterOf(retiredOn, addDays(returnedOn, randomInt(2, 20))), 1);
    }
    recordEvent({
      assetId: asset.id,
      eventType: AssetEventType.RETIRED,
      occurredAt: instantOn(retiredOn, 16, 0),
      performedBy: users.admin.id,
      fromStatus: index < 6 ? AssetStatus.RETURNED_PENDING_CHECK : AssetStatus.IN_STOCK,
      toStatus: AssetStatus.RETIRED,
      notes:
        index % 2 === 0
          ? 'Beyond economical repair; scheduled for e-waste disposal'
          : 'End of useful life; replaced under the refresh cycle',
    });
  }

  // 6. Stock assets with a past life, including the exited employees who
  //    returned everything properly — the happy path for exit clearance.
  const historyStock = inStock.slice(0, 6);
  for (const [index, asset] of historyStock.entries()) {
    const employee =
      index < employees.exited.length ? employees.exited[index]! : nextEmployee(employeeCursor);
    if (index >= employees.exited.length) employeeCursor += 1;

    const issuedOn = afterReceipt(asset, addDays(TODAY, -randomInt(500, 1100)));
    const returnedOn = addDays(issuedOn, randomInt(200, 400));
    await closedAssignment(asset, employee, issuedOn, returnedOn);
  }

  // 7. A repair that completed, and a correction note — so REPAIR_COMPLETED
  //    and NOTE_ADDED are present in the fixture too (CLAUDE.md §11).
  const repairedAsset = inStock[20];
  if (repairedAsset) {
    const sentOn = addDays(TODAY, -120);
    const backOn = addDays(TODAY, -95);
    recordEvent({
      assetId: repairedAsset.id,
      eventType: AssetEventType.SENT_FOR_REPAIR,
      occurredAt: instantOn(sentOn, 12, 0),
      performedBy: users.storeKeeper.id,
      fromStatus: AssetStatus.IN_STOCK,
      toStatus: AssetStatus.IN_REPAIR,
      notes: 'Keyboard unresponsive; sent to CareFix Authorised Service Centre',
    });
    recordEvent({
      assetId: repairedAsset.id,
      eventType: AssetEventType.REPAIR_COMPLETED,
      occurredAt: instantOn(backOn, 11, 0),
      performedBy: users.storeKeeper.id,
      fromStatus: AssetStatus.IN_REPAIR,
      toStatus: AssetStatus.IN_STOCK,
      notes: 'Keyboard assembly replaced under warranty; returned to stock',
    });
  }

  const correctedAsset = inStock[21];
  if (correctedAsset) {
    recordEvent({
      assetId: correctedAsset.id,
      eventType: AssetEventType.NOTE_ADDED,
      occurredAt: instantOn(addDays(TODAY, -45), 10, 30),
      performedBy: users.admin.id,
      notes:
        'Serial number corrected from DL100493 to DL100439 — original tag was misread at receipt',
    });
  }

  const relocatedAsset = inStock[22];
  if (relocatedAsset) {
    recordEvent({
      assetId: relocatedAsset.id,
      eventType: AssetEventType.TRANSFERRED,
      occurredAt: instantOn(addDays(TODAY, -30), 13, 0),
      performedBy: users.storeKeeper.id,
      locationId: locations['blr-office'].id,
      notes: 'Moved from Gurugram Store Room to Bengaluru Office to cover a shortfall',
    });
  }

  console.log(`  assignments: ${assignmentCount}`);
}

// --- report -----------------------------------------------------------------

async function report(): Promise<void> {
  const [assetsByStatus, openAssignments, eventCount, multiHolder] = await Promise.all([
    prisma.asset.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.assignment.count({ where: { status: AssignmentStatus.OPEN } }),
    prisma.assetEvent.count(),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT "asset_id" FROM "assignment"
        GROUP BY "asset_id" HAVING COUNT(DISTINCT "employee_id") >= 3
      ) AS multi
    `,
  ]);

  console.log('\nSeed complete.');
  console.log('  assets by status:');
  for (const group of assetsByStatus.sort((a, b) => a.status.localeCompare(b.status))) {
    console.log(`    ${group.status.padEnd(24)} ${group._count._all}`);
  }
  console.log(`  open assignments: ${openAssignments}`);
  console.log(`  assets with 3+ distinct holders: ${Number(multiHolder[0]?.count ?? 0)}`);
  console.log(`  asset events: ${eventCount}`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
