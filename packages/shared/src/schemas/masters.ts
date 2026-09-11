import { z } from 'zod';
import { LocationType } from '../enums/organisation';
import { TrackingMode } from '../enums/asset';
import { isoDateTimeSchema, paginationQuerySchema, searchQuerySchema, uuidSchema } from './common';

export const locationTypeSchema = z.nativeEnum(LocationType);
export const trackingModeSchema = z.nativeEnum(TrackingMode);

const activeFilter = z.object({ isActive: z.coerce.boolean().optional() });

// --- location ---------------------------------------------------------------

export const locationSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  type: locationTypeSchema,
  address: z.string().nullable(),
  city: z.string(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Location = z.infer<typeof locationSchema>;

export const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: locationTypeSchema,
  address: z.string().trim().max(500).nullish(),
  city: z.string().trim().min(1).max(80),
  isActive: z.boolean().default(true),
});
export type CreateLocation = z.infer<typeof createLocationSchema>;
export const updateLocationSchema = createLocationSchema.partial();
export type UpdateLocation = z.infer<typeof updateLocationSchema>;

export const listLocationsQuerySchema = paginationQuerySchema
  .merge(searchQuerySchema)
  .merge(activeFilter)
  .extend({ type: locationTypeSchema.optional(), city: z.string().trim().optional() });

// --- vendor -----------------------------------------------------------------

export const vendorSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  contactPerson: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  gstin: z.string().nullable(),
  address: z.string().nullable(),
  isServiceCentre: z.boolean(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Vendor = z.infer<typeof vendorSchema>;

/** 15 characters: 2 state + 10 PAN + 1 entity + 1 'Z' + 1 checksum. */
const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const createVendorSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contactPerson: z.string().trim().max(120).nullish(),
  phone: z.string().trim().max(20).nullish(),
  email: z.string().trim().toLowerCase().email().nullish(),
  gstin: z.string().trim().toUpperCase().regex(gstinRegex, 'Not a valid GSTIN').nullish(),
  address: z.string().trim().max(500).nullish(),
  isServiceCentre: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type CreateVendor = z.infer<typeof createVendorSchema>;
export const updateVendorSchema = createVendorSchema.partial();
export type UpdateVendor = z.infer<typeof updateVendorSchema>;

export const listVendorsQuerySchema = paginationQuerySchema
  .merge(searchQuerySchema)
  .merge(activeFilter)
  .extend({ isServiceCentre: z.coerce.boolean().optional() });

// --- category ---------------------------------------------------------------

export const assetCategorySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  code: z.string(),
  trackingMode: trackingModeSchema,
  requiresSerial: z.boolean(),
  defaultUsefulLifeMonths: z.number().int().nullable(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type AssetCategory = z.infer<typeof assetCategorySchema>;

export const createAssetCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(2)
      .max(8)
      .regex(/^[A-Z0-9]+$/, 'Code may contain only letters and digits'),
    trackingMode: trackingModeSchema,
    requiresSerial: z.boolean().default(true),
    defaultUsefulLifeMonths: z.number().int().positive().max(600).nullish(),
    isActive: z.boolean().default(true),
  })
  .refine((v) => !(v.trackingMode === TrackingMode.BULK && v.requiresSerial), {
    message: 'A BULK category cannot require serial numbers',
    path: ['requiresSerial'],
  });
export type CreateAssetCategory = z.infer<typeof createAssetCategorySchema>;
export const updateAssetCategorySchema = createAssetCategorySchema.innerType().partial();
export type UpdateAssetCategory = z.infer<typeof updateAssetCategorySchema>;

export const listCategoriesQuerySchema = paginationQuerySchema
  .merge(searchQuerySchema)
  .merge(activeFilter)
  .extend({ trackingMode: trackingModeSchema.optional() });

// --- model ------------------------------------------------------------------

/** Specs are free-form: a laptop and a charger share no fields. */
export const assetSpecsSchema = z.record(z.union([z.string(), z.number(), z.boolean()]));
export type AssetSpecs = z.infer<typeof assetSpecsSchema>;

export const assetModelSchema = z.object({
  id: uuidSchema,
  categoryId: uuidSchema,
  manufacturer: z.string(),
  modelName: z.string(),
  specs: assetSpecsSchema,
  defaultWarrantyMonths: z.number().int().nullable(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  category: assetCategorySchema
    .pick({ id: true, name: true, code: true, trackingMode: true })
    .optional(),
});
export type AssetModel = z.infer<typeof assetModelSchema>;

export const createAssetModelSchema = z.object({
  categoryId: uuidSchema,
  manufacturer: z.string().trim().min(1).max(80),
  modelName: z.string().trim().min(1).max(120),
  specs: assetSpecsSchema.default({}),
  defaultWarrantyMonths: z.number().int().min(0).max(240).nullish(),
  isActive: z.boolean().default(true),
});
export type CreateAssetModel = z.infer<typeof createAssetModelSchema>;
export const updateAssetModelSchema = createAssetModelSchema.partial();
export type UpdateAssetModel = z.infer<typeof updateAssetModelSchema>;

export const listModelsQuerySchema = paginationQuerySchema
  .merge(searchQuerySchema)
  .merge(activeFilter)
  .extend({ categoryId: uuidSchema.optional() });
