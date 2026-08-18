import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { NexaraError } from './nexara-error';

type RequestWithId = Request & { requestId?: string };

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const requestId = request.requestId ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';

    if (exception instanceof NexaraError) {
      status = exception.status;
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
        code = 'INVALID_REQUEST';
      } else if (typeof payload === 'object' && payload !== null) {
        const body = payload as { message?: string | string[]; error?: string };
        const rawMessage = body.message;
        message = Array.isArray(rawMessage)
          ? rawMessage.join(', ')
          : (rawMessage ?? exception.message);
        code = 'INVALID_REQUEST';
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled error requestId=${requestId}: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(`Unhandled error requestId=${requestId}`);
    }

    if (!(exception instanceof NexaraError) && !(exception instanceof HttpException)) {
      this.logger.error(
        `status=${status} code=${code} requestId=${requestId} message=${message}`,
      );
    }

    response.status(status).json({
      code,
      message,
      requestId,
    });
  }
}
