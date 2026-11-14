import { Catch, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../../domain/domain-error.js';
import type { DomainErrorKind } from '../../domain/domain-error.js';

const STATUS_BY_KIND: Record<DomainErrorKind, HttpStatus> = {
  invalid: HttpStatus.BAD_REQUEST,
  unauthenticated: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
};

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (error.retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', String(error.retryAfterSeconds));
    }

    const body = error.resetsAt
      ? { message: error.message, resetsAt: error.resetsAt.toISOString() }
      : { message: error.message };

    response.status(STATUS_BY_KIND[error.kind]).json(body);
  }
}
