import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { Toaster } from '@/components/ui/sonner';
import { queryClient } from '@/lib/query-client';
import { ErrorBoundary } from '@/components/layout/error-boundary';
import { useAuthBootstrap } from '@/features/auth/use-auth';
import { AppRoutes } from '@/routes/app-routes';

/**
 * Root component (Phase 06). Wires the global providers: TanStack Query,
 * client-side routing, and the toast surface. `useAuthBootstrap` re-acquires
 * the access token from the httpOnly refresh cookie on every app load — see
 * lib/auth-store.ts for why no token is ever kept in web storage.
 */
function App() {
  useAuthBootstrap();

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
