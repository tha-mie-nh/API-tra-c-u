import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClientDatasource } from '@shared/index';
import { DynamicSearchForm } from './dynamic-search-form';

// Two structurally different mock datasources (phase-07 Implementation Step
// 14 / Success Criteria) — the same component must render two different
// correct forms with zero code differences between them.
const infoDatasource: ClientDatasource = {
  code: 'DS_INFO_SAMPLE',
  name: 'Tra cứu mẫu A',
  type: 'info',
  input: {
    fields: [
      { name: 'fullName', label: 'Họ và tên', type: 'string', required: false, minLength: 2, maxLength: 100 },
      {
        name: 'gender',
        label: 'Giới tính',
        type: 'enum',
        required: false,
        options: [
          { value: 'M', label: 'Nam' },
          { value: 'F', label: 'Nữ' },
        ],
      },
    ],
    atLeastOneOf: ['fullName', 'gender'],
  },
  output: { fields: [] },
  limits: { maxResults: 100, pageSize: 20 },
};

const idDatasource: ClientDatasource = {
  code: 'DS_ID_SAMPLE',
  name: 'Tra cứu mẫu B',
  type: 'info',
  input: {
    fields: [{ name: 'citizenId', label: 'Số CCCD', type: 'string', required: true, pattern: '^[0-9]{12}$' }],
  },
  output: { fields: [] },
  limits: { maxResults: 100, pageSize: 20 },
};

describe('DynamicSearchForm', () => {
  it('renders a different set of fields per datasource, with zero code differences', () => {
    const { rerender } = render(<DynamicSearchForm datasource={infoDatasource} onSearch={vi.fn()} isSubmitting={false} />);
    expect(screen.getByLabelText('Họ và tên')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Số CCCD/)).not.toBeInTheDocument();

    rerender(<DynamicSearchForm datasource={idDatasource} onSearch={vi.fn()} isSubmitting={false} />);
    expect(screen.getByLabelText(/Số CCCD/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Họ và tên')).not.toBeInTheDocument();
  });

  it('blocks submit and shows a field error when a required pattern field is invalid', async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup();
    render(<DynamicSearchForm datasource={idDatasource} onSearch={onSearch} isSubmitting={false} />);

    await user.type(screen.getByLabelText(/Số CCCD/), '123');
    await user.click(screen.getByRole('button', { name: 'Tra cứu' }));

    expect(await screen.findByText('Số CCCD không đúng định dạng')).toBeInTheDocument();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('blocks submit when atLeastOneOf is unmet', async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup();
    render(<DynamicSearchForm datasource={infoDatasource} onSearch={onSearch} isSubmitting={false} />);

    await user.click(screen.getByRole('button', { name: 'Tra cứu' }));

    expect(await screen.findByText(/Vui lòng nhập ít nhất một/)).toBeInTheDocument();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('submits validated params once every rule is satisfied', async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup();
    render(<DynamicSearchForm datasource={idDatasource} onSearch={onSearch} isSubmitting={false} />);

    await user.type(screen.getByLabelText(/Số CCCD/), '123456789012');
    await user.click(screen.getByRole('button', { name: 'Tra cứu' }));

    await waitFor(() => expect(onSearch).toHaveBeenCalledWith({ citizenId: '123456789012' }));
  });
});
