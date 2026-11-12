import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { QueryStatsBucket, QueryStatsCounters, QueryStatsDatasourceRow } from '@shared/index';
import { QueryStatsBarChart } from './query-stats-bar-chart';
import { QueryStatsSummaryCards } from './query-stats-summary-cards';
import { QueryStatsDatasourceTable } from './query-stats-datasource-table';
import { QueryStatsTopErrorsTable } from './query-stats-top-errors-table';

const range = { from: '2026-11-04T17:00:00.000Z', to: '2026-11-11T17:00:00.000Z' };
const totals: QueryStatsCounters = {
  requests: 10, answered: 6, gap: 4, success: 8, empty: 2, failed: 1, denied: 1, errors: 2, records: 30, avgDurationMs: 12,
};
const zeroTotals: QueryStatsCounters = { ...totals, failed: 0, denied: 0, errors: 0 };
const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const hrefs = () => screen.queryAllByRole('link').map((a) => a.getAttribute('href') ?? '');

describe('summary cards drill-down', () => {
  it('links non-zero counters to /lich-su with the shared filter; 0 is plain text', () => {
    wrap(<QueryStatsSummaryCards totals={zeroTotals} drill={{ range, datasourceCode: 'ds1' }} />);
    const h = hrefs();
    expect(h.some((x) => x.includes('outcome=answered') && x.includes('datasourceCode=ds1'))).toBe(true);
    expect(h.some((x) => x.includes('outcome=gap'))).toBe(true);
    expect(h.some((x) => x.includes('outcome=empty'))).toBe(true);
    expect(h.some((x) => x.includes('status=success'))).toBe(true);
    expect(h.some((x) => x.includes('status=failed'))).toBe(false);
    expect(h.some((x) => x.includes('status=denied'))).toBe(false);
    expect(h.some((x) => x.includes('status=failed%2Cdenied'))).toBe(false);
  });
  it('no links without view_all', () => {
    wrap(<QueryStatsSummaryCards totals={totals} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
  it('shows delta vs previous and em dash when previous is 0', () => {
    const previous = { from: range.from, to: range.to, totals: { ...totals, requests: 5, errors: 0 } };
    wrap(<QueryStatsSummaryCards totals={totals} previous={previous} />);
    expect(screen.getByText(/\+100%/)).toBeInTheDocument(); // requests 10 vs 5
    expect(screen.getAllByText('—').length).toBeGreaterThan(0); // errors prev 0
  });
});

describe('bar chart drill-down', () => {
  const b: QueryStatsBucket = { ...totals, bucket: '2026-11-10T23' };
  it('hour bucket 23:00 VN links to 16:00Z-17:00Z; error segment adds status', () => {
    wrap(<QueryStatsBarChart buckets={[b]} granularity="hour" drill={{ range }} />);
    const h = hrefs();
    expect(h.length).toBeGreaterThanOrEqual(3);
    expect(h.every((x) => x.includes('from=2026-11-10T16%3A00%3A00.000Z') && x.includes('to=2026-11-10T17%3A00%3A00.000Z'))).toBe(true);
    expect(h.some((x) => x.includes('status=failed%2Cdenied'))).toBe(true);
    expect(screen.getByText('23h')).toBeInTheDocument();
  });
  it('no links when drill is undefined, and none for empty bucket', () => {
    wrap(<QueryStatsBarChart buckets={[b]} granularity="hour" />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    wrap(<QueryStatsBarChart buckets={[{ ...totals, requests: 0, answered: 0, gap: 0, success: 0, empty: 0, failed: 0, denied: 0, errors: 0, bucket: '2026-11-10' }]} granularity="day" drill={{ range }} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});

describe('datasource table + top errors', () => {
  const row: QueryStatsDatasourceRow = { ...totals, datasourceCode: 'ds1', name: 'Luồng 1' };
  it('counter links carry the row datasource; name links to detail', () => {
    wrap(<QueryStatsDatasourceTable rows={[row]} searchString="preset=last_7d" drill={{ range }} />);
    const h = hrefs();
    expect(h).toContain('/quan-tri/thong-ke/ds1?preset=last_7d');
    expect(h.filter((x) => x.startsWith('/lich-su') && x.includes('datasourceCode=ds1')).length).toBe(5);
  });
  it('no history links without view_all', () => {
    wrap(<QueryStatsDatasourceTable rows={[row]} searchString="" />);
    expect(hrefs().filter((x) => x.startsWith('/lich-su'))).toHaveLength(0);
  });
  it('top error row links with errorCode/statusCode', () => {
    wrap(<QueryStatsTopErrorsTable items={[{ errorCode: null, statusCode: 504, count: 3 }]} drill={{ range }} />);
    const [h] = hrefs();
    expect(h).toContain('errorCode=__null__');
    expect(h).toContain('statusCode=504');
  });
});
