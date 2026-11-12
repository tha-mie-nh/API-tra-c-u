import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { FEATURE_PERMISSION_CODES } from '@shared/index';
import { useAuthStore } from '@/lib/auth-store';
import { useCanDrillDown } from './use-can-drill-down';

const userWith = (permissions: string[]) => ({
  id: '1', username: 'u', fullName: 'U', email: null, mustChangePassword: false, permissions, roles: [],
});

describe('useCanDrillDown', () => {
  beforeEach(() => useAuthStore.setState({ user: null }));
  it('true only with history:view_all', () => {
    useAuthStore.setState({ user: userWith([FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL]) });
    expect(renderHook(() => useCanDrillDown()).result.current).toBe(true);
  });
  it('false with only view_own / query stats permission', () => {
    useAuthStore.setState({ user: userWith([FEATURE_PERMISSION_CODES.HISTORY_VIEW_OWN]) });
    expect(renderHook(() => useCanDrillDown()).result.current).toBe(false);
  });
});
