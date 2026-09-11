import { z } from 'zod';
import { assetStatusSchema } from './asset';
import { uuidSchema } from './common';

export const dashboardSummarySchema = z.object({
  assetsByStatus: z.array(z.object({ status: assetStatusSchema, count: z.number().int() })),
  totals: z.object({
    assets: z.number().int(),
    assigned: z.number().int(),
    inStock: z.number().int(),
    employeesActive: z.number().int(),
    openAssignments: z.number().int(),
    openRepairTickets: z.number().int(),
  }),
  warrantyExpiring: z.object({
    in30Days: z.number().int(),
    in60Days: z.number().int(),
    in90Days: z.number().int(),
  }),
  lowStock: z
    .array(
      z.object({
        modelId: uuidSchema,
        manufacturer: z.string(),
        modelName: z.string(),
        locationId: uuidSchema,
        locationName: z.string(),
        quantityOnHand: z.number().int(),
        reorderLevel: z.number().int(),
      }),
    )
    .default([]),
  assetsByCategory: z
    .array(z.object({ categoryId: uuidSchema, categoryName: z.string(), count: z.number().int() }))
    .default([]),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
