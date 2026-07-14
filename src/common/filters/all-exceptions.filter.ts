import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

/** Maps HTTP status codes to the doc's error-code enum. */
const CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'BUSINESS_RULE_VIOLATION',
};

interface FieldError {
  field: string;
  message: string;
}

/**
 * Shapes every error into the API's standard envelope:
 * `{ status, code, message, errors?, timestamp, requestId }`.
 * class-validator failures (BadRequest with a `message: string[]`) are expanded
 * into per-field `errors`.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = randomUUID();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: FieldError[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const raw = body as { message?: unknown; error?: unknown };
        if (Array.isArray(raw.message)) {
          message = 'Invalid input data';
          errors = raw.message.map((m) => this.toFieldError(String(m)));
        } else if (typeof raw.message === 'string') {
          message = raw.message;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    const code =
      CODE_BY_STATUS[status] ??
      (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR');

    res.status(status).json({
      status: 'error',
      code,
      message,
      ...(errors ? { errors } : {}),
      timestamp: new Date().toISOString(),
      requestId,
      path: req.url,
    });
  }

  /** Best-effort split of a class-validator message into `{ field, message }`. */
  private toFieldError(message: string): FieldError {
    const field = message.split(' ')[0] ?? 'unknown';
    return { field, message };
  }
}
