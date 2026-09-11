import { describe, expect, it } from 'vitest';
import { paginate, toSearchPattern, toSkipTake } from '../../src/common/utils/pagination';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, paginationQuerySchema } from '@asset/shared';

describe('pagination', () => {
  it('translates page/pageSize into skip/take', () => {
    expect(toSkipTake(1, 25)).toEqual({ skip: 0, take: 25 });
    expect(toSkipTake(3, 25)).toEqual({ skip: 50, take: 25 });
  });

  it('builds the documented { data, meta } envelope', () => {
    const result = paginate([{ id: 'a' }], 51, 2, 25);
    expect(result).toEqual({
      data: [{ id: 'a' }],
      meta: { page: 2, pageSize: 25, total: 51, totalPages: 3 },
    });
  });

  it('reports zero pages for an empty result rather than one empty page', () => {
    expect(paginate([], 0, 1, 25).meta.totalPages).toBe(0);
  });

  describe('query schema (CLAUDE.md §8)', () => {
    it('defaults to page 1 and the standard page size', () => {
      expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
    });

    it('coerces the strings that arrive on a query string', () => {
      expect(paginationQuerySchema.parse({ page: '2', pageSize: '50' })).toEqual({
        page: 2,
        pageSize: 50,
      });
    });

    it(`caps pageSize at ${MAX_PAGE_SIZE}`, () => {
      expect(paginationQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
      expect(paginationQuerySchema.safeParse({ pageSize: '100' }).success).toBe(true);
    });

    it('rejects a page of zero or below', () => {
      expect(paginationQuerySchema.safeParse({ page: '0' }).success).toBe(false);
      expect(paginationQuerySchema.safeParse({ page: '-1' }).success).toBe(false);
    });
  });

  describe('toSearchPattern', () => {
    it('wraps the term in wildcards', () => {
      expect(toSearchPattern('dell')).toBe('%dell%');
    });

    it('escapes wildcards the user typed, so "50%" is a literal search', () => {
      expect(toSearchPattern('50%')).toBe('%50\\%%');
      expect(toSearchPattern('a_b')).toBe('%a\\_b%');
      expect(toSearchPattern('back\\slash')).toBe('%back\\\\slash%');
    });
  });
});
