import { ForbiddenException, Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';
import { FEATURE_PERMISSION_CODES, HISTORY_EXPORT_MAX_ROWS } from '@app/shared';
import type { JwtUser } from '../rbac/jwt-user.interface';
import { CSV_UTF8_BOM, toCsvRow } from '../common/csv/csv-safe-cell.util';
import { HistoryListSqlRepository, type ExportCursor } from './history-list-sql.repository';
import { resolveQueryLogScope } from './query-log-filter/resolve-query-log-scope';
import { buildQueryLogWhereSql } from './query-log-filter/query-log-where-sql.builder';
import type { QueryLogFilter } from './query-log-filter/query-log-filter-query.schema';
import { QueryLogRowMapper } from './query-log-row-mapper';

const BATCH_SIZE = 1000;
const VN_OFFSET_MS = 7 * 3_600_000;

const HEADER = [
  'ID', 'Thời điểm (giờ VN)', 'Tên đăng nhập', 'User ID', 'Nguồn', 'Điều kiện tra cứu (đã che)', 'Trạng thái',
  'HTTP status', 'Mã lỗi', 'Thông báo lỗi', 'Số bản ghi', 'Thời gian xử lý (ms)', 'Upstream request ID', 'IP', 'User-Agent',
];

export interface PreparedCsvExport {
  stream: Readable;
  filename: string;
  /** Rows matching the filter (pinned at export start). */
  matched: number;
  /** Rows that will be written = min(matched, maxRows). */
  exported: number;
  truncated: boolean;
  maxRows: number;
}

/** ISO-8601 with explicit +07:00 (Asia/Ho_Chi_Minh has no DST). */
export function toVnIso(d: Date): string {
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().replace('Z', '+07:00');
}

/** `lich-su-tra-cuu-YYYYMMDD-HHmm.csv` in VN time. */
export function exportFilename(now: Date): string {
  const s = toVnIso(now); // 2026-11-11T16:39:00.000+07:00
  return `lich-su-tra-cuu-${s.slice(0, 4)}${s.slice(5, 7)}${s.slice(8, 10)}-${s.slice(11, 13)}${s.slice(14, 16)}.csv`;
}

/** Streams the SAME row set as the list (same builder + scope + mapper), newest first, keyset-paged. */
@Injectable()
export class HistoryExportCsvService {
  constructor(
    private readonly repo: HistoryListSqlRepository,
    private readonly mapper: QueryLogRowMapper,
  ) {}

  async prepare(
    caller: JwtUser,
    permissions: Set<string>,
    filter: QueryLogFilter,
    maxRows: number = HISTORY_EXPORT_MAX_ROWS,
  ): Promise<PreparedCsvExport> {
    const access = resolveQueryLogScope(caller, permissions);
    // history:export alone is not enough — it must come with a way to see rows (view_own/view_all).
    if (!access.canViewAll && !permissions.has(FEATURE_PERMISSION_CODES.HISTORY_VIEW_OWN)) {
      throw new ForbiddenException({ code: 'FORBIDDEN_API', message: 'Access denied' });
    }

    // Pin the upper bound so rows inserted while streaming don't shift keyset pages or the count.
    const now = new Date();
    const pinned: QueryLogFilter = { ...filter, to: filter.to && filter.to < now ? filter.to : now };
    const where = buildQueryLogWhereSql(pinned, access.scope);

    const matched = await this.repo.count(where);
    const exported = Math.min(matched, maxRows);
    const stream = Readable.from(this.rows(where, exported, access.canViewSensitive));
    return { stream, filename: exportFilename(now), matched, exported, truncated: matched > maxRows, maxRows };
  }

  private async *rows(where: ReturnType<typeof buildQueryLogWhereSql>, limit: number, canViewSensitive: boolean): AsyncGenerator<string> {
    yield CSV_UTF8_BOM + toCsvRow(HEADER);
    let cursor: ExportCursor | null = null;
    let written = 0;
    while (written < limit) {
      const batch = await this.repo.exportBatch(where, cursor, Math.min(BATCH_SIZE, limit - written));
      if (batch.length === 0) return;
      let chunk = '';
      for (const r of batch) {
        chunk += toCsvRow([
          r.id, toVnIso(r.createdAt), r.usernameSnapshot, r.userId, r.datasourceCode,
          this.mapper.maskedParams(r, canViewSensitive).summary, r.status, r.statusCode, r.errorCode,
          r.errorMessage, r.recordCount, r.durationMs, r.upstreamRequestId, r.ip, r.userAgent,
        ]);
      }
      yield chunk;
      written += batch.length;
      const last = batch[batch.length - 1]!;
      cursor = { createdAtRaw: last.createdAtRaw, id: last.id };
    }
  }
}
