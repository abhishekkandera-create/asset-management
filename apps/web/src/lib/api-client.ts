import type { AuthTokens, LoginResponse } from '@asset/shared';
import { ApiError } from './api-error';
import { tokenStorage } from './token-storage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

type Query = Record<string, string | number | boolean | string[] | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Skips the Authorization header and the refresh-on-401 retry. */
  anonymous?: boolean;
  signal?: AbortSignal;
}

/** Called when the session cannot be recovered, so the app can route to login. */
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      // Repeated keys, which is what the API's array filters expect.
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = 'INTERNAL_ERROR';
  let message = response.statusText || 'Request failed';
  let details: unknown;

  try {
    const payload = (await response.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    if (payload?.error) {
      code = payload.error.code ?? code;
      message = payload.error.message ?? message;
      details = payload.error.details;
    }
  } catch {
    // A non-JSON error body (a proxy timeout, say) keeps the defaults.
  }

  return new ApiError(response.status, code, message, details);
}

/**
 * Single-flight refresh: several requests failing with 401 at once must
 * produce exactly one refresh call, or they race to rotate the same token and
 * the loser's replay revokes every session.
 */
let refreshInFlight: Promise<AuthTokens | null> | null = null;

async function refreshTokens(): Promise<AuthTokens | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const { refreshToken } = tokenStorage.read();
    if (!refreshToken) return null;

    try {
      const response = await fetch(buildUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return null;

      const tokens = (await response.json()) as LoginResponse;
      tokenStorage.write(tokens);
      return tokens;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function send(path: string, options: RequestOptions, accessToken: string | null) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken && !options.anonymous) headers['Authorization'] = `Bearer ${accessToken}`;

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  if (options.signal) init.signal = options.signal;

  return fetch(buildUrl(path, options.query), init);
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { accessToken } = tokenStorage.read();
  let response = await send(path, options, accessToken);

  // One transparent retry after a refresh; a second 401 means the session is
  // genuinely over.
  if (response.status === 401 && !options.anonymous) {
    const refreshed = await refreshTokens();
    if (!refreshed) {
      tokenStorage.clear();
      onSessionExpired?.();
      throw await toApiError(response);
    }
    response = await send(path, options, refreshed.accessToken);
  }

  if (!response.ok) throw await toApiError(response);

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) =>
    apiRequest<T>(path, { method: 'GET', query, signal }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};
