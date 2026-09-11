import { type Prisma } from '@prisma/client';
import type { Assignment } from '@asset/shared';
import { daysBetween, formatDateOnly, formatDateOnlyOrNull, todayUtc } from '../../common/utils';

export const ASSIGNMENT_INCLUDE = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      department: true,
      status: true,
    },
  },
  asset: {
    include: { model: { include: { category: { select: { name: true } } } } },
  },
  issuer: { select: { id: true, fullName: true, email: true } },
  receiver: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.AssignmentInclude;

export type AssignmentRow = Prisma.AssignmentGetPayload<{ include: typeof ASSIGNMENT_INCLUDE }>;

export function toAssignment(row: AssignmentRow): Assignment {
  // An open assignment is measured to today; a closed one to the day it closed.
  const end = row.closedOn ?? todayUtc();

  return {
    id: row.id,
    assetId: row.assetId,
    employeeId: row.employeeId,
    issuedOn: formatDateOnly(row.issuedOn),
    issuedBy: row.issuedBy,
    expectedReturnOn: formatDateOnlyOrNull(row.expectedReturnOn),
    conditionOut: row.conditionOut,
    issueRemarks: row.issueRemarks,
    returnedOn: formatDateOnlyOrNull(row.returnedOn),
    closedOn: formatDateOnlyOrNull(row.closedOn),
    receivedBy: row.receivedBy,
    conditionIn: row.conditionIn,
    returnRemarks: row.returnRemarks,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    employee: {
      id: row.employee.id,
      employeeCode: row.employee.employeeCode,
      fullName: `${row.employee.firstName} ${row.employee.lastName}`,
      department: row.employee.department,
      status: row.employee.status,
    },
    asset: {
      id: row.asset.id,
      assetTag: row.asset.assetTag,
      serialNumber: row.asset.serialNumber,
      status: row.asset.status,
      modelName: row.asset.model.modelName,
      manufacturer: row.asset.model.manufacturer,
      categoryName: row.asset.model.category.name,
    },
    issuer: row.issuer,
    receiver: row.receiver,
    heldForDays: Math.max(0, daysBetween(row.issuedOn, end)),
  };
}
