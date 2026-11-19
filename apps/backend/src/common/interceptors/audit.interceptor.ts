import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

interface AuditContext {
  method: string;
  url: string;
  actorId?: string;
  actorRole?: string;
  ipAddress?: string;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);
  private readonly mutateMethods = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;

    if (!this.mutateMethods.has(method)) {
      return next.handle();
    }

    const user = request.user as Record<string, string> | undefined;
    const auditCtx: AuditContext = {
      method,
      url,
      actorId: user?.['sub'],
      actorRole: user?.['role'],
      ipAddress: request.ip ?? request.socket.remoteAddress,
    };

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logger.log(
            `AUDIT ${auditCtx.method} ${auditCtx.url} | actor=${auditCtx.actorId ?? 'anonymous'} role=${auditCtx.actorRole ?? 'none'} ip=${auditCtx.ipAddress} duration=${duration}ms`,
          );
        },
        error: (err: Error) => {
          this.logger.warn(
            `AUDIT_ERROR ${auditCtx.method} ${auditCtx.url} | actor=${auditCtx.actorId ?? 'anonymous'} error=${err.message}`,
          );
        },
      }),
    );
  }
}
