import { FileQuestion } from 'lucide-react';
import { StatusPage } from '@/components/layout/status-page';
import { vi } from '@/i18n/vi';

export function NotFoundPage() {
  return (
    <StatusPage
      icon={<FileQuestion className="text-muted-foreground size-10" />}
      title={vi.common.notFoundTitle}
      body={vi.common.notFoundBody}
      actionLabel={vi.common.goHome}
      actionTo="/"
    />
  );
}
