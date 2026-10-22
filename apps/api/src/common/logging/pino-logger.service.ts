import { Injectable, type LoggerService, type LogLevel } from '@nestjs/common';
import pino, { type Logger as PinoInstance } from 'pino';

/**
 * Structured JSON stdout logger (phase-09 non-functional requirement:
 * "structured JSON logs (pino) to stdout" + Docker `json-file` driver with
 * rotation reads these lines). Implements Nest's `LoggerService` interface so
 * it's a drop-in replacement via `app.useLogger(new PinoLoggerService())` in
 * main.ts — no change to how any existing module calls `new Logger(Ctx)` /
 * `this.logger.log(...)` throughout the app (Nest routes those calls through
 * whatever logger `useLogger` registered).
 *
 * `LOG_LEVEL` env var controls verbosity (default: 'info' prod, 'debug' dev).
 * Deliberately minimal — no log shipping/aggregation stack (YAGNI at 50 users,
 * see phase-09 Key Insights); stdout + Docker's own log rotation is enough.
 */
@Injectable()
export class PinoLoggerService implements LoggerService {
  private readonly pino: PinoInstance;

  constructor() {
    const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
    this.pino = pino({ level, base: { service: 'api' } });
  }

  log(message: unknown, context?: string): void {
    this.pino.info({ context }, this.stringify(message));
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.pino.error({ context, trace }, this.stringify(message));
  }

  warn(message: unknown, context?: string): void {
    this.pino.warn({ context }, this.stringify(message));
  }

  debug(message: unknown, context?: string): void {
    this.pino.debug({ context }, this.stringify(message));
  }

  verbose(message: unknown, context?: string): void {
    this.pino.trace({ context }, this.stringify(message));
  }

  setLogLevels?(levels: LogLevel[]): void {
    // Nest calls this when configured with an explicit level list; pino's
    // level is already env-driven above, so this is intentionally a no-op.
    void levels;
  }

  private stringify(message: unknown): string {
    return typeof message === 'string' ? message : JSON.stringify(message);
  }
}
