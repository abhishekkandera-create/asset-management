import { type ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ErrorCode } from '@asset/shared';
import { AllExceptionsFilter } from '../../src/common/errors/all-exceptions.filter';
import {
  AssetAlreadyAssignedError,
  EmployeeHasOpenAssignmentsError,
  InvalidCredentialsError,
  InvalidTransitionError,
  RecordNotFoundError,
} from '../../src/common/errors/domain-error';

/** Captures whatever the filter writes, so we can assert on the envelope. */
function capture(): { host: ArgumentsHost; status: () => number; body: () => unknown } {
  let sentStatus = 0;
  let sentBody: unknown;

  const response = {
    status(code: number) {
      sentStatus = code;
      return this;
    },
    json(payload: unknown) {
      sentBody = payload;
      return this;
    },
  };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ url: '/api/v1/assets/x/issue', method: 'POST' }),
    }),
  } as unknown as ArgumentsHost;

  return { host, status: () => sentStatus, body: () => sentBody };
}

function run(exception: unknown): { status: number; body: any } {
  const filter = new AllExceptionsFilter();
  // The filter logs; nothing under test depends on that output.
  vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  vi.spyOn(filter['logger'], 'debug').mockImplementation(() => undefined);

  const sink = capture();
  filter.catch(exception, sink.host);
  return { status: sink.status(), body: sink.body() as any };
}

describe('AllExceptionsFilter — the single error envelope (CLAUDE.md §8)', () => {
  it('maps a not-found domain error to 404 with a stable code', () => {
    const { status, body } = run(new RecordNotFoundError('Asset', 'abc'));
    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body.error.code).toBe(ErrorCode.NOT_FOUND);
    expect(body.error.message).toContain('abc');
  });

  it('maps a double issue to 409 ASSET_ALREADY_ASSIGNED', () => {
    const { status, body } = run(new AssetAlreadyAssignedError('asset-1'));
    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body.error.code).toBe(ErrorCode.ASSET_ALREADY_ASSIGNED);
  });

  it('maps an invalid status transition to 422 with the allowed set attached', () => {
    const { status, body } = run(new InvalidTransitionError('RETIRED', 'ASSIGNED', []));
    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body.error.code).toBe(ErrorCode.INVALID_TRANSITION);
    expect(body.error.details).toEqual({ from: 'RETIRED', to: 'ASSIGNED', allowed: [] });
  });

  it('maps a blocked employee exit to 422 and says how many items block it', () => {
    const { status, body } = run(new EmployeeHasOpenAssignmentsError('emp-1', 3));
    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body.error.code).toBe(ErrorCode.EMPLOYEE_HAS_OPEN_ASSIGNMENTS);
    expect(body.error.details).toEqual({ employeeId: 'emp-1', openCount: 3 });
  });

  it('keeps a failed login vague about which half was wrong', () => {
    const { status, body } = run(new InvalidCredentialsError());
    expect(status).toBe(HttpStatus.UNAUTHORIZED);
    expect(body.error.message).toBe('Email or password is incorrect');
  });

  it('turns a Zod error into per-field details a form can render', () => {
    const error = z.object({ employeeId: z.string().uuid() }).safeParse({ employeeId: 'nope' });
    expect(error.success).toBe(false);
    const { status, body } = run(error.success ? null : error.error);
    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(body.error.details).toEqual([{ path: 'employeeId', message: 'Invalid uuid' }]);
  });

  it('wraps a plain HttpException in the envelope instead of leaking Nest shape', () => {
    const { status, body } = run(new HttpException('Nope', HttpStatus.FORBIDDEN));
    expect(status).toBe(HttpStatus.FORBIDDEN);
    expect(body).toEqual({ error: { code: ErrorCode.FORBIDDEN, message: 'Nope' } });
  });

  it('passes through an envelope thrown from deeper in the stack', () => {
    const thrown = new HttpException(
      { error: { code: ErrorCode.USER_INACTIVE, message: 'Deactivated' } },
      HttpStatus.FORBIDDEN,
    );
    const { body } = run(thrown);
    expect(body.error).toEqual({ code: ErrorCode.USER_INACTIVE, message: 'Deactivated' });
  });

  it('never leaks an unexpected error to the client', () => {
    const { status, body } = run(new Error('connection string is postgres://user:hunter2@db'));
    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body).toEqual({
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'An unexpected error occurred' },
    });
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });
});
