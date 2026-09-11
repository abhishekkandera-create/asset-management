import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@asset/shared';

/**
 * Base class for every business-rule violation. Services throw these; the
 * global filter is the only thing that knows how to turn one into an HTTP
 * response (CLAUDE.md §13). Nothing in a service references HttpException.
 */
export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly status: HttpStatus;
  readonly details?: unknown;

  protected constructor(message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

// --- 404 --------------------------------------------------------------------

export class RecordNotFoundError extends DomainError {
  readonly code = ErrorCode.NOT_FOUND;
  readonly status = HttpStatus.NOT_FOUND;

  constructor(entity: string, id?: string) {
    super(id ? `${entity} ${id} was not found` : `${entity} was not found`, { entity, id });
  }
}

// --- 409 conflict -----------------------------------------------------------

export class AssetAlreadyAssignedError extends DomainError {
  readonly code = ErrorCode.ASSET_ALREADY_ASSIGNED;
  readonly status = HttpStatus.CONFLICT;

  constructor(assetId: string) {
    super('This asset already has an open assignment and cannot be issued again', { assetId });
  }
}

export class DuplicateRecordError extends DomainError {
  readonly code: ErrorCode;
  readonly status = HttpStatus.CONFLICT;

  constructor(message: string, code: ErrorCode = ErrorCode.DUPLICATE_RECORD, details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class StaleVersionError extends DomainError {
  readonly code = ErrorCode.STALE_VERSION;
  readonly status = HttpStatus.CONFLICT;

  constructor(entity: string, id: string) {
    super(`${entity} ${id} was modified by someone else. Reload the record and try again.`, {
      entity,
      id,
    });
  }
}

// --- 422 unprocessable ------------------------------------------------------

export class InvalidTransitionError extends DomainError {
  readonly code = ErrorCode.INVALID_TRANSITION;
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;

  constructor(from: string, to: string, allowed: readonly string[]) {
    super(`An asset cannot move from ${from} to ${to}`, { from, to, allowed });
  }
}

export class AssetNotAvailableError extends DomainError {
  readonly code = ErrorCode.ASSET_NOT_AVAILABLE;
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;

  constructor(assetTag: string, status: string) {
    super(`Asset ${assetTag} is ${status} and cannot be issued`, { assetTag, status });
  }
}

export class AssetNotAssignedError extends DomainError {
  readonly code = ErrorCode.ASSET_NOT_ASSIGNED;
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;

  constructor(assetTag: string) {
    super(`Asset ${assetTag} has no open assignment`, { assetTag });
  }
}

export class EmployeeExitedError extends DomainError {
  readonly code = ErrorCode.EMPLOYEE_EXITED;
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;

  constructor(employeeId: string) {
    super('Assets cannot be issued to an employee who has exited', { employeeId });
  }
}

export class EmployeeHasOpenAssignmentsError extends DomainError {
  readonly code = ErrorCode.EMPLOYEE_HAS_OPEN_ASSIGNMENTS;
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;

  constructor(employeeId: string, openCount: number) {
    super(
      `This employee still holds ${openCount} asset${openCount === 1 ? '' : 's'}. ` +
        `Each must be returned or written off before they can be marked as exited.`,
      { employeeId, openCount },
    );
  }
}

export class BusinessRuleError extends DomainError {
  readonly code: ErrorCode;
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

// --- 401 / 403 --------------------------------------------------------------

export class InvalidCredentialsError extends DomainError {
  readonly code = ErrorCode.INVALID_CREDENTIALS;
  readonly status = HttpStatus.UNAUTHORIZED;

  constructor() {
    // Deliberately vague: never reveal whether the email exists.
    super('Email or password is incorrect');
  }
}

export class InvalidRefreshTokenError extends DomainError {
  readonly code = ErrorCode.INVALID_REFRESH_TOKEN;
  readonly status = HttpStatus.UNAUTHORIZED;

  constructor(reason = 'Refresh token is invalid or has expired') {
    super(reason);
  }
}

export class UserInactiveError extends DomainError {
  readonly code = ErrorCode.USER_INACTIVE;
  readonly status = HttpStatus.FORBIDDEN;

  constructor() {
    super('This account has been deactivated');
  }
}

export class ForbiddenActionError extends DomainError {
  readonly code = ErrorCode.FORBIDDEN;
  readonly status = HttpStatus.FORBIDDEN;

  constructor(message = 'Your role does not permit this action', details?: unknown) {
    super(message, details);
  }
}
