import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { DatasourceOutputFieldRow } from './datasource-output-field-row';
import { EMPTY_DATASOURCE_FORM_VALUES, type DatasourceFormValues } from './datasource-form-schema';
import { makeEmptyOutputFieldRow } from './datasource-field-row-types';
import { vi as t } from '@/i18n/vi';

function Harness({ type }: { type: string }) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useForm<DatasourceFormValues>({
    defaultValues: {
      ...EMPTY_DATASOURCE_FORM_VALUES,
      outputFields: [
        {
          ...makeEmptyOutputFieldRow(),
          name: 'f',
          label: 'F',
          type: type as never,
          valueMapRef: 'GENDER',
          valueMap: [{ key: 'X', value: 'Xuất' }],
        },
      ],
    },
  });
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DatasourceOutputFieldRow
        index={0}
        register={register}
        watch={watch}
        setValue={setValue}
        errors={errors}
        canMoveUp={false}
        canMoveDown={false}
        onRemove={() => undefined}
        onMoveUp={() => undefined}
        onMoveDown={() => undefined}
      />
      <output data-testid="state">{JSON.stringify({ ref: watch('outputFields.0.valueMapRef'), vm: watch('outputFields.0.valueMap') })}</output>
    </QueryClientProvider>
  );
}

async function expand() {
  await userEvent.setup().click(screen.getByRole('button', { name: t.admin.datasources.expandRowButton }));
}

describe('DatasourceOutputFieldRow: danh mục chỉ hiện với kiểu "Danh sách chọn"', () => {
  const dict = () => screen.queryByText(t.admin.datasources.outputFieldValueMap);

  it.each(['string', 'number', 'date', 'datetime', 'boolean', 'image'])('kiểu %s: KHÔNG hiện danh mục / bảng đổi giá trị', async (type) => {
    render(<Harness type={type} />);
    await expand();
    expect(dict()).not.toBeInTheDocument();
    expect(screen.queryByText(t.admin.datasources.dictionaryPick)).not.toBeInTheDocument();
  });

  it('kiểu enum: hiện danh mục và bảng đổi giá trị', async () => {
    render(<Harness type="enum" />);
    await expand();
    expect(dict()).toBeInTheDocument();
  });
});
