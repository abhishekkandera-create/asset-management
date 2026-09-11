import { Prisma } from '@prisma/client';
import { ErrorCode } from '@asset/shared';
import {
  AssetAlreadyAssignedError,
  type DomainError,
  DuplicateRecordError,
  RecordNotFoundError,
} from './domain-error';

/** Index name from the §2.4 migration. Its violation is the concurrency guard. */
const ONE_OPEN_ASSIGNMENT_INDEX = 'assignment_one_open_per_asset';

/**
 * Prisma reports a uniqueness violation by the *columns* involved, scoped to
 * the model — `{ modelName: 'Asset', target: ['asset_tag'] }` — not by the
 * constraint name Postgres used. Both shapes are mapped: the `model:column`
 * form is what the client actually emits, and the bare constraint name is what
 * a raw query reports.
 */
const UNIQUE_TARGET_TO_CODE: Record<string, ErrorCode> = {
  'Asset:asset_tag': ErrorCode.DUPLICATE_ASSET_TAG,
  'Asset:serial_number': ErrorCode.DUPLICATE_SERIAL_NUMBER,
  'Employee:employee_code': ErrorCode.DUPLICATE_EMPLOYEE_CODE,
  'Employee:email': ErrorCode.DUPLICATE_EMPLOYEE_EMAIL,

  asset_asset_tag_key: ErrorCode.DUPLICATE_ASSET_TAG,
  asset_serial_number_key: ErrorCode.DUPLICATE_SERIAL_NUMBER,
  employee_employee_code_key: ErrorCode.DUPLICATE_EMPLOYEE_CODE,
  employee_email_key: ErrorCode.DUPLICATE_EMPLOYEE_EMAIL,
};

function targetOf(error: Prisma.PrismaClientKnownRequestError): string {
  const target = error.meta?.['target'];
  if (typeof target === 'string') return target;
  if (Array.isArray(target)) return target.join(', ');
  return '';
}

/**
 * Translates a Prisma error into a domain error, or returns null when it is
 * not something the application can explain. Returning null matters: an
 * unrecognised database error must surface as a 500, never be flattened into a
 * misleading 4xx.
 */
export function translatePrismaError(error: unknown): DomainError | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;

  switch (error.code) {
    case 'P2002': {
      const target = targetOf(error);
      // The partial unique index firing means another request opened an
      // assignment for this asset first (CLAUDE.md §2.4) — a clean 409.
      if (isOpenAssignmentConflict(error)) {
        return new AssetAlreadyAssignedError(String(error.meta?.['assetId'] ?? 'unknown'));
      }
      const modelName = error.meta?.['modelName'];
      const scoped = typeof modelName === 'string' ? `${modelName}:${target}` : null;
      const code =
        (scoped ? UNIQUE_TARGET_TO_CODE[scoped] : undefined) ??
        UNIQUE_TARGET_TO_CODE[target] ??
        ErrorCode.DUPLICATE_RECORD;
      return new DuplicateRecordError(
        `A record with the same ${target || 'unique value'} already exists`,
        code,
        { constraint: target },
      );
    }
    case 'P2025':
      return new RecordNotFoundError('Record');
    case 'P2003':
      return new DuplicateRecordError(
        'A referenced record does not exist',
        ErrorCode.VALIDATION_FAILED,
        { constraint: error.meta?.['field_name'] },
      );
    default:
      return null;
  }
}

/**
 * True when the failure is specifically the one-open-assignment guard.
 *
 * Prisma reports a violation of an index it does not know about by the columns
 * involved rather than by name, so this recognises both shapes: `asset_id` on
 * the Assignment model (what the client actually emits) and the index name
 * itself (what a raw query reports).
 */
export function isOpenAssignmentConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = targetOf(error);
  if (target.includes(ONE_OPEN_ASSIGNMENT_INDEX)) return true;
  // `assignment (asset_id)` carries exactly one unique index — the partial one
  // from §2.4 — so a uniqueness failure on that column can only be this rule.
  return error.meta?.['modelName'] === 'Assignment' && target === 'asset_id';
}
