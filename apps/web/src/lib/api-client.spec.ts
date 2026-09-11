import { describe, expect, it } from 'vitest';
import { normaliseBaseUrl } from './api-client';

/**
 * A misconfigured base URL cost a deployment: VITE_API_BASE_URL was set to the
 * Render origin with no `/api/v1`, so every call hit a route Nest does not
 * serve and the login screen showed `Cannot POST /auth/login`.
 */
describe('normaliseBaseUrl', () => {
  it('adds the version prefix when only the origin is given', () => {
    expect(normaliseBaseUrl('https://api.example.com')).toBe('https://api.example.com/api/v1');
  });

  it('leaves a correctly configured URL alone', () => {
    expect(normaliseBaseUrl('https://api.example.com/api/v1')).toBe(
      'https://api.example.com/api/v1',
    );
  });

  it('trims a trailing slash either way', () => {
    expect(normaliseBaseUrl('https://api.example.com/')).toBe('https://api.example.com/api/v1');
    expect(normaliseBaseUrl('https://api.example.com/api/v1/')).toBe(
      'https://api.example.com/api/v1',
    );
    expect(normaliseBaseUrl('https://api.example.com///')).toBe('https://api.example.com/api/v1');
  });

  it('ignores surrounding whitespace, which is easy to paste in', () => {
    expect(normaliseBaseUrl('  https://api.example.com  ')).toBe('https://api.example.com/api/v1');
  });

  it('respects a future API version rather than stacking prefixes on it', () => {
    expect(normaliseBaseUrl('https://api.example.com/api/v2')).toBe(
      'https://api.example.com/api/v2',
    );
  });

  it('handles the local default', () => {
    expect(normaliseBaseUrl('http://localhost:3000')).toBe('http://localhost:3000/api/v1');
    expect(normaliseBaseUrl('http://localhost:3000/api/v1')).toBe('http://localhost:3000/api/v1');
  });

  it('does not mistake a path that merely mentions api for the prefix', () => {
    expect(normaliseBaseUrl('https://example.com/api')).toBe('https://example.com/api/api/v1');
  });
});
