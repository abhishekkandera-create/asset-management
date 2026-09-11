import { Injectable, Logger } from '@nestjs/common';
import { AssignmentStatus, EmployeeStatus, Prisma } from '@prisma/client';
import {
  Clearance,
  CreateEmployee,
  Employee,
  EmployeeHoldings,
  ErrorCode,
  ExitEmployee,
  ListEmployeesQuery,
  Paginated,
  UpdateEmployee,
} from '@asset/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  BusinessRuleError,
  EmployeeHasOpenAssignmentsError,
  RecordNotFoundError,
} from '../../common/errors';
import {
  daysBetween,
  formatDateOnly,
  formatDateOnlyOrNull,
  paginate,
  parseDateOnly,
  todayUtc,
  toSkipTake,
} from '../../common/utils';
import { ASSIGNMENT_INCLUDE, toAssignment } from '../assignments/assignments.mapper';

const EMPLOYEE_INCLUDE = {
  location: { select: { id: true, name: true, city: true, type: true } },
  reportingManager: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
  _count: { select: { assignments: { where: { status: AssignmentStatus.OPEN } } } },
} satisfies Prisma.EmployeeInclude;

type EmployeeRow = Prisma.EmployeeGetPayload<{ include: typeof EMPLOYEE_INCLUDE }>;

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListEmployeesQuery): Promise<Paginated<Employee>> {
    const where: Prisma.EmployeeWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.department) where.department = query.department;
    if (query.locationId) where.locationId = query.locationId;
    if (query.holdingAssets) {
      where.assignments = { some: { status: AssignmentStatus.OPEN } };
    }
    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { employeeCode: { contains: term, mode: 'insensitive' } },
        { department: { contains: term, mode: 'insensitive' } },
        { designation: { contains: term, mode: 'insensitive' } },
      ];
    }

    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        include: EMPLOYEE_INCLUDE,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        skip,
        take,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return paginate(rows.map(toEmployee), total, query.page, query.pageSize);
  }

  async findOne(id: string): Promise<Employee> {
    const row = await this.prisma.employee.findUnique({ where: { id }, include: EMPLOYEE_INCLUDE });
    if (!row) throw new RecordNotFoundError('Employee', id);
    return toEmployee(row);
  }

  /** Distinct departments, for the filter dropdowns. */
  async departments(): Promise<string[]> {
    const rows = await this.prisma.employee.findMany({
      distinct: ['department'],
      select: { department: true },
      orderBy: { department: 'asc' },
    });
    return rows.map((row) => row.department);
  }

  async create(input: CreateEmployee, actorId: string): Promise<Employee> {
    await this.assertManagerExists(input.reportingManagerId);
    await this.assertLocationExists(input.locationId);

    const row = await this.prisma.employee.create({
      data: {
        employeeCode: input.employeeCode,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone ?? null,
        department: input.department,
        designation: input.designation,
        locationId: input.locationId,
        dateJoined: parseDateOnly(input.dateJoined),
        reportingManagerId: input.reportingManagerId ?? null,
        createdBy: actorId,
        updatedBy: actorId,
      },
      include: EMPLOYEE_INCLUDE,
    });

    return toEmployee(row);
  }

  async update(id: string, input: UpdateEmployee, actorId: string): Promise<Employee> {
    const existing = await this.prisma.employee.findUnique({ where: { id } });
    if (!existing) throw new RecordNotFoundError('Employee', id);

    if (input.reportingManagerId === id) {
      throw new BusinessRuleError(
        ErrorCode.SELF_REPORTING_MANAGER,
        'An employee cannot report to themselves',
      );
    }
    if (input.reportingManagerId) await this.assertManagerExists(input.reportingManagerId);
    if (input.locationId) await this.assertLocationExists(input.locationId);

    const row = await this.prisma.employee.update({
      where: { id },
      data: {
        ...(input.employeeCode ? { employeeCode: input.employeeCode } : {}),
        ...(input.firstName ? { firstName: input.firstName } : {}),
        ...(input.lastName ? { lastName: input.lastName } : {}),
        ...(input.email ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
        ...(input.department ? { department: input.department } : {}),
        ...(input.designation ? { designation: input.designation } : {}),
        ...(input.locationId ? { locationId: input.locationId } : {}),
        ...(input.dateJoined ? { dateJoined: parseDateOnly(input.dateJoined) } : {}),
        ...(input.reportingManagerId !== undefined
          ? { reportingManagerId: input.reportingManagerId ?? null }
          : {}),
        updatedBy: actorId,
      },
      include: EMPLOYEE_INCLUDE,
    });

    return toEmployee(row);
  }

  /** GET /employees/:id/assets — what this person currently holds. */
  async holdings(id: string): Promise<EmployeeHoldings> {
    const employee = await this.prisma.employee.findUnique({ where: { id }, select: { id: true } });
    if (!employee) throw new RecordNotFoundError('Employee', id);

    const assignments = await this.prisma.assignment.findMany({
      where: { employeeId: id, status: AssignmentStatus.OPEN },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { issuedOn: 'desc' },
    });

    return {
      employeeId: id,
      assignments: assignments.map(toAssignment),
      // Bulk items issued to a person live in stock_transaction, which arrives
      // in phase 5 (CLAUDE.md §7.8).
      bulkItems: [],
    };
  }

  /** GET /employees/:id/clearance — what blocks this person's exit (§7.7). */
  async clearance(id: string): Promise<Clearance> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        status: true,
        dateExited: true,
      },
    });
    if (!employee) throw new RecordNotFoundError('Employee', id);

    const open = await this.prisma.assignment.findMany({
      where: { employeeId: id, status: AssignmentStatus.OPEN },
      include: {
        asset: {
          include: {
            model: { include: { category: { select: { name: true } } } },
          },
        },
      },
      orderBy: { issuedOn: 'asc' },
    });

    const today = todayUtc();

    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      fullName: `${employee.firstName} ${employee.lastName}`,
      status: employee.status,
      dateExited: formatDateOnlyOrNull(employee.dateExited),
      openAssignments: open.map((assignment) => ({
        assignmentId: assignment.id,
        assetId: assignment.assetId,
        assetTag: assignment.asset.assetTag,
        serialNumber: assignment.asset.serialNumber,
        categoryName: assignment.asset.model.category.name,
        manufacturer: assignment.asset.model.manufacturer,
        modelName: assignment.asset.model.modelName,
        assetStatus: assignment.asset.status,
        issuedOn: formatDateOnly(assignment.issuedOn),
        expectedReturnOn: formatDateOnlyOrNull(assignment.expectedReturnOn),
        heldForDays: daysBetween(assignment.issuedOn, today),
      })),
      isClear: open.length === 0,
    };
  }

  /**
   * POST /employees/:id/exit — soft-archive only (§2.2). Blocked while the
   * employee still holds anything (§7.7); each item must be returned or
   * written off first.
   */
  async exit(id: string, input: ExitEmployee, actorId: string): Promise<Employee> {
    const dateExited = parseDateOnly(input.dateExited);

    const row = await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({ where: { id } });
      if (!employee) throw new RecordNotFoundError('Employee', id);
      if (employee.status === EmployeeStatus.EXITED) {
        throw new BusinessRuleError(
          ErrorCode.EMPLOYEE_ALREADY_EXITED,
          'This employee has already been marked as exited',
          { dateExited: formatDateOnlyOrNull(employee.dateExited) },
        );
      }
      if (dateExited < employee.dateJoined) {
        throw new BusinessRuleError(
          ErrorCode.VALIDATION_FAILED,
          'The exit date cannot be before the joining date',
          { dateJoined: formatDateOnly(employee.dateJoined) },
        );
      }

      const openCount = await tx.assignment.count({
        where: { employeeId: id, status: AssignmentStatus.OPEN },
      });
      if (openCount > 0) throw new EmployeeHasOpenAssignmentsError(id, openCount);

      return tx.employee.update({
        where: { id },
        data: { status: EmployeeStatus.EXITED, dateExited, updatedBy: actorId },
        include: EMPLOYEE_INCLUDE,
      });
    });

    this.logger.log({ employeeId: id, dateExited: input.dateExited }, 'Employee marked as exited');
    return toEmployee(row);
  }

  private async assertManagerExists(managerId: string | null | undefined): Promise<void> {
    if (!managerId) return;
    const manager = await this.prisma.employee.findUnique({
      where: { id: managerId },
      select: { id: true },
    });
    if (!manager) throw new RecordNotFoundError('Reporting manager', managerId);
  }

  private async assertLocationExists(locationId: string): Promise<void> {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, isActive: true, name: true },
    });
    if (!location) throw new RecordNotFoundError('Location', locationId);
    if (!location.isActive) {
      throw new BusinessRuleError(
        ErrorCode.REFERENCED_RECORD_INACTIVE,
        `${location.name} is inactive`,
        { locationId },
      );
    }
  }
}

export function toEmployee(row: EmployeeRow): Employee {
  return {
    id: row.id,
    employeeCode: row.employeeCode,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: `${row.firstName} ${row.lastName}`,
    email: row.email,
    phone: row.phone,
    department: row.department,
    designation: row.designation,
    locationId: row.locationId,
    dateJoined: formatDateOnly(row.dateJoined),
    dateExited: formatDateOnlyOrNull(row.dateExited),
    status: row.status,
    reportingManagerId: row.reportingManagerId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    location: row.location,
    reportingManager: row.reportingManager
      ? {
          id: row.reportingManager.id,
          employeeCode: row.reportingManager.employeeCode,
          fullName: `${row.reportingManager.firstName} ${row.reportingManager.lastName}`,
        }
      : null,
    openAssignmentCount: row._count.assignments,
  };
}
