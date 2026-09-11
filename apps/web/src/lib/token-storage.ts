import type { AuthTokens } from '@asset/shared';

const ACCESS_KEY = 'asset.accessToken';
const REFRESH_KEY = 'asset.refreshToken';

/**
 * Tokens live in localStorage so a page reload does not sign the user out.
 *
 * This is a deliberate trade-off for an internal, VPN-reachable tool: an
 * httpOnly refresh cookie would resist XSS better, but the API returns the
 * refresh token in the response body by design (CLAUDE.md §3), and the access
 * token is short-lived and rotates. If this ever becomes internet-facing,
 * move the refresh token to an httpOnly cookie first.
 */
export const tokenStorage = {
  read(): { accessToken: string | null; refreshToken: string | null } {
    try {
      return {
        accessToken: localStorage.getItem(ACCESS_KEY),
        refreshToken: localStorage.getItem(REFRESH_KEY),
      };
    } catch {
      // Private-mode browsers can throw on access; treat it as signed out.
      return { accessToken: null, refreshToken: null };
    }
  },

  write(tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>): void {
    try {
      localStorage.setItem(ACCESS_KEY, tokens.accessToken);
      localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    } catch {
      // Nothing useful to do; the session simply will not survive a reload.
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      // ignored
    }
  },
};
