import type { ErrorCode } from '@asset/shared';

export interface ApiErrorDetail {
  path: string;
  message: string;
}

/**
 * Every non-2xx response from the API arrives in the envelope
 * `{ error: { code, message, details? } }` (CLAUDE.md §8). This turns one into
 * something callers can switch on.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level messages, when the failure was validation. */
  get fieldErrors(): ApiErrorDetail[] {
    if (!Array.isArray(this.details)) return [];
    return this.details.filter(
      (detail): detail is ApiErrorDetail =>
        typeof detail === 'object' &&
        detail !== null &&
        typeof (detail as ApiErrorDetail).path === 'string',
    );
  }

  is(code: ErrorCode | string): boolean {
    return this.code === code;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** A message safe to put in front of a user, whatever was thrown. */
export function messageOf(error: unknown): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
