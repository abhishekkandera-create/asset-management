import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ZodValidationException } from 'nestjs-zod';
import { ErrorCode, ErrorEnvelope } from '@asset/shared';
import { DomainError } from './domain-error';
import { translatePrismaError } from './prisma-error';

/**
 * The one filter that maps every thrown thing to the error envelope
 * `{ error: { code, message, details? } }` (CLAUDE.md §8, §13).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.toEnvelope(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { err: exception, path: request.url, method: request.method },
        `Unhandled error on ${request.method} ${request.url}`,
      );
    } else {
      this.logger.debug(
        { code: body.error.code, path: request.url, method: request.method },
        body.error.message,
      );
    }

    response.status(status).json(body);
  }

  private toEnvelope(exception: unknown): { status: number; body: ErrorEnvelope } {
    if (exception instanceof DomainError) {
      return {
        status: exception.status,
        body: {
          error: { code: exception.code, message: exception.message, details: exception.details },
        },
      };
    }

    const prismaError = translatePrismaError(exception);
    if (prismaError) {
      return {
        status: prismaError.status,
        body: {
          error: {
            code: prismaError.code,
            message: prismaError.message,
            details: prismaError.details,
          },
        },
      };
    }

    if (exception instanceof ZodValidationException) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          error: {
            code: ErrorCode.VALIDATION_FAILED,
            message: 'The request body or query string failed validation',
            details: formatZodIssues(exception.getZodError()),
          },
        },
      };
    }

    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          error: {
            code: ErrorCode.VALIDATION_FAILED,
            message: 'The request body or query string failed validation',
            details: formatZodIssues(exception),
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      return { status: exception.getStatus(), body: httpExceptionToEnvelope(exception) };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: { code: ErrorCode.INTERNAL_ERROR, message: 'An unexpected error occurred' },
      },
    };
  }
}

/** `[{ path: 'employeeId', message: 'Invalid uuid' }]` — what a form can render. */
function formatZodIssues(error: ZodError | { issues?: ZodError['issues'] }): Array<{
  path: string;
  message: string;
}> {
  const issues = 'issues' in error ? (error.issues ?? []) : [];
  return issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.VALIDATION_FAILED,
};

function httpExceptionToEnvelope(exception: HttpException): ErrorEnvelope {
  const status = exception.getStatus();
  const payload = exception.getResponse();
  const fallbackCode =
    STATUS_TO_CODE[status] ??
    (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_FAILED);

  if (typeof payload === 'string') {
    return { error: { code: fallbackCode, message: payload } };
  }

  const record = payload as Record<string, unknown>;
  // An envelope thrown from deeper in the stack passes through untouched.
  if (record['error'] && typeof record['error'] === 'object') {
    return record as unknown as ErrorEnvelope;
  }

  const message = record['message'];
  return {
    error: {
      code: typeof record['code'] === 'string' ? (record['code'] as ErrorCode) : fallbackCode,
      message: Array.isArray(message)
        ? message.join('; ')
        : typeof message === 'string'
          ? message
          : exception.message,
    },
  };
}
