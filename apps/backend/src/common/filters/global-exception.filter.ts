import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { mapPrismaError } from '../utils/prisma-error.mapper';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly isProduction: boolean;

  constructor(nodeEnv: string) {
    this.isProduction = nodeEnv === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp['message'] as string | string[]) ?? exception.message;
        error = (resp['error'] as string) ?? exception.name;
      }
    } else if (exception instanceof Error) {
      // Try mapping Prisma errors
      const mapped = mapPrismaError(exception);
      if (mapped) {
        status = mapped.status;
        message = mapped.message;
        error = mapped.error;
      } else {
        // Capture unknown errors to Sentry
        Sentry.captureException(exception);
        this.logger.error(
          `Unhandled exception: ${exception.message}`,
          exception.stack,
        );
        // In production, don't leak internal error details
        if (this.isProduction) {
          message = 'Internal server error';
          error = 'Internal Server Error';
        } else {
          message = exception.message;
          error = exception.name;
        }
      }
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(errorResponse);
  }
}
