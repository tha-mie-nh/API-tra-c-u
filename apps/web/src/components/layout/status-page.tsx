import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

interface StatusPageProps {
  icon?: ReactNode;
  title: string;
  body: string;
  actionLabel?: string;
  actionTo?: string;
}

/** Shared shell for full-page states (403, 404, "coming soon") so each one
 * doesn't hand-roll its own centered-card layout. */
export function StatusPage({ icon, title, body, actionLabel, actionTo }: StatusPageProps) {
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-3 p-8 text-center">
      {icon}
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-muted-foreground max-w-md text-sm">{body}</p>
      {actionLabel && actionTo && (
        <Button asChild className="mt-2">
          <Link to={actionTo}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}
