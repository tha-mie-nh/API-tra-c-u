import { Injectable } from '@nestjs/common';
import { HISTORY_EXPORT_MAX_ROWS, type QueryInsightsCsvTable } from '@app/shared';
import { CSV_UTF8_BOM, toCsvRow } from '../common/csv/csv-safe-cell.util';
import { toVnIso } from '../history/history-export-csv.service';
import type { JwtUser } from '../rbac/jwt-user.interface';
import type { QueryInsightsQueryDto } from './dto/query-insights-query.dto';
import { QueryInsightsService } from './query-insights.service';

type Table = [header: string[], rows: unknown[][]];

export interface InsightsCsv { body: string; filename: string; rows: number }

const vn = (iso: string) => toVnIso(new Date(iso));

/** CSV of the SAME rows as the JSON endpoints (never the raw CCCD unless caller has view_sensitive). */
@Injectable()
export class QueryInsightsCsvService {
  constructor(private readonly insights: QueryInsightsService) {}

  private async table(t: QueryInsightsCsvTable, user: JwtUser, q: QueryInsightsQueryDto): Promise<Table> {
    switch (t) {
      case 'top-users': {
        const r = await this.insights.topUsers(q);
        return [['User ID', 'Tên đăng nhập', 'Lượt tra', 'Có dữ liệu', 'Không có dữ liệu (gap)', 'Thất bại', 'Bị từ chối', 'TB (ms)', 'P95 (ms)', 'Gần nhất (giờ VN)'],
          r.map((x) => [x.userId, x.username, x.requests, x.answered, x.gap, x.failed, x.denied, x.avgDurationMs, x.p95DurationMs, vn(x.lastAt)])];
      }
      case 'top-errors': {
        const r = await this.insights.topErrors(q);
        return [['Mã lỗi', 'HTTP status', 'Số lượt'], r.map((x) => [x.errorCode, x.statusCode, x.count])];
      }
      case 'datasource-latency': {
        const r = await this.insights.datasourceLatency(q);
        return [['Mã nguồn', 'Tên nguồn', 'Lượt tra', 'TB (ms)', 'P95 (ms)', 'Max (ms)'],
          r.map((x) => [x.datasourceCode, x.name, x.requests, x.avgDurationMs, x.p95DurationMs, x.maxDurationMs])];
      }
      default:
        return this.anomalyTable(t, user, q);
    }
  }

  private async anomalyTable(t: QueryInsightsCsvTable, user: JwtUser, q: QueryInsightsQueryDto): Promise<Table> {
    const a = await this.insights.anomalies(user, q);
    switch (t) {
      case 'anomalies-spikes':
        return [['User ID', 'Tên đăng nhập', 'Ngày (VN)', 'Số lượt', 'TB 7 ngày trước'], a.spikes.map((x) => [x.userId, x.username, x.day, x.count, x.baselineAvg])];
      case 'anomalies-off-hours':
        return [['User ID', 'Tên đăng nhập', 'Lượt ngoài giờ', 'Tổng lượt', 'Tỉ lệ', 'Đầu tiên (giờ VN)', 'Gần nhất (giờ VN)'],
          a.offHours.map((x) => [x.userId, x.username, x.offHoursCount, x.total, x.ratio, vn(x.firstAt), vn(x.lastAt)])];
      case 'anomalies-shared-identities':
        return [['Trường', 'Giá trị (đã che nếu thiếu quyền)', 'Nguồn', 'Số user', 'Số lượt', 'Người dùng', 'Đầu tiên (giờ VN)', 'Gần nhất (giờ VN)'],
          a.sharedIdentities.map((x) => [x.fieldNames.join('; '), x.valueDisplay, x.datasourceCodes.join('; '), x.distinctUsers, x.requests,
            x.users.map((u) => `${u.username} (${u.count})`).join('; '), vn(x.firstAt), vn(x.lastAt)])];
      default:
        return [['IP', 'Số user', 'Tên đăng nhập', 'Số lượt', 'Gần nhất (giờ VN)'],
          a.sharedIps.map((x) => [x.ip, x.distinctUsers, x.usernames.join('; '), x.requests, vn(x.lastAt)])];
    }
  }

  async build(t: QueryInsightsCsvTable, user: JwtUser, q: QueryInsightsQueryDto, now = new Date()): Promise<InsightsCsv> {
    const [header, all] = await this.table(t, user, q);
    const rows = all.slice(0, HISTORY_EXPORT_MAX_ROWS);
    const s = toVnIso(now);
    const stamp = `${s.slice(0, 4)}${s.slice(5, 7)}${s.slice(8, 10)}-${s.slice(11, 13)}${s.slice(14, 16)}`;
    return {
      body: CSV_UTF8_BOM + toCsvRow(header) + rows.map((r) => toCsvRow(r)).join(''),
      filename: `phan-tich-tra-cuu-${t}-${stamp}.csv`,
      rows: rows.length,
    };
  }
}
