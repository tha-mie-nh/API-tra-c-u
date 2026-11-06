import { useFieldArray, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue, type UseFormWatch } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import type { DatasourceEnvRefs } from '@shared/index';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { vi } from '@/i18n/vi';
import type { DatasourceFormValues } from './datasource-form-schema';

interface DatasourceTransportFieldsProps {
  register: UseFormRegister<DatasourceFormValues>;
  watch: UseFormWatch<DatasourceFormValues>;
  setValue: UseFormSetValue<DatasourceFormValues>;
  control: Control<DatasourceFormValues>;
  errors: FieldErrors<DatasourceFormValues>;
  /** `GET /admin/datasources/env-refs` result — names only, for the
   * baseUrl/`auth.valueEnv` pickers (never values). `undefined` while loading. */
  envRefs?: DatasourceEnvRefs;
}

/** Transport mock|http subform (phase-03 Architecture). `minio-pg` is
 * intentionally never offered — the backend rejects it on write
 * (phase-02 Key Insights). */
export function DatasourceTransportFields({ register, watch, setValue, control, errors, envRefs }: DatasourceTransportFieldsProps) {
  const kind = watch('transportKind');
  const authKind = watch('authKind');
  const { fields, append, remove } = useFieldArray({ control, name: 'headers' });
  const t = vi.admin.datasources;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="transportKind">{t.fieldTransportKind}</Label>
        <Select
          value={kind || undefined}
          onValueChange={(v) => setValue('transportKind', (v === '__none__' ? '' : v) as 'mock' | 'http')}
        >
          <SelectTrigger id="transportKind" className="w-full">
            <SelectValue placeholder={t.clearSelectionOption} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">{t.clearSelectionOption}</SelectItem>
            <SelectItem value="http">{t.transportKindHttp}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {kind === 'http' && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="httpBaseUrl">{t.fieldBaseUrl}</Label>
            <div className="flex gap-2">
              <Input id="httpBaseUrl" aria-invalid={!!errors.httpBaseUrl} {...register('httpBaseUrl')} />
              {!!envRefs?.baseUrlEnvNames.length && (
                <Select onValueChange={(name) => setValue('httpBaseUrl', `${watch('httpBaseUrl') ?? ''}\${${name}}`)}>
                  <SelectTrigger className="w-auto" title={t.fieldBaseUrlEnvPicker}>
                    <SelectValue placeholder={t.fieldBaseUrlEnvPicker} />
                  </SelectTrigger>
                  <SelectContent>
                    {envRefs.baseUrlEnvNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {errors.httpBaseUrl && <p className="text-destructive text-sm">{errors.httpBaseUrl.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="httpPath">{t.fieldPath}</Label>
              <Input id="httpPath" aria-invalid={!!errors.httpPath} {...register('httpPath')} />
              {errors.httpPath ? (
                <p className="text-destructive text-sm">{errors.httpPath.message}</p>
              ) : (
                <p className="text-muted-foreground text-xs">{t.fieldPathHint}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="httpMethod">{t.fieldMethod}</Label>
              <Select
                value={watch('httpMethod') || undefined}
                onValueChange={(v) => setValue('httpMethod', (v === '__none__' ? '' : v) as 'GET' | 'POST')}
              >
                <SelectTrigger id="httpMethod" className="w-full">
                  <SelectValue placeholder={t.clearSelectionOption} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t.clearSelectionOption}</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="httpTimeoutMs">{t.fieldTimeoutMs}</Label>
            <Input id="httpTimeoutMs" type="number" min={0} {...register('httpTimeoutMs')} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t.fieldHeaders}</Label>
            <p className="text-muted-foreground text-xs">{t.headerSecretWarning}</p>
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <Input placeholder={t.headerKeyPlaceholder} {...register(`headers.${index}.key`)} />
                <Input placeholder={t.headerValuePlaceholder} {...register(`headers.${index}.value`)} />
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(index)} aria-label={t.removeHeaderButton}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => append({ key: '', value: '' })}>
              <Plus data-icon="inline-start" />
              {t.addHeaderButton}
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="authKind">{t.fieldAuthKind}</Label>
            <Select value={authKind} onValueChange={(v) => setValue('authKind', v as DatasourceFormValues['authKind'])}>
              <SelectTrigger id="authKind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t.authKindNone}</SelectItem>
                <SelectItem value="apiKeyHeader">{t.authKindApiKeyHeader}</SelectItem>
                <SelectItem value="bearer">{t.authKindBearer}</SelectItem>
                <SelectItem value="basic">{t.authKindBasic}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {authKind !== 'none' && (
            <>
              {authKind === 'apiKeyHeader' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="authHeader">{t.fieldAuthHeader}</Label>
                  <Input id="authHeader" {...register('authHeader')} />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="authValueEnv">{t.fieldAuthValueEnv}</Label>
                <div className="flex gap-2">
                  <Input id="authValueEnv" aria-invalid={!!errors.authValueEnv} {...register('authValueEnv')} />
                  {!!envRefs?.apiKeyEnvNames.length && (
                    <Select onValueChange={(name) => setValue('authValueEnv', name)}>
                      <SelectTrigger className="w-auto">
                        <SelectValue placeholder={t.authValueEnvPlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {envRefs.apiKeyEnvNames.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {errors.authValueEnv && <p className="text-destructive text-sm">{errors.authValueEnv.message}</p>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
