import { z } from 'zod';
import { EmployeeStatus } from '../enums/organisation';
import {
  dateOnlySchema,
  isoDateTimeSchema,
  paginationQuerySchema,
  searchQuerySchema,
  uuidSchema,
} from './common';
import { locationSchema } from './masters';

export const employeeStatusSchema = z.nativeEnum(EmployeeStatus);

export const employeeSchema = z.object({
  id: uuidSchema,
  employeeCode: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  department: z.string(),
  designation: z.string(),
  locationId: uuidSchema,
  dateJoined: dateOnlySchema,
  dateExited: dateOnlySchema.nullable(),
  status: employeeStatusSchema,
  reportingManagerId: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  location: locationSchema.pick({ id: true, name: true, city: true, type: true }).optional(),
  reportingManager: z
    .object({ id: uuidSchema, employeeCode: z.string(), fullName: z.string() })
    .nullish(),
  /** Count of currently held serialized assets. Present on list responses. */
  openAssignmentCount: z.number().int().optional(),
});
export type Employee = z.infer<typeof employeeSchema>;

export const createEmployeeSchema = z.object({
  employeeCode: z.string().trim().toUpperCase().min(1).max(32),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(20).nullish(),
  department: z.string().trim().min(1).max(80),
  designation: z.string().trim().min(1).max(120),
  locationId: uuidSchema,
  dateJoined: dateOnlySchema,
  reportingManagerId: uuidSchema.nullish(),
});
export type CreateEmployee = z.infer<typeof createEmployeeSchema>;

/**
 * Status and dateExited are absent by design: exiting an employee goes through
 * POST /employees/:id/exit, which enforces the clearance rule (CLAUDE.md §7.7).
 */
export const updateEmployeeSchema = createEmployeeSchema.partial();
export type UpdateEmployee = z.infer<typeof updateEmployeeSchema>;

export const listEmployeesQuerySchema = paginationQuerySchema.merge(searchQuerySchema).extend({
  status: employeeStatusSchema.optional(),
  department: z.string().trim().optional(),
  locationId: uuidSchema.optional(),
  /** Only employees currently holding at least one asset. */
  holdingAssets: z.coerce.boolean().optional(),
});
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

export const exitEmployeeSchema = z.object({
  dateExited: dateOnlySchema,
  notes: z.string().trim().max(2000).optional(),
});
export type ExitEmployee = z.infer<typeof exitEmployeeSchema>;
