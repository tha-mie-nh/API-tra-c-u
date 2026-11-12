import { Link } from 'react-router';
import { formatNumber } from '@/lib/format';
import { vi } from '@/i18n/vi';

interface Props {
  value: number;
  /** undefined => no drill-down (no history:view_all permission). */
  href?: string;
  label: string;
  /** Show the "needs history:view_all" tooltip on the plain number. */
  noPermission?: boolean;
  className?: string;
}

/** A stats number; a real <Link> to Lịch sử when drill-down is allowed and the value is > 0. */
export function QueryStatsDrillNumber({ value, href, label, noPermission, className }: Props) {
  const text = formatNumber(value);
  if (!href || value <= 0) return (
      <span className={className} title={noPermission && value > 0 ? vi.admin.queryStats.drillNoPermission : undefined}>
        {text}
      </span>
    );
  return (
    <Link
      to={href}
      className={`${className ?? ''} hover:text-primary underline decoration-dotted underline-offset-4`}
      aria-label={vi.admin.queryStats.drillAria(label, text)}
      onClick={(e) => e.stopPropagation()}
    >
      {text}
    </Link>
  );
}
