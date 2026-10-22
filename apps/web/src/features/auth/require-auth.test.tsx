import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { useAuthStore } from '@/lib/auth-store';
import { RequireAuth } from './require-auth';

const baseUser = { id: '1', username: 'admin', fullName: 'Admin', email: null, permissions: [] as string[], roles: [] as string[] };

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>trang-dang-nhap</div>} />
        <Route
          path="/change-password"
          element={
            <RequireAuth>
              <div>trang-doi-mat-khau</div>
            </RequireAuth>
          }
        />
        <Route
          path="/"
          element={
            <RequireAuth>
              <div>trang-chu-bao-ve</div>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, user: null, status: 'unauthenticated' });
  });

  it('redirects unauthenticated users to /login', () => {
    renderAt('/');
    expect(screen.getByText('trang-dang-nhap')).toBeInTheDocument();
  });

  it('force-redirects an authenticated user with mustChangePassword to /change-password', () => {
    useAuthStore.setState({
      accessToken: 'tok',
      status: 'authenticated',
      user: { ...baseUser, mustChangePassword: true },
    });

    renderAt('/');
    expect(screen.getByText('trang-doi-mat-khau')).toBeInTheDocument();
  });

  it('renders protected content for a fully-authenticated user', () => {
    useAuthStore.setState({
      accessToken: 'tok',
      status: 'authenticated',
      user: { ...baseUser, mustChangePassword: false },
    });

    renderAt('/');
    expect(screen.getByText('trang-chu-bao-ve')).toBeInTheDocument();
  });
});
