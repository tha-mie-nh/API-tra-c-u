import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Card with a title and an optional right-aligned action (e.g. the CSV button). */
export function QueryInsightsSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
