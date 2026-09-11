import { z } from 'zod';

/** Every id in the system is a uuid (v7 where the database can generate one). */
export const uuidSchema = z.string().uuid();

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Query params shared by every list endpoint (CLAUDE.md §8).
 * Values arrive as strings on the wire, so page/pageSize are coerced.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const searchQuerySchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
});

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');
export type SortOrder = z.infer<typeof sortOrderSchema>;

export const paginationMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

/** `{ data, meta }` — the shape every list endpoint returns. */
export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ data: z.array(item), meta: paginationMetaSchema });
}
export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export function buildPaginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return { page, pageSize, total, totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0 };
}

/** The single error envelope (CLAUDE.md §8). */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/** A `date` column: calendar day, no time, no zone. */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Not a real calendar date');

/** A `timestamptz` column, always serialised as an ISO-8601 UTC instant. */
export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const optionalNotes = z.string().trim().max(2000).optional();
export const remarksSchema = z.string().trim().max(1000).optional();
