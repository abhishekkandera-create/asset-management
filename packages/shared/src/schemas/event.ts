import { z } from 'zod';
import { AssetEventType, EventReferenceType } from '../enums/event';
import { isoDateTimeSchema, paginationQuerySchema, uuidSchema } from './common';
import { assetStatusSchema } from './asset';

export const assetEventTypeSchema = z.nativeEnum(AssetEventType);
export const eventReferenceTypeSchema = z.nativeEnum(EventReferenceType);

export const assetEventSchema = z.object({
  id: uuidSchema,
  assetId: uuidSchema,
  eventType: assetEventTypeSchema,
  occurredAt: isoDateTimeSchema,
  performedBy: uuidSchema,
  fromStatus: assetStatusSchema.nullable(),
  toStatus: assetStatusSchema.nullable(),
  employeeId: uuidSchema.nullable(),
  locationId: uuidSchema.nullable(),
  referenceType: eventReferenceTypeSchema.nullable(),
  referenceId: uuidSchema.nullable(),
  notes: z.string().nullable(),
  actor: z.object({ id: uuidSchema, fullName: z.string(), email: z.string() }).optional(),
  employee: z.object({ id: uuidSchema, employeeCode: z.string(), fullName: z.string() }).nullish(),
  location: z.object({ id: uuidSchema, name: z.string(), city: z.string() }).nullish(),
});
export type AssetEvent = z.infer<typeof assetEventSchema>;

export const listAssetEventsQuerySchema = paginationQuerySchema.extend({
  eventType: z.union([assetEventTypeSchema, z.array(assetEventTypeSchema)]).optional(),
  employeeId: uuidSchema.optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});
export type ListAssetEventsQuery = z.infer<typeof listAssetEventsQuerySchema>;
