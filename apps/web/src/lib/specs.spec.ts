import { describe, expect, it } from 'vitest';
import { formatSpecs, specLabel, specSummary, specValue } from './specs';

describe('specLabel', () => {
  it('uses a proper label for a known key', () => {
    expect(specLabel('cpu')).toBe('Processor');
    expect(specLabel('ramGb')).toBe('Memory');
    expect(specLabel('os')).toBe('Operating system');
  });

  it('splits camelCase for an unknown key rather than dropping it', () => {
    expect(specLabel('screenRefreshHz')).toBe('Screen refresh hz');
  });

  it('keeps acronyms upper-case', () => {
    expect(specLabel('gpu')).toBe('GPU');
    expect(specLabel('usb')).toBe('USB');
  });
});

describe('specValue', () => {
  it('appends the unit for a known numeric key', () => {
    expect(specValue('ramGb', 16)).toBe('16 GB');
    expect(specValue('weightKg', 1.4)).toBe('1.4 kg');
  });

  it('writes a screen size without a space before the inch mark', () => {
    expect(specValue('screenInches', 14)).toBe('14"');
    expect(specValue('screenInches', 13.6)).toBe('13.6"');
  });

  it('reads a round multiple of 1024 GB as terabytes', () => {
    expect(specValue('storageGb', 1024)).toBe('1 TB');
    expect(specValue('storageGb', 2048)).toBe('2 TB');
  });

  it('leaves storage that is not a round terabyte in GB', () => {
    expect(specValue('storageGb', 512)).toBe('512 GB');
    expect(specValue('storageGb', 1536)).toBe('1536 GB');
  });

  it('renders booleans as Yes and No, not true and false', () => {
    expect(specValue('wireless', true)).toBe('Yes');
    expect(specValue('wireless', false)).toBe('No');
  });

  it('passes through a value whose key carries no unit', () => {
    expect(specValue('cpu', 'Intel Core i5-1335U')).toBe('Intel Core i5-1335U');
  });
});

describe('formatSpecs', () => {
  it('orders known specs consistently, whatever order the JSON is in', () => {
    const specs = { screenInches: 14, os: 'Windows 11 Pro', cpu: 'Intel Core i5', ramGb: 16 };

    expect(formatSpecs(specs).map((s) => s.label)).toEqual([
      'Processor',
      'Memory',
      'Screen',
      'Operating system',
    ]);
  });

  it('keeps unknown keys, after the known ones and alphabetically', () => {
    const specs = { zeta: 'last', cpu: 'Intel', alpha: 'first' };

    expect(formatSpecs(specs).map((s) => s.key)).toEqual(['cpu', 'alpha', 'zeta']);
  });

  it('drops empty values rather than showing a blank row', () => {
    expect(formatSpecs({ cpu: 'Intel', panel: '' }).map((s) => s.key)).toEqual(['cpu']);
  });

  it('handles a model with no specs at all', () => {
    expect(formatSpecs({})).toEqual([]);
    expect(formatSpecs(null)).toEqual([]);
    expect(formatSpecs(undefined)).toEqual([]);
  });

  it('formats a real seeded laptop end to end', () => {
    const specs = {
      os: 'Windows 11 Pro',
      cpu: 'Intel Core Ultra 7 155U',
      ramGb: 32,
      storageGb: 1024,
      screenInches: 14,
    };

    expect(formatSpecs(specs)).toEqual([
      { key: 'cpu', label: 'Processor', value: 'Intel Core Ultra 7 155U' },
      { key: 'ramGb', label: 'Memory', value: '32 GB' },
      { key: 'storageGb', label: 'Storage', value: '1 TB' },
      { key: 'screenInches', label: 'Screen', value: '14"' },
      { key: 'os', label: 'Operating system', value: 'Windows 11 Pro' },
    ]);
  });
});

describe('specSummary', () => {
  it('joins the first few values for a table cell', () => {
    const specs = { cpu: 'Intel Core i5', ramGb: 16, storageGb: 512, os: 'Windows 11 Pro' };
    expect(specSummary(specs)).toBe('Intel Core i5 · 16 GB · 512 GB');
  });

  it('is empty when there is nothing to summarise', () => {
    expect(specSummary({})).toBe('');
    expect(specSummary(undefined)).toBe('');
  });
});
