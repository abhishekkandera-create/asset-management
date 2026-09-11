import { describe, expect, it } from 'vitest';
import { validateEnv } from '../../src/config/env';

const VALID = {
  DATABASE_URL: 'postgresql://asset:pw@localhost:5442/asset_management?schema=public',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('applies documented defaults when optional variables are absent', () => {
    const env = validateEnv(VALID);

    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3000);
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.JWT_REFRESH_TTL).toBe('7d');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('coerces the port from the string the environment actually provides', () => {
    expect(validateEnv({ ...VALID, API_PORT: '4000' }).API_PORT).toBe(4000);
  });

  it('splits CORS_ORIGINS into a trimmed list', () => {
    const env = validateEnv({ ...VALID, CORS_ORIGINS: 'http://a.test, http://b.test ,' });
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('reads booleans written as strings', () => {
    expect(validateEnv({ ...VALID, S3_FORCE_PATH_STYLE: 'false' }).S3_FORCE_PATH_STYLE).toBe(false);
    expect(validateEnv({ ...VALID, S3_FORCE_PATH_STYLE: 'true' }).S3_FORCE_PATH_STYLE).toBe(true);
    expect(validateEnv({ ...VALID, LOG_PRETTY: '1' }).LOG_PRETTY).toBe(true);
  });

  it('fails loudly when a required variable is missing', () => {
    const { DATABASE_URL: _omitted, ...withoutDatabase } = VALID;
    expect(() => validateEnv(withoutDatabase)).toThrowError(/DATABASE_URL/);
  });

  it('names every offending variable in one report, not just the first', () => {
    expect(() => validateEnv({})).toThrowError(/DATABASE_URL[\s\S]*JWT_ACCESS_SECRET/);
  });

  it('rejects a JWT secret that is too short to be worth signing with', () => {
    expect(() => validateEnv({ ...VALID, JWT_ACCESS_SECRET: 'short' })).toThrowError(
      /at least 32 characters/,
    );
  });

  it('rejects reusing one secret for both access and refresh tokens', () => {
    const same = 'c'.repeat(32);
    expect(() =>
      validateEnv({ ...VALID, JWT_ACCESS_SECRET: same, JWT_REFRESH_SECRET: same }),
    ).toThrowError(/must differ/);
  });

  it('rejects a NODE_ENV outside the three we support', () => {
    expect(() => validateEnv({ ...VALID, NODE_ENV: 'staging' })).toThrowError(/NODE_ENV/);
  });

  describe('hosted deployment', () => {
    it('binds to the PORT a host injects, overriding API_PORT', () => {
      // Render, Railway and Heroku all route traffic only to $PORT.
      const env = validateEnv({ ...VALID, API_PORT: '3000', PORT: '10000' });
      expect(env.API_PORT).toBe(10000);
    });

    it('keeps API_PORT when no host port is injected', () => {
      expect(validateEnv({ ...VALID, API_PORT: '4000' }).API_PORT).toBe(4000);
    });

    it('boots without object storage configured', () => {
      // Nothing reads S3 until invoice uploads land in phase 4; requiring it
      // would stop the API starting on a host that has no bucket yet.
      const env = validateEnv(VALID);
      expect(env.S3_ACCESS_KEY).toBeUndefined();
      expect(env.S3_BUCKET).toBeUndefined();
    });

    it('still accepts object storage when it is configured', () => {
      const env = validateEnv({ ...VALID, S3_ACCESS_KEY: 'key', S3_SECRET_KEY: 'secret', S3_BUCKET: 'bucket' });
      expect(env.S3_BUCKET).toBe('bucket');
    });
  });
});
