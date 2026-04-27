import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantStorage } from './tenant.context';

/**
 * Runs each request inside an AsyncLocalStorage scope so services can resolve
 * the tenant without threading context through every method signature.
 * Assumes JwtAuthGuard has populated req.user.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const u = req.user;
    if (!u) return next.handle();
    return new Observable((subscriber) => {
      tenantStorage.run(
        {
          tenantId: u.tenantId,
          userId: u.id,
          email: u.email,
          roles: u.roles,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        },
        () => {
          next.handle().subscribe({
            next: (v) => subscriber.next(v),
            error: (e) => subscriber.error(e),
            complete: () => subscriber.complete(),
          });
        },
      );
    });
  }
}
