import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

const HEADER_NAME = 'x-request-id';
/** Inbound ids land in every log line, so only a short, plain token is accepted (no spaces/newlines = no log injection). */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

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
    const requestId = inbound && SAFE_REQUEST_ID.test(inbound.trim()) ? inbound.trim() : randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
