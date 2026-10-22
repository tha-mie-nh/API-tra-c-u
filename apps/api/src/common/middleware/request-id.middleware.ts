import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

const HEADER_NAME = 'x-request-id';

/**
 * Phase 05 non-functional requirement: "X-Request-Id on every response and
 * in every log row". Accepts an inbound id (lets an API gateway / the FE
 * correlate its own trace) or generates one, stashes it on `req.requestId`
 * for controllers/services/HttpExceptionFilter to reuse, and always echoes
 * it back as a response header.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const inbound = req.header(HEADER_NAME);
    const requestId = inbound && inbound.trim().length > 0 ? inbound.trim() : randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
