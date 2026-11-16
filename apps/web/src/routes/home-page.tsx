import { Link } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/lib/auth-store';
import { useDatasources } from '@/features/datasources/use-datasources';
import { DatasourceIcon } from '@/components/layout/datasource-icon';

/** Landing page after login — greeting + quick links into the caller's
 * permitted datasources (mirrors the sidebar's "Tra cứu" section). */
export function HomePage() {
  const user = useAuthStore((state) => state.user);
  const { data: datasources } = useDatasources();

  return (
    <div className="flex flex-col gap-4">
      <div className="from-primary/10 border-primary/15 rounded-xl border bg-gradient-to-r to-transparent p-5">
        <h1 className="text-xl font-semibold tracking-tight">Xin chào, {user?.fullName}</h1>
        <dl className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-6 gap-y-0.5 text-sm">
          <div className="flex items-center gap-1">
            <dt className="font-medium">Tên đăng nhập:</dt>
            <dd>{user?.username}</dd>
          </div>
          <div className="flex items-center gap-1">
            <dt className="font-medium">Email:</dt>
            <dd>{user?.email ?? '—'}</dd>
          </div>
          <div className="flex items-center gap-1">
            <dt className="font-medium">Vai trò:</dt>
            <dd>{user?.roles.length ? user.roles.join(', ') : '—'}</dd>
          </div>
        </dl>
      </div>
      {!!datasources?.length && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {datasources.map((ds) => (
            <Link key={ds.code} to={`/tra-cuu/${ds.code}`}>
              <Card className="hover:ring-primary/40 h-full transition-all hover:-translate-y-0.5 hover:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="bg-primary/10 text-primary grid size-8 shrink-0 place-items-center rounded-lg">
                      <DatasourceIcon code={ds.code} className="size-4" />
                    </span>
                    {ds.name}
                  </CardTitle>
                </CardHeader>
                {ds.description && (
                  <CardContent className="text-muted-foreground text-sm">{ds.description}</CardContent>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
