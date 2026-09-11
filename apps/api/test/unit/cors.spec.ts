import { describe, expect, it } from 'vitest';
import { buildCorsMatcher } from '../../src/common/cors';

/** Runs the matcher and returns whether the origin was allowed. */
function allows(allowed: string[], origin: string | undefined): boolean {
  let result = false;
  buildCorsMatcher(allowed)(origin, (_error, allow) => {
    result = allow ?? false;
  });
  return result;
}

describe('buildCorsMatcher', () => {
  it('allows an exactly listed origin', () => {
    expect(allows(['https://assets.example.com'], 'https://assets.example.com')).toBe(true);
  });

  it('refuses an origin that is not listed', () => {
    expect(allows(['https://assets.example.com'], 'https://evil.test')).toBe(false);
  });

  it('is strict about scheme and port', () => {
    const allowed = ['http://localhost:5173'];
    expect(allows(allowed, 'http://localhost:5173')).toBe(true);
    expect(allows(allowed, 'https://localhost:5173')).toBe(false);
    expect(allows(allowed, 'http://localhost:4173')).toBe(false);
  });

  it('allows a request with no Origin header at all', () => {
    // curl, uptime checks and server-to-server calls send no Origin. CORS only
    // governs browsers, so refusing these would break health checks.
    expect(allows(['https://assets.example.com'], undefined)).toBe(true);
  });

  describe('wildcard suffixes, for preview deployments', () => {
    it('allows any subdomain of a listed suffix', () => {
      const allowed = ['*.vercel.app'];
      expect(allows(allowed, 'https://asset-management.vercel.app')).toBe(true);
      expect(allows(allowed, 'https://asset-management-git-abc123.vercel.app')).toBe(true);
    });

    it('does not allow a lookalike domain that merely ends in the same text', () => {
      expect(allows(['*.vercel.app'], 'https://notvercel.app')).toBe(false);
      expect(allows(['*.vercel.app'], 'https://vercel.app.evil.test')).toBe(false);
    });

    it('combines suffixes with exact entries', () => {
      const allowed = ['https://assets.example.com', '*.vercel.app'];
      expect(allows(allowed, 'https://assets.example.com')).toBe(true);
      expect(allows(allowed, 'https://preview.vercel.app')).toBe(true);
      expect(allows(allowed, 'https://evil.test')).toBe(false);
    });
  });

  describe('the open wildcard', () => {
    it('allows everything when the list is exactly "*"', () => {
      expect(allows(['*'], 'https://anything.test')).toBe(true);
    });

    it('is not implied by an empty list', () => {
      // An empty CORS_ORIGINS must lock the browser out, not open the door.
      expect(allows([], 'https://anything.test')).toBe(false);
    });
  });

  it('refuses an origin that is not a parseable URL', () => {
    expect(allows(['*.vercel.app'], 'not-a-url')).toBe(false);
  });
});
