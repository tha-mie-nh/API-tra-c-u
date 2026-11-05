import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import type { AdminDatasource } from '@shared/index';
import { apiPermissionCode } from '@shared/index';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { vi } from '@/i18n/vi';
import type { DatasourceFormValues } from './datasource-form-schema';

interface DatasourceIdentityFieldsProps {
  register: UseFormRegister<DatasourceFormValues>;
  watch: UseFormWatch<DatasourceFormValues>;
  setValue: UseFormSetValue<DatasourceFormValues>;
  errors: FieldErrors<DatasourceFormValues>;
  isEdit: boolean;
  existingDatasources: AdminDatasource[];
  onCopyFrom: (code: string) => void;
}

/** `code`/`name`/`description`/`type`/`enabled` + the create-only "copy from
 * existing" picker (phase-03 Key Insights) and the read-only derived
 * `permissionCode` preview. Split out of `datasource-form-dialog.tsx` to
 * keep that file under the project's ~200-line guideline. */
export function DatasourceIdentityFields({
  register,
  watch,
  setValue,
  errors,
  isEdit,
  existingDatasources,
  onCopyFrom,
}: DatasourceIdentityFieldsProps) {
  const t = vi.admin.datasources;
  const code = watch('code');

  return (
    <>
      {!isEdit && existingDatasources.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="copyFrom">{t.copyFromLabel}</Label>
          <Select onValueChange={onCopyFrom}>
            <SelectTrigger id="copyFrom" className="w-full">
              <SelectValue placeholder={t.copyFromPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {existingDatasources.map((d) => (
                <SelectItem key={d.code} value={d.code}>
                  {d.name} ({d.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">{t.newEnvVarNotice}</p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">{t.fieldCode}</Label>
        <Input id="code" disabled={isEdit} aria-invalid={!!errors.code} {...register('code')} />
        {errors.code ? (
          <p className="text-destructive text-sm">{errors.code.message}</p>
        ) : (
          <p className="text-muted-foreground text-xs">{t.fieldCodeHint}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t.fieldPermissionCode}</Label>
        <Input disabled value={code ? apiPermissionCode(code) : ''} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">{t.fieldName}</Label>
        <Input id="name" aria-invalid={!!errors.name} {...register('name')} />
        {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">{t.fieldDescription}</Label>
        <Textarea id="description" rows={4} className="min-h-28 resize-y" {...register('description')} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">{t.fieldType}</Label>
          <Select value={watch('type')} onValueChange={(v) => setValue('type', v as DatasourceFormValues['type'])}>
            <SelectTrigger id="type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="info">{t.typeInfo}</SelectItem>
              <SelectItem value="image">{t.typeImage}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch id="enabled" checked={watch('enabled')} onCheckedChange={(checked) => setValue('enabled', checked === true)} />
          <Label htmlFor="enabled">{t.fieldEnabled}</Label>
        </div>
      </div>
    </>
  );
}
