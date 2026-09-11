import { describe, expect, it } from 'vitest';
import { hashToken, parseDuration } from '../../src/modules/auth/token.service';

describe('parseDuration', () => {
  it('reads the durations the config actually uses', () => {
    expect(parseDuration('15m')).toBe(900);
    expect(parseDuration('7d')).toBe(604800);
  });

  it('supports seconds, minutes, hours and days', () => {
    expect(parseDuration('30s')).toBe(30);
    expect(parseDuration('2h')).toBe(7200);
  });

  it('treats a bare number as seconds', () => {
    expect(parseDuration('3600')).toBe(3600);
  });

  it('rejects a duration it cannot read, rather than guessing', () => {
    expect(() => parseDuration('7 weeks')).toThrowError(/Unsupported duration/);
    expect(() => parseDuration('')).toThrowError(/Unsupported duration/);
  });
});

describe('hashToken', () => {
  it('is stable for the same token', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('differs for different tokens', () => {
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('never returns the token itself — the database must not hold a usable one', () => {
    const token = 'a-real-looking-refresh-token';
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).toHaveLength(64);
  });
});
