import { useNavigate } from 'react-router';
import { UserMenu } from './user-menu';
import { useAuthStore } from '@/lib/auth-store';
import { useLogout } from '@/features/auth/use-auth';
import { vi } from '@/i18n/vi';

/** Top header chrome: app title + user menu (logout). */
export function HeaderBar() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const logout = useLogout();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="bg-background/95 sticky top-0 z-10 flex h-14 items-center justify-between border-b px-4 backdrop-blur">
      <span className="font-semibold">{vi.app.title}</span>
      {user && <UserMenu fullName={user.fullName} username={user.username} onLogout={handleLogout} />}
    </header>
  );
}
