import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/** RFC 7807 Problem Details error responses. */
@Catch()
export class HttpProblemFilter implements ExceptionFilter {
  private readonly log = new Logger('HttpProblemFilter');

  catch(ex: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<{ url?: string }>();

    const status =
      ex instanceof HttpException ? ex.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const base = {
      type: `https://naturalshea.care/errors/${status}`,
      title: HttpStatus[status] ?? 'Error',
      status,
      instance: req.url,
    };

    if (ex instanceof HttpException) {
      const r = ex.getResponse();
      const detail = typeof r === 'string' ? { title: r } : (r as object);
      res.status(status).json({ ...base, ...detail });
      return;
    }

    this.log.error('unhandled', ex as Error);
    res.status(status).json({ ...base, detail: 'Unexpected error' });
  }
}
