import { describe, expect, it } from 'vitest';
import { formatDate, formatPaise, humanise, initialsOf } from './utils';
import { toCsv } from './csv';

/**
 * Presentation-layer rules from the spec: money is stored as integer paise and
 * formatted only here, dates render as DD MMM YYYY, and a `date` column must
 * not shift a day when the viewer sits in another timezone.
 */
describe('formatDate', () => {
  it('renders a date column as DD MMM YYYY', () => {
    expect(formatDate('2026-09-11')).toBe('11 Sep 2026');
  });

  it('does not shift the day for a date-only value', () => {
    // Rendered in Asia/Kolkata (+05:30). Parsed naively as local time, an early
    // date would slip to the previous day.
    expect(formatDate('2026-01-01')).toBe('01 Jan 2026');
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026');
  });

  it('shows an em dash rather than "Invalid Date" for missing values', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });
});

describe('formatPaise', () => {
  it('converts integer paise to rupees', () => {
    expect(formatPaise(129950)).toContain('1,299.50');
    expect(formatPaise(100)).toContain('1.00');
  });

  it('handles zero and large amounts without losing precision', () => {
    expect(formatPaise(0)).toContain('0.00');
    expect(formatPaise(1234567890)).toContain('1,23,45,678.90');
  });

  it('accepts a BigInt, which is how larger totals arrive', () => {
    expect(formatPaise(9876543210n)).toContain('9,87,65,432.10');
  });

  it('shows an em dash for a missing amount rather than ₹0', () => {
    expect(formatPaise(null)).toBe('—');
    expect(formatPaise(undefined)).toBe('—');
  });
});

describe('humanise', () => {
  it('turns an enum value into a readable label', () => {
    expect(humanise('IN_STOCK')).toBe('In stock');
    expect(humanise('RETURNED_PENDING_CHECK')).toBe('Returned pending check');
  });
});

describe('initialsOf', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsOf('Asha Nair')).toBe('AN');
    expect(initialsOf('Priya')).toBe('P');
    expect(initialsOf('Lakshmi Narayanan Iyer')).toBe('LN');
  });

  it('survives extra whitespace', () => {
    expect(initialsOf('  Asha   Nair ')).toBe('AN');
  });
});

describe('toCsv', () => {
  it('writes a header row and the data rows', () => {
    expect(toCsv(['Tag', 'Status'], [['LAP-0001', 'In stock']])).toBe(
      'Tag,Status\r\nLAP-0001,In stock',
    );
  });

  it('quotes values containing a comma, quote or newline', () => {
    expect(toCsv(['a'], [['x,y']])).toBe('a\r\n"x,y"');
    expect(toCsv(['a'], [['say "hi"']])).toBe('a\r\n"say ""hi"""');
    expect(toCsv(['a'], [['line1\nline2']])).toBe('a\r\n"line1\nline2"');
  });

  it('neutralises values a spreadsheet would execute as a formula', () => {
    // A note beginning with = or + would otherwise run on open in Excel.
    expect(toCsv(['a'], [['=1+1']])).toBe("a\r\n'=1+1");
    expect(toCsv(['a'], [['+SUM(A1)']])).toBe("a\r\n'+SUM(A1)");
    expect(toCsv(['a'], [['@import']])).toBe("a\r\n'@import");
    expect(toCsv(['a'], [['-2+3']])).toBe("a\r\n'-2+3");
  });

  it('renders null and undefined as empty cells', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toBe('a,b\r\n,');
  });
});
