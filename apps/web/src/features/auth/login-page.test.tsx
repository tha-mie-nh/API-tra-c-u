import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { useAuthStore } from '@/lib/auth-store';
import { ApiError } from '@/lib/api-client';
import { LoginPage } from './login-page';

vi.mock('./auth-api', () => ({ login: vi.fn(), fetchMe: vi.fn() }));
import * as authApi from './auth-api';

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>trang-chu</div>} />
        <Route path="/change-password" element={<div>doi-mat-khau</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillAndSubmit(username: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Tên đăng nhập'), username);
  await user.type(screen.getByLabelText('Mật khẩu'), password);
  await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, user: null, status: 'unauthenticated' });
    vi.clearAllMocks();
  });

  it('navigates to the home route after a successful login', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      accessToken: 'tok',
      expiresIn: 900,
      user: { id: '1', username: 'admin', fullName: 'Admin', email: null, mustChangePassword: false },
    });
    vi.mocked(authApi.fetchMe).mockResolvedValue({
      id: '1',
      username: 'admin',
      fullName: 'Admin',
      email: null,
      mustChangePassword: false,
      permissions: [],
      roles: [],
    });

    renderLoginPage();
    await fillAndSubmit('admin', 'secret');

    await waitFor(() => expect(screen.getByText('trang-chu')).toBeInTheDocument());
  });

  it('redirects to the forced change-password screen when mustChangePassword is set', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      accessToken: 'tok',
      expiresIn: 900,
      user: { id: '1', username: 'admin', fullName: 'Admin', email: null, mustChangePassword: true },
    });
    vi.mocked(authApi.fetchMe).mockResolvedValue({
      id: '1',
      username: 'admin',
      fullName: 'Admin',
      email: null,
      mustChangePassword: true,
      permissions: [],
      roles: [],
    });

    renderLoginPage();
    await fillAndSubmit('admin', 'secret');

    await waitFor(() => expect(screen.getByText('doi-mat-khau')).toBeInTheDocument());
  });

  it('shows a Vietnamese error message on invalid credentials', async () => {
    vi.mocked(authApi.login).mockRejectedValue(
      new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password', 'r1'),
    );

    renderLoginPage();
    await fillAndSubmit('admin', 'wrong');

    expect(await screen.findByRole('alert')).toHaveTextContent('Sai tên đăng nhập hoặc mật khẩu');
  });
});
