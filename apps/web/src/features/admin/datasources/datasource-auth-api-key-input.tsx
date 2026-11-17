import type { UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { vi } from '@/i18n/vi';
import type { DatasourceFormValues } from './datasource-form-schema';

interface DatasourceAuthApiKeyInputProps {
  register: UseFormRegister<DatasourceFormValues>;
  watch: UseFormWatch<DatasourceFormValues>;
  setValue: UseFormSetValue<DatasourceFormValues>;
  /** Server có SECRETS_ENCRYPTION_KEY (lưu được key mã hóa trong DB). */
  canStore: boolean;
  /** Nguồn đang sửa đã có key lưu mã hóa. */
  stored: boolean;
}

/** Ô nhập API key chỉ-ghi: giá trị đi thẳng tới server (mã hóa, lưu DB), không bao giờ được đọc lại vào form. */
export function DatasourceAuthApiKeyInput({ register, watch, setValue, canStore, stored }: DatasourceAuthApiKeyInputProps) {
  const t = vi.admin.datasources;
  const typed = (watch('authApiKey') ?? '').trim() !== '';
  const clearing = watch('authClearApiKey') === true;

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <Label htmlFor="authApiKey">{t.fieldApiKey}</Label>
      <Input
        id="authApiKey"
        type="password"
        autoComplete="new-password"
        disabled={!canStore}
        placeholder={stored ? '••••••••' : t.apiKeyPlaceholder}
        {...register('authApiKey')}
      />
      <p className="text-muted-foreground text-xs">{!canStore ? t.apiKeyUnavailable : stored ? t.apiKeyStoredHint : t.apiKeyNewHint}</p>
      {typed && <p className="text-muted-foreground text-xs">{t.apiKeyOverridesEnv}</p>}
      {stored && canStore && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setValue('authClearApiKey', !clearing)}>
            {t.apiKeyClearButton}
          </Button>
          {clearing && <span className="text-destructive text-xs">{t.apiKeyClearPending}</span>}
        </div>
      )}
    </div>
  );
}
