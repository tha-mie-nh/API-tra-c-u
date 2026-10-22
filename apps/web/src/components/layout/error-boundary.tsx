import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { StatusPage } from './status-page';
import { vi } from '@/i18n/vi';

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Global render-error boundary (phase-06 step 10). API errors are surfaced
 * via `sonner` toasts at the call site (features/auth/use-auth.ts etc.) — this
 * only catches unexpected render-time exceptions so the app never shows a
 * blank white screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error('Unhandled render error', error);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <StatusPage
          icon={<AlertTriangle className="text-destructive size-10" />}
          title={vi.errors.unexpectedTitle}
          body={vi.errors.unexpectedError}
        />
      );
    }
    return this.props.children;
  }
}
