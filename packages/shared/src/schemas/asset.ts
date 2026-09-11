import { z } from 'zod';
import { AssetStatus, ConditionGrade, InspectionOutcome } from '../enums/asset';
import {
  dateOnlySchema,
  isoDateTimeSchema,
  optionalNotes,
  paginationQuerySchema,
  remarksSchema,
  searchQuerySchema,
  uuidSchema,
} from './common';
import { assetModelSchema, locationSchema } from './masters';

export const assetStatusSchema = z.nativeEnum(AssetStatus);
export const conditionGradeSchema = z.nativeEnum(ConditionGrade);
export const inspectionOutcomeSchema = z.nativeEnum(InspectionOutcome);

/** The employee currently holding the asset, derived from the open assignment. */
export const currentHolderSchema = z.object({
  assignmentId: uuidSchema,
  employeeId: uuidSchema,
  employeeCode: z.string(),
  fullName: z.string(),
  department: z.string(),
  email: z.string(),
  issuedOn: dateOnlySchema,
  expectedReturnOn: dateOnlySchema.nullable(),
});
export type CurrentHolder = z.infer<typeof currentHolderSchema>;

export const assetSchema = z.object({
  id: uuidSchema,
  assetTag: z.string(),
  serialNumber: z.string().nullable(),
  modelId: uuidSchema,
  status: assetStatusSchema,
  conditionGrade: conditionGradeSchema,
  locationId: uuidSchema,
  purchaseItemId: uuidSchema.nullable(),
  warrantyExpiresOn: dateOnlySchema.nullable(),
  notes: z.string().nullable(),
  version: z.number().int(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  model: assetModelSchema.omit({ createdAt: true, updatedAt: true }).optional(),
  location: locationSchema.pick({ id: true, name: true, city: true, type: true }).optional(),
  /** Never a column — always read from the single OPEN assignment (CLAUDE.md §2.1). */
  currentHolder: currentHolderSchema.nullable().optional(),
});
export type Asset = z.infer<typeof assetSchema>;

export const createAssetSchema = z.object({
  assetTag: z.string().trim().toUpperCase().min(3).max(40),
  serialNumber: z.string().trim().max(80).nullish(),
  modelId: uuidSchema,
  conditionGrade: conditionGradeSchema.default(ConditionGrade.NEW),
  locationId: uuidSchema,
  warrantyExpiresOn: dateOnlySchema.nullish(),
  notes: optionalNotes,
});
export type CreateAsset = z.infer<typeof createAssetSchema>;

/**
 * assetTag is absent: it is immutable after creation (CLAUDE.md §7.5).
 * serialNumber is absent too — correcting it is an ADMIN-only dedicated
 * endpoint that writes a NOTE_ADDED event recording old and new values.
 */
export const updateAssetSchema = z.object({
  modelId: uuidSchema.optional(),
  conditionGrade: conditionGradeSchema.optional(),
  locationId: uuidSchema.optional(),
  warrantyExpiresOn: dateOnlySchema.nullish(),
  notes: optionalNotes.nullable(),
  /** Optimistic locking: rejected with STALE_VERSION if it no longer matches. */
  version: z.number().int().nonnegative().optional(),
});
export type UpdateAsset = z.infer<typeof updateAssetSchema>;

export const correctSerialNumberSchema = z.object({
  serialNumber: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(1).max(1000),
});
export type CorrectSerialNumber = z.infer<typeof correctSerialNumberSchema>;

export const listAssetsQuerySchema = paginationQuerySchema.merge(searchQuerySchema).extend({
  status: z.union([assetStatusSchema, z.array(assetStatusSchema)]).optional(),
  categoryId: uuidSchema.optional(),
  modelId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  conditionGrade: conditionGradeSchema.optional(),
  employeeId: uuidSchema.optional(),
  /** Assets whose warranty expires within N days. */
  warrantyExpiringInDays: z.coerce.number().int().positive().max(3650).optional(),
  sortBy: z.enum(['assetTag', 'createdAt', 'status', 'warrantyExpiresOn']).default('assetTag'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});
export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;

// --- lifecycle actions (CLAUDE.md §8) ---------------------------------------

export const issueAssetSchema = z.object({
  employeeId: uuidSchema,
  conditionOut: conditionGradeSchema,
  issuedOn: dateOnlySchema.optional(),
  expectedReturnOn: dateOnlySchema.nullish(),
  remarks: remarksSchema,
});
export type IssueAsset = z.infer<typeof issueAssetSchema>;

export const returnAssetSchema = z.object({
  conditionIn: conditionGradeSchema,
  returnedOn: dateOnlySchema.optional(),
  remarks: remarksSchema,
});
export type ReturnAsset = z.infer<typeof returnAssetSchema>;

export const inspectAssetSchema = z.object({
  outcome: inspectionOutcomeSchema,
  conditionGrade: conditionGradeSchema,
  notes: optionalNotes,
});
export type InspectAsset = z.infer<typeof inspectAssetSchema>;

export const transferAssetSchema = z.object({
  toEmployeeId: uuidSchema,
  conditionIn: conditionGradeSchema,
  conditionOut: conditionGradeSchema,
  expectedReturnOn: dateOnlySchema.nullish(),
  remarks: remarksSchema,
});
export type TransferAsset = z.infer<typeof transferAssetSchema>;

export const markLostSchema = z.object({
  notes: z.string().trim().min(1, 'An explanation is required').max(2000),
});
export type MarkLost = z.infer<typeof markLostSchema>;

export const recoverAssetSchema = z.object({
  conditionGrade: conditionGradeSchema,
  locationId: uuidSchema.optional(),
  notes: z.string().trim().min(1).max(2000),
});
export type RecoverAsset = z.infer<typeof recoverAssetSchema>;

export const retireAssetSchema = z.object({
  notes: z.string().trim().min(1, 'A reason is required').max(2000),
});
export type RetireAsset = z.infer<typeof retireAssetSchema>;

/** Moves an asset's owning location; writes a TRANSFERRED event. */
export const relocateAssetSchema = z.object({
  locationId: uuidSchema,
  notes: optionalNotes,
});
export type RelocateAsset = z.infer<typeof relocateAssetSchema>;

export const addAssetNoteSchema = z.object({
  notes: z.string().trim().min(1).max(2000),
});
export type AddAssetNote = z.infer<typeof addAssetNoteSchema>;
