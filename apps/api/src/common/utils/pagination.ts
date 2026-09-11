import { type Paginated, buildPaginationMeta } from '@asset/shared';

/** Translates `?page=&pageSize=` into Prisma's skip/take. */
export function toSkipTake(page: number, pageSize: number): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function paginate<T>(
  rows: T[],
  total: number,
  page: number,
  pageSize: number,
): Paginated<T> {
  return { data: rows, meta: buildPaginationMeta(page, pageSize, total) };
}

/**
 * Postgres ILIKE pattern with the wildcards the user did not type. Escapes
 * `%`, `_` and `\` so a search for "50%" does not match everything.
 */
export function toSearchPattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
