import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  formatDateOnly,
  formatDateOnlyOrNull,
  parseDateOnly,
} from '../../src/common/utils/date';

describe('date-only helpers', () => {
  it('round-trips a calendar date without shifting the day', () => {
    expect(formatDateOnly(parseDateOnly('2026-09-11'))).toBe('2026-09-11');
  });

  it('parses to UTC midnight, so a local timezone cannot move the day', () => {
    expect(parseDateOnly('2026-01-01').toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('formats null as null rather than throwing', () => {
    expect(formatDateOnlyOrNull(null)).toBeNull();
    expect(formatDateOnlyOrNull(parseDateOnly('2026-03-01'))).toBe('2026-03-01');
  });

  describe('addMonths — the basis of warranty expiry (CLAUDE.md §7.6)', () => {
    it('adds whole months', () => {
      expect(formatDateOnly(addMonths(parseDateOnly('2026-01-15'), 12))).toBe('2027-01-15');
      expect(formatDateOnly(addMonths(parseDateOnly('2026-01-15'), 36))).toBe('2029-01-15');
    });

    it('clamps to the last day when the target month is shorter', () => {
      // 31 Jan + 1 month must be 28 Feb, never 3 March.
      expect(formatDateOnly(addMonths(parseDateOnly('2026-01-31'), 1))).toBe('2026-02-28');
      expect(formatDateOnly(addMonths(parseDateOnly('2026-03-31'), 1))).toBe('2026-04-30');
    });

    it('handles a leap year', () => {
      expect(formatDateOnly(addMonths(parseDateOnly('2028-01-31'), 1))).toBe('2028-02-29');
      expect(formatDateOnly(addMonths(parseDateOnly('2028-02-29'), 12))).toBe('2029-02-28');
    });

    it('crosses a year boundary', () => {
      expect(formatDateOnly(addMonths(parseDateOnly('2026-11-30'), 3))).toBe('2027-02-28');
    });

    it('treats zero months as a no-op', () => {
      expect(formatDateOnly(addMonths(parseDateOnly('2026-06-15'), 0))).toBe('2026-06-15');
    });
  });

  describe('addDays', () => {
    it('crosses month and year boundaries', () => {
      expect(formatDateOnly(addDays(parseDateOnly('2026-12-31'), 1))).toBe('2027-01-01');
      expect(formatDateOnly(addDays(parseDateOnly('2026-03-01'), -1))).toBe('2026-02-28');
    });
  });

  describe('daysBetween', () => {
    it('counts whole days forward', () => {
      expect(daysBetween(parseDateOnly('2026-09-01'), parseDateOnly('2026-09-11'))).toBe(10);
    });

    it('is zero for the same day', () => {
      expect(daysBetween(parseDateOnly('2026-09-11'), parseDateOnly('2026-09-11'))).toBe(0);
    });

    it('goes negative when the dates are the other way round', () => {
      expect(daysBetween(parseDateOnly('2026-09-11'), parseDateOnly('2026-09-01'))).toBe(-10);
    });
  });
});
