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

    const err = ex as Error & { code?: string };
    this.log.error(err?.stack ?? err?.message ?? String(ex));
    const payload: Record<string, unknown> = { ...base, detail: 'Unexpected error' };
    if (process.env.NODE_ENV !== 'production') {
      payload.detail = err?.message ?? 'Unexpected error';
      payload.name = err?.name;
      payload.code = err?.code;
      payload.stack = err?.stack?.split('\n').slice(0, 10);
    }
    res.status(status).json(payload);
  }
}
