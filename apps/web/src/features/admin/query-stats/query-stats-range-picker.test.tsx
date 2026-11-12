import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryStatsRangePicker } from './query-stats-range-picker';

function setup() {
  const onPreset = vi.fn();
  const onCustom = vi.fn();
  const onGranularity = vi.fn();
  render(<QueryStatsRangePicker preset="today" from="" to="" onPreset={onPreset} onCustom={onCustom} granularity={undefined} onGranularity={onGranularity} effectiveGranularity="day" />);
  fireEvent.click(screen.getByRole('button', { name: 'Tuỳ chọn' }));
  return { onPreset, onCustom, onGranularity };
}

describe('QueryStatsRangePicker', () => {
  it('offers the new presets and a manual granularity select', () => {
    const { onPreset, onGranularity } = setup();
    fireEvent.click(screen.getByRole('button', { name: '30 ngày qua' }));
    expect(onPreset).toHaveBeenCalledWith('last_30d');
    expect(screen.getByRole('button', { name: 'Tháng trước' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tự động (ngày)' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Độ chi tiết'), { target: { value: 'hour' } });
    expect(onGranularity).toHaveBeenCalledWith('hour');
    fireEvent.change(screen.getByLabelText('Độ chi tiết'), { target: { value: '' } });
    expect(onGranularity).toHaveBeenLastCalledWith(undefined);
  });
  it('calls onPreset for preset buttons', () => {
    const { onPreset } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Hôm qua' }));
    expect(onPreset).toHaveBeenCalledWith('yesterday');
  });
  it('shows error and does not submit when from > to', () => {
    const { onCustom } = setup();
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onCustom).not.toHaveBeenCalled();
  });
  it('submits a valid custom range', () => {
    const { onCustom } = setup();
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-11-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem' }));
    expect(onCustom).toHaveBeenCalledWith('2026-11-01', '2026-11-10');
  });
});
