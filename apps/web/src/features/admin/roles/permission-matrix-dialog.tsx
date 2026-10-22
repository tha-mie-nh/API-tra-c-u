import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AdminRole, PermissionCatalogItem } from '@shared/index';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import { vi } from '@/i18n/vi';
import { fetchPermissionCatalog, setRolePermissions } from './roles-api';

interface PermissionMatrixDialogProps {
  role: AdminRole | null;
  onOpenChange: (open: boolean) => void;
}

function groupByKind(items: PermissionCatalogItem[]) {
  return {
    api: items.filter((p) => p.kind === 'API'),
    feature: items.filter((p) => p.kind === 'FEATURE'),
  };
}

/**
 * Checklist of the full permission catalog (Phase 08 step 10) — `API` kind
 * codes are auto-synced from `config.json` at boot (Phase 04): adding a
 * datasource makes a new checkbox appear here after a restart, no deploy
 * needed for the grant itself (reference-screens-and-ux.md S6). Pre-checks
 * the role's CURRENT `permissionCodes` (eager-loaded by `RolesService`,
 * additive backend field) since `PUT .../permissions` is a full replace.
 */
export function PermissionMatrixDialog({ role, onOpenChange }: PermissionMatrixDialogProps) {
  const queryClient = useQueryClient();
  const catalogQuery = useQuery({ queryKey: ['permission-catalog'], queryFn: fetchPermissionCatalog, enabled: !!role });
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setSelected(role?.permissionCodes ?? []);
  }, [role]);

  const mutation = useMutation({
    mutationFn: () => setRolePermissions(role!.id, selected),
    onSuccess: async () => {
      toast.success(vi.admin.roles.permissionMatrixSuccess);
      await queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : vi.adminCommon.genericError),
  });

  if (!role) return null;

  const toggle = (code: string, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, code] : prev.filter((c) => c !== code)));
  };

  const { api, feature } = groupByKind(catalogQuery.data ?? []);

  return (
    <Dialog open={!!role} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vi.admin.roles.permissionMatrixTitle(role.name)}</DialogTitle>
        </DialogHeader>

        {catalogQuery.isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        )}

        {!catalogQuery.isLoading && api.length === 0 && feature.length === 0 && (
          <p className="text-muted-foreground text-sm">{vi.admin.roles.permissionMatrixEmpty}</p>
        )}

        {api.length > 0 && (
          <PermissionGroup title={vi.admin.roles.permissionGroupApi} items={api} selected={selected} onToggle={toggle} />
        )}
        {feature.length > 0 && (
          <PermissionGroup title={vi.admin.roles.permissionGroupFeature} items={feature} selected={selected} onToggle={toggle} />
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {vi.common.cancel}
          </Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? vi.adminCommon.saving : vi.admin.roles.permissionMatrixSave}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PermissionGroup({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: PermissionCatalogItem[];
  selected: string[];
  onToggle: (code: string, checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-muted-foreground text-xs font-semibold uppercase">{title}</p>
      {items.map((item) => (
        <label key={item.id} className="flex items-center gap-2 text-sm">
          <Checkbox checked={selected.includes(item.code)} onCheckedChange={(checked) => onToggle(item.code, checked === true)} />
          {item.name}
        </label>
      ))}
    </div>
  );
}
