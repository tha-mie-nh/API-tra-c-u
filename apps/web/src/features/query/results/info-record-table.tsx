import type { ComponentType, ReactNode } from 'react';
import { useReactTable, getCoreRowModel, createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import type { QueryColumn, QueryRecord } from '@shared/index';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime } from '@/lib/format';
import { Base64ImageCell } from './base64-image-cell';

/** Fixed, small vocabulary of icon keys a datasource's `output.fields[].iconMap`
 * can reference (see `datasource-config.types.ts`'s `OutputFieldDef.iconMap`
 * doc comment) — not arbitrary icon names, so config.json can't reference a
 * component that doesn't exist here. */
const ICON_BY_KEY: Record<string, ComponentType<{ className?: string }>> = {
  'arrow-up-right': ArrowUpRight,
  'arrow-down-left': ArrowDownLeft,
};

interface InfoRecordTableProps {
  columns: QueryColumn[];
  records: QueryRecord[];
  timestampField: string;
}

function formatCellValue(value: unknown, type: QueryColumn['type']): string {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'datetime') return formatDateTime(String(value));
  if (type === 'date') return formatDate(String(value));
  if (type === 'boolean') return value ? 'Có' : 'Không';
  return String(value);
}

/** `type: "image"` columns render a thumbnail instead of raw base64 text.
 * `emphasize`/`iconMap` (review feedback: the XNC direction column needed to
 * stand out next to the timestamp) are generic — any datasource's enum
 * column can opt in via config.json, not hardcoded to one field name. */
function renderCellValue(value: unknown, column: QueryColumn | undefined): ReactNode {
  if (column?.type === 'image' && typeof value === 'string' && value.length > 0) {
    return <Base64ImageCell value={value} label={column.label} />;
  }

  const text = formatCellValue(value, column?.type ?? 'string');
  const Icon = column?.iconMap ? ICON_BY_KEY[column.iconMap[text] ?? ''] : undefined;

  if (!column?.emphasize && !Icon) return text;
  return (
    <span className={cn('inline-flex items-center gap-1', column?.emphasize && 'font-semibold')}>
      {Icon && <Icon className="size-3.5 shrink-0" />}
      {text}
    </span>
  );
}

const columnHelper = createColumnHelper<QueryRecord>();

/**
 * One person's records rendered newest-first as a hand-rolled CSS
 * border-line timeline (research §B: no timeline library), but the columns
 * themselves are TanStack Table `ColumnDef[]` built at runtime from
 * `envelope.columns` (phase-07 Implementation Step 7) — headless, so
 * "table" here means "typed, config-driven cell access", not a literal
 * `<table>` element. `timestampField` is rendered first and emphasized
 * per spec (a), shown as the time value alone (no field label — review
 * feedback: the label duplicated info already obvious from the timeline
 * layout). Any column flagged `headerField` (e.g. XNC's direction enum)
 * renders alongside it instead of in the grid below. Zero hardcoded field
 * names.
 */
export function InfoRecordTable({ columns, records, timestampField }: InfoRecordTableProps) {
  const columnsByName = new Map(columns.map((col) => [col.name, col]));
  const headerFieldNames = new Set(columns.filter((col) => col.headerField).map((col) => col.name));
  const columnDefs: ColumnDef<QueryRecord, unknown>[] = columns.map((col) =>
    columnHelper.accessor((row) => row[col.name], { id: col.name, header: col.label }),
  );

  const table = useReactTable({ data: records, columns: columnDefs, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="relative flex flex-col gap-4 border-l-2 pl-4">
      {table.getRowModel().rows.map((row) => {
        const cells = row.getVisibleCells();
        const timestampCell = cells.find((c) => c.column.id === timestampField);
        const headerFieldCells = cells.filter((c) => headerFieldNames.has(c.column.id));
        const otherCells = cells.filter((c) => c.column.id !== timestampField && !headerFieldNames.has(c.column.id));
        return (
          <div key={row.id} className="relative">
            <span className="bg-primary absolute top-1.5 -left-[21px] size-2.5 rounded-full" aria-hidden="true" />
            {timestampCell && (
              <p className="flex flex-wrap items-center gap-3 text-sm font-semibold">
                <span>{formatCellValue(timestampCell.getValue(), columnsByName.get(timestampField)?.type ?? 'datetime')}</span>
                {headerFieldCells.map((cell) => (
                  <span key={cell.id}>{renderCellValue(cell.getValue(), columnsByName.get(cell.column.id))}</span>
                ))}
              </p>
            )}
            <dl className="text-muted-foreground mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-2">
              {otherCells.map((cell) => (
                <div key={cell.id} className="flex items-center gap-1">
                  <dt className="font-medium">{String(cell.column.columnDef.header)}:</dt>
                  <dd className="truncate">{renderCellValue(cell.getValue(), columnsByName.get(cell.column.id))}</dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </div>
  );
}
