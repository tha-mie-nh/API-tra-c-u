import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { DatasourceInputFieldsEditor } from './datasource-input-fields-editor';
import { EMPTY_DATASOURCE_FORM_VALUES, type DatasourceFormValues } from './datasource-form-schema';

/** Wraps the editor the way `datasource-form-dialog.tsx` does — all state
 * lives in react-hook-form, this harness just exposes enough to assert on
 * (row count, the live `atLeastOneOf` selection) without needing the zod
 * resolver or a submit button. */
function Harness() {
  const {
    control,
    register,
    watch,
    setValue,
    formState: { errors },
  } = useForm<DatasourceFormValues>({ defaultValues: EMPTY_DATASOURCE_FORM_VALUES });

  return (
    <>
      <DatasourceInputFieldsEditor control={control} register={register} watch={watch} setValue={setValue} errors={errors} />
      <output data-testid="row-count">{watch('inputFields').length}</output>
      <output data-testid="at-least-one-of">{watch('inputAtLeastOneOf').join(',')}</output>
    </>
  );
}

describe('DatasourceInputFieldsEditor (row add/remove + live atLeastOneOf list)', () => {
  it('starts with exactly one empty row', () => {
    render(<Harness />);
    expect(screen.getByTestId('row-count')).toHaveTextContent('1');
  });

  it('"Thêm trường" appends a row; its remove button deletes one', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Thêm trường' }));
    expect(screen.getByTestId('row-count')).toHaveTextContent('2');

    await user.click(screen.getAllByRole('button', { name: 'Xóa dòng' })[0]!);
    expect(screen.getByTestId('row-count')).toHaveTextContent('1');
  });

  it('reorders rows with the up/down buttons instead of losing one', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Thêm trường' }));
    const nameInputs = screen.getAllByPlaceholderText('Tên (name)');
    await user.type(nameInputs[0]!, 'first');
    await user.type(nameInputs[1]!, 'second');

    // second row's "move up" swaps it with the first.
    const moveUpButtons = screen.getAllByRole('button', { name: 'Lên' });
    await user.click(moveUpButtons[1]!);

    const reordered = screen.getAllByPlaceholderText('Tên (name)');
    expect(reordered[0]).toHaveValue('second');
    expect(reordered[1]).toHaveValue('first');
    expect(screen.getByTestId('row-count')).toHaveTextContent('2');
  });

  it('the atLeastOneOf checklist updates live as a row is named, and toggling it updates the selection', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByText('citizenId')).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Tên (name)'), 'citizenId');
    const option = screen.getByText('citizenId').closest('div')!;

    const checkbox = within(option).getByRole('checkbox');
    await user.click(checkbox);
    expect(screen.getByTestId('at-least-one-of')).toHaveTextContent('citizenId');

    await user.click(checkbox);
    expect(screen.getByTestId('at-least-one-of')).toHaveTextContent('');
  });
});
