import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { UserMenu } from './user-menu';
import { useAuthStore } from '@/lib/auth-store';
import { useLogout } from '@/features/auth/use-auth';
import { vi } from '@/i18n/vi';

/** Top header chrome: brand mark + app title + user menu (logout). */
export function HeaderBar() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const logout = useLogout();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="bg-card/95 border-t-primary sticky top-0 z-10 flex h-14 items-center justify-between border-t-2 border-b px-4 shadow-xs backdrop-blur">
      <div className="flex items-center gap-2.5">
        <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg shadow-sm">
          <Search className="size-4" />
        </span>
        <span className="font-semibold tracking-tight">{vi.app.title}</span>
      </div>
      {user && <UserMenu fullName={user.fullName} username={user.username} onLogout={handleLogout} />}
    </header>
  );
}
