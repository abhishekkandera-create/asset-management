import { z } from 'zod';
import { AssignmentStatus } from '../enums/assignment';
import {
  dateOnlySchema,
  isoDateTimeSchema,
  paginationQuerySchema,
  remarksSchema,
  uuidSchema,
} from './common';
import { conditionGradeSchema } from './asset';

export const assignmentStatusSchema = z.nativeEnum(AssignmentStatus);

const actorSchema = z.object({ id: uuidSchema, fullName: z.string(), email: z.string() });

export const assignmentSchema = z.object({
  id: uuidSchema,
  assetId: uuidSchema,
  employeeId: uuidSchema,
  issuedOn: dateOnlySchema,
  issuedBy: uuidSchema,
  expectedReturnOn: dateOnlySchema.nullable(),
  conditionOut: conditionGradeSchema,
  issueRemarks: z.string().nullable(),
  returnedOn: dateOnlySchema.nullable(),
  closedOn: dateOnlySchema.nullable(),
  receivedBy: uuidSchema.nullable(),
  conditionIn: conditionGradeSchema.nullable(),
  returnRemarks: z.string().nullable(),
  status: assignmentStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  employee: z
    .object({
      id: uuidSchema,
      employeeCode: z.string(),
      fullName: z.string(),
      department: z.string(),
      status: z.string(),
    })
    .optional(),
  asset: z
    .object({
      id: uuidSchema,
      assetTag: z.string(),
      serialNumber: z.string().nullable(),
      status: z.string(),
      modelName: z.string(),
      manufacturer: z.string(),
      categoryName: z.string(),
    })
    .optional(),
  issuer: actorSchema.optional(),
  receiver: actorSchema.nullish(),
  /** Whole days the asset has been held, or was held before closing. */
  heldForDays: z.number().int().optional(),
});
export type Assignment = z.infer<typeof assignmentSchema>;

export const listAssignmentsQuerySchema = paginationQuerySchema.extend({
  assetId: uuidSchema.optional(),
  employeeId: uuidSchema.optional(),
  status: assignmentStatusSchema.optional(),
  issuedFrom: dateOnlySchema.optional(),
  issuedTo: dateOnlySchema.optional(),
  /** Open assignments past their expected return date. */
  overdueOnly: z.coerce.boolean().optional(),
});
export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>;

/** Closes an assignment without a physical return (CLAUDE.md §5.3). */
export const writeOffAssignmentSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required').max(2000),
  /** True when the hardware is gone for good: the asset also becomes LOST. */
  markAssetLost: z.boolean().default(true),
  remarks: remarksSchema,
});
export type WriteOffAssignment = z.infer<typeof writeOffAssignmentSchema>;

// --- employee views ---------------------------------------------------------

/** GET /employees/:id/clearance — what blocks this employee's exit. */
export const clearanceItemSchema = z.object({
  assignmentId: uuidSchema,
  assetId: uuidSchema,
  assetTag: z.string(),
  serialNumber: z.string().nullable(),
  categoryName: z.string(),
  manufacturer: z.string(),
  modelName: z.string(),
  assetStatus: z.string(),
  issuedOn: dateOnlySchema,
  expectedReturnOn: dateOnlySchema.nullable(),
  heldForDays: z.number().int(),
});
export type ClearanceItem = z.infer<typeof clearanceItemSchema>;

export const clearanceSchema = z.object({
  employeeId: uuidSchema,
  employeeCode: z.string(),
  fullName: z.string(),
  status: z.string(),
  dateExited: dateOnlySchema.nullable(),
  openAssignments: z.array(clearanceItemSchema),
  /** True when nothing blocks the exit. */
  isClear: z.boolean(),
});
export type Clearance = z.infer<typeof clearanceSchema>;

/** GET /employees/:id/assets — currently held serialized assets (+ bulk, phase 5). */
export const employeeHoldingsSchema = z.object({
  employeeId: uuidSchema,
  assignments: z.array(assignmentSchema),
  bulkItems: z
    .array(
      z.object({
        modelId: uuidSchema,
        manufacturer: z.string(),
        modelName: z.string(),
        categoryName: z.string(),
        quantityIssued: z.number().int(),
        lastIssuedOn: dateOnlySchema.nullable(),
      }),
    )
    .default([]),
});
export type EmployeeHoldings = z.infer<typeof employeeHoldingsSchema>;
