import type { PrismaService } from '../../src/prisma/prisma.service';
import { toQueryLogData, type RowInput } from './query-log-e2e-fixtures';

/** Rows for query-insights e2e. Everything is tagged by a username prefix so filters isolate it from other data. */
export interface InsightsRow extends RowInput { userAgent?: string | null }

export const insightsAt = (day: string, vnTime: string): string => `${day}T${vnTime}+07:00`;

export async function insertRows(prisma: PrismaService, rows: InsightsRow[]): Promise<void> {
  await prisma.queryLog.createMany({ data: rows.map((r) => ({ ...toQueryLogData(r), userAgent: r.userAgent ?? null })) });
}

/** `n` rows for one user, one per minute from `vnTime` on `day`. */
export function burst(base: Omit<InsightsRow, 'at'>, day: string, n: number, hour = 10): InsightsRow[] {
  return Array.from({ length: n }, (_, i) => ({
    ...base,
    at: insightsAt(day, `${String(hour).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`),
  }));
}

export async function waitAudit(prisma: PrismaService, action: string, actorUserId: string, targetId?: string) {
  for (let i = 0; i < 30; i++) {
    const row = await prisma.auditLog.findFirst({ where: { action, actorUserId, ...(targetId ? { targetId } : {}) }, orderBy: { createdAt: 'desc' } });
    if (row) return row;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

/** Minimal RFC4180 parser. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += ch;
  }
  return rows;
}
