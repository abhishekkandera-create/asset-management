import { BadRequestException, Param, ParseUUIDPipe } from '@nestjs/common';
import { ErrorCode } from '@asset/shared';

/**
 * `@UuidParam('id')` instead of a bare `@Param('id')`, so a malformed id is a
 * 400 in the standard envelope rather than a 500 from Postgres rejecting the
 * cast (CLAUDE.md §8).
 */
export const UuidParam = (name: string): ParameterDecorator =>
  Param(
    name,
    new ParseUUIDPipe({
      exceptionFactory: () =>
        new BadRequestException({
          error: {
            code: ErrorCode.VALIDATION_FAILED,
            message: `${name} must be a valid uuid`,
            details: [{ path: name, message: 'Invalid uuid' }],
          },
        }),
    }),
  );
