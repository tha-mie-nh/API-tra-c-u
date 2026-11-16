import { Injectable, type LoggerService, type LogLevel } from '@nestjs/common';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const LEVELS = ['error', 'warn', 'info', 'debug', 'trace'] as const;
type Level = (typeof LEVELS)[number];

/** Text line format (Hung's request): `%(asctime)s - %(levelname)s - %(threadName)s - %(message)s`.
 * Node has no thread name, so the slot carries the Nest context (class name, e.g. `HttpRequest`). */
export function formatLogLine(now: Date, level: Level, context: string | undefined, message: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  const asctime = `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')},${ms}`;
  return `${asctime} - ${level.toUpperCase()} - ${context ?? 'App'} - ${message}`;
}

/**
 * Plain-text logger, a drop-in `LoggerService` for `app.useLogger(...)` so every
 * existing `new Logger(Ctx)` call keeps working.
 * - stdout always (Docker `json-file` driver rotates it).
 * - `LOG_FILE` (e.g. `/var/log/app/api.log`) additionally appends to a file; a failing file write
 *   never breaks the request path (warned once on stderr).
 * - `LOG_LEVEL` error|warn|info|debug|trace (default info in prod, debug in dev); `LOG_TIMEZONE` default Asia/Ho_Chi_Minh.
 * Multi-line messages (stack traces) are kept on one logical record: newlines become ` | `.
 */
@Injectable()
export class AppTextLogger implements LoggerService {
  private readonly threshold: number;
  private readonly timeZone = process.env.LOG_TIMEZONE ?? 'Asia/Ho_Chi_Minh';
  private readonly file = process.env.LOG_FILE?.trim() || undefined;
  private fileReady: Promise<void> | undefined;
  private fileWarned = false;

  constructor() {
    const configured = (process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug')).toLowerCase();
    const normalized = configured === 'fatal' ? 'error' : configured;
    const index = LEVELS.indexOf(normalized as Level);
    this.threshold = index === -1 ? LEVELS.indexOf('info') : index;
  }

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', trace ? `${this.stringify(message)} | ${trace}` : message, context);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('trace', message, context);
  }

  setLogLevels?(levels: LogLevel[]): void {
    void levels; // level is env-driven (LOG_LEVEL)
  }

  private write(level: Level, message: unknown, context?: string): void {
    if (LEVELS.indexOf(level) > this.threshold) return;
    const text = this.stringify(message).replace(/\r?\n/g, ' | ');
    const line = formatLogLine(new Date(), level, context, text, this.timeZone);
    (level === 'error' ? process.stderr : process.stdout).write(`${line}\n`);
    if (this.file) void this.appendToFile(line);
  }

  private async appendToFile(line: string): Promise<void> {
    try {
      this.fileReady ??= mkdir(dirname(this.file as string), { recursive: true }).then(() => undefined);
      await this.fileReady;
      await appendFile(this.file as string, `${line}\n`);
    } catch (err) {
      if (!this.fileWarned) {
        this.fileWarned = true;
        process.stderr.write(`LOG_FILE "${this.file}" not writable, file logging disabled: ${(err as Error).message}\n`);
      }
    }
  }

  private stringify(message: unknown): string {
    return typeof message === 'string' ? message : message instanceof Error ? message.message : JSON.stringify(message);
  }
}
