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
      <div>
        <h1 className="text-xl font-semibold">Xin chào, {user?.fullName}</h1>
        <dl className="text-muted-foreground mt-1 flex flex-wrap gap-x-6 gap-y-0.5 text-sm">
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
              <Card className="hover:border-primary/50 transition-colors">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <DatasourceIcon code={ds.code} className="text-primary size-4 shrink-0" />
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
