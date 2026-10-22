import { Outlet } from 'react-router';
import { HeaderBar } from './header-bar';
import { SidebarNav } from './sidebar-nav';

/** Authenticated app shell: header + permission-driven sidebar + routed
 * content (reference-screens-and-ux.md navigation model). */
export function AppShell() {
  return (
    <div className="flex min-h-svh flex-col">
      <HeaderBar />
      <div className="flex flex-1">
        <aside className="w-56 shrink-0 border-r">
          <SidebarNav />
        </aside>
        <main className="min-w-0 flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
