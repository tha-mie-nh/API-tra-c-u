import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ClientDatasource } from '@shared/index';
import { Button } from '@/components/ui/button';
import { vi } from '@/i18n/vi';
import { buildZodSchema } from './build-zod-schema';
import { DynamicField } from './field-registry';
import { applyServerFieldErrors } from '../query-error-message';

interface DynamicSearchFormProps {
  datasource: ClientDatasource;
  onSearch: (params: Record<string, unknown>) => void;
  isSubmitting: boolean;
  /** Last mutation error from `useQueryDatasource` — a 422 gets mapped back
   * onto its fields here; other error kinds are shown by the results area. */
  serverError?: unknown;
  /** Last params this datasource was searched with (from `useQueryResultStore`,
   * via `QueryPage`) — review feedback: revisiting a datasource after
   * navigating away must still show what was searched, not a blank form next
   * to the restored results. */
  initialValues?: Record<string, unknown>;
}

function defaultValuesFor(datasource: ClientDatasource, initialValues?: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(datasource.input.fields.map((field) => [field.name, initialValues?.[field.name] ?? '']));
}

/**
 * Renders ONE search form for ANY datasource, built entirely from
 * `datasource.input.fields` (phase-07 Implementation Step 4) — the only
 * per-datasource variation is data, never code.
 */
export function DynamicSearchForm({ datasource, onSearch, isSubmitting, serverError, initialValues }: DynamicSearchFormProps) {
  const schema = useMemo(
    () => buildZodSchema(datasource.input.fields, datasource.input.atLeastOneOf, datasource.input.requireGroups),
    [datasource],
  );
  const labelByName = useMemo(() => new Map(datasource.input.fields.map((field) => [field.name, field.label])), [datasource]);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaultValuesFor(datasource, initialValues),
  });

  // Switching datasource (navigating between `/tra-cuu/:code` pages) must
  // reset to the new field set — blank, unless a result is cached for it.
  useEffect(() => {
    reset(defaultValuesFor(datasource, initialValues));
    // Intentionally re-runs only on `datasource.code` change — `reset` is a
    // stable react-hook-form function reference, and `initialValues` at the
    // moment `code` changes is exactly the snapshot that should seed the form.
  }, [datasource.code]);

  useEffect(() => {
    applyServerFieldErrors(serverError, setError);
  }, [serverError, setError]);

  const onSubmit = handleSubmit((values) => onSearch(values));

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      {datasource.input.requireGroups && datasource.input.requireGroups.length > 0 && (
        <p className="text-muted-foreground text-sm">
          Điền{' '}
          {datasource.input.requireGroups
            .map((group) => group.map((name) => labelByName.get(name) ?? name).join(' + '))
            .join(' HOẶC ')}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {datasource.input.fields.map((field) => (
          <DynamicField key={field.name} field={field} control={control} error={errors[field.name]} />
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? vi.query.submitting : vi.query.submit}
        </Button>
        <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => reset(defaultValuesFor(datasource))}>
          {vi.query.reset}
        </Button>
      </div>
    </form>
  );
}
