import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * One log line when a request arrives and one when its response is sent
 * (so a request that never completes is still visible). Never logs bodies,
 * query strings or headers — they hold CCCD/PII and credentials.
 * Runs after `RequestIdMiddleware`; `req.user` is set later by the JWT guard, so it is read on finish.
 */
@Injectable()
export class HttpAccessLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HttpRequest');

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const path = req.originalUrl.split('?')[0] ?? req.originalUrl;
    const noisy = path.endsWith('/health') || path.includes('/health/');
    const requestId = req.requestId;
    const ip = req.ip ?? '-';

    (noisy ? this.logger.debug : this.logger.log).call(this.logger, `--> ${req.method} ${path} requestId=${requestId} ip=${ip}`);

    res.on('finish', () => {
      const user = req.user?.username ?? '-';
      const line = `<-- ${req.method} ${path} ${res.statusCode} ${Date.now() - startedAt}ms requestId=${requestId} user=${user}`;
      if (res.statusCode >= 500) this.logger.error(line);
      else if (res.statusCode >= 400) this.logger.warn(line);
      else (noisy ? this.logger.debug : this.logger.log).call(this.logger, line);
    });
    res.on('close', () => {
      if (!res.writableFinished) {
        this.logger.warn(`<-- ${req.method} ${path} aborted by client after ${Date.now() - startedAt}ms requestId=${requestId}`);
      }
    });
    next();
  }
}
