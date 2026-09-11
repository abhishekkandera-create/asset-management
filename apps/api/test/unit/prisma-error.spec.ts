import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@asset/shared';
import {
  isOpenAssignmentConflict,
  translatePrismaError,
} from '../../src/common/errors/prisma-error';
import { AssetAlreadyAssignedError } from '../../src/common/errors/domain-error';

function uniqueViolation(target: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

describe('translatePrismaError', () => {
  it('turns the partial-index violation into a clean 409 (CLAUDE.md §2.4)', () => {
    const error = translatePrismaError(uniqueViolation('assignment_one_open_per_asset'));
    expect(error).toBeInstanceOf(AssetAlreadyAssignedError);
    expect(error?.code).toBe(ErrorCode.ASSET_ALREADY_ASSIGNED);
    expect(error?.status).toBe(409);
  });

  it('recognises the violation however the target arrives', () => {
    expect(isOpenAssignmentConflict(uniqueViolation('assignment_one_open_per_asset'))).toBe(true);
    expect(
      isOpenAssignmentConflict(
        new Prisma.PrismaClientKnownRequestError('x', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['assignment_one_open_per_asset'] },
        }),
      ),
    ).toBe(true);
  });

  it('names the specific duplicate for tags, serials and employee codes', () => {
    expect(translatePrismaError(uniqueViolation('asset_asset_tag_key'))?.code).toBe(
      ErrorCode.DUPLICATE_ASSET_TAG,
    );
    expect(translatePrismaError(uniqueViolation('asset_serial_number_key'))?.code).toBe(
      ErrorCode.DUPLICATE_SERIAL_NUMBER,
    );
    expect(translatePrismaError(uniqueViolation('employee_employee_code_key'))?.code).toBe(
      ErrorCode.DUPLICATE_EMPLOYEE_CODE,
    );
  });

  it('falls back to a generic duplicate for an unmapped constraint', () => {
    expect(translatePrismaError(uniqueViolation('some_other_key'))?.code).toBe(
      ErrorCode.DUPLICATE_RECORD,
    );
  });

  it('maps a missing record to NOT_FOUND', () => {
    const error = translatePrismaError(
      new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );
    expect(error?.code).toBe(ErrorCode.NOT_FOUND);
    expect(error?.status).toBe(404);
  });

  it('returns null for anything it cannot explain, so it surfaces as a 500', () => {
    expect(
      translatePrismaError(
        new Prisma.PrismaClientKnownRequestError('Pool timeout', {
          code: 'P2024',
          clientVersion: 'test',
        }),
      ),
    ).toBeNull();
    expect(translatePrismaError(new Error('boom'))).toBeNull();
    expect(isOpenAssignmentConflict(new Error('boom'))).toBe(false);
  });
});

describe('isOpenAssignmentConflict — the shape Prisma actually emits', () => {
  it('recognises a uniqueness failure reported by column on the Assignment model', () => {
    // Prisma does not know about the partial index (it cannot be expressed in
    // the schema), so it reports the columns instead of the index name.
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { modelName: 'Assignment', target: ['asset_id'] },
    });

    expect(isOpenAssignmentConflict(error)).toBe(true);
    expect(translatePrismaError(error)).toBeInstanceOf(AssetAlreadyAssignedError);
  });

  it('does not mistake an asset_id uniqueness failure on another model for it', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { modelName: 'StockBalance', target: ['asset_id'] },
    });
    expect(isOpenAssignmentConflict(error)).toBe(false);
  });
});
