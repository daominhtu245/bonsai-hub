import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import Account from '@/pages/Account';
import Terms from '@/pages/Terms';
import { json, mockFetch } from './fetchMock';
import { user } from './fixtures';

function renderAt(path: string, el: JSX.Element) {
  localStorage.setItem('bonsai.token', 'tok');
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={el} />
          <Route path="/" element={<div>trang chủ</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('Account privacy & notifications', () => {
  it('toggles consent, blocks Zalo without phone, deletes account', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json({ ...user, consent_training: false, notify_zalo: false, phone: null })],
      ['GET /api/v1/payments', () => json([])],
      ['PATCH /api/v1/me', () => json({ ...user, consent_training: true })],
      ['DELETE /api/v1/me', () => new Response(null, { status: 204 })],
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAt('/tai-khoan', <Account />);
    const consent = await screen.findByRole('switch', { name: /Cho phép dùng ảnh để cải thiện AI/ });
    await userEvent.click(consent);
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ consent_training: true }));
    expect(screen.getByRole('switch', { name: /Qua Zalo/ })).toBeDisabled();
    expect(screen.getByRole('switch', { name: /Trên trình duyệt này/ })).toBeDisabled(); // jsdom không có Push API
    await userEvent.click(screen.getByRole('button', { name: 'Xóa tài khoản' }));
    expect(await screen.findByText('trang chủ')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'DELETE')?.body).toEqual({ confirm: true });
    expect(localStorage.getItem('bonsai.token')).toBeNull();
  });
});

describe('Terms', () => {
  it('explains soft delete and optional training consent', () => {
    render(<MemoryRouter><Terms /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /Dùng ảnh để cải thiện AI/ })).toBeInTheDocument();
    expect(screen.getByText('giữ lại', { selector: 'strong' })).toBeInTheDocument();
  });
});

describe('push lib', () => {
  it('subscribes with the VAPID key and registers on the server', async () => {
    const subscribe = vi.fn().mockResolvedValue({ toJSON: () => ({ endpoint: 'https://push/x', keys: { p256dh: 'p', auth: 'a' } }) });
    const reg = { pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe } };
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve(reg), getRegistration: () => Promise.resolve(reg) }, configurable: true });
    vi.stubGlobal('PushManager', function PushManager() {});
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') });
    const calls = mockFetch([
      ['GET /api/v1/push/config', () => json({ enabled: true, public_key: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' })],
      ['POST /api/v1/push/subscriptions', () => new Response(null, { status: 204 })],
    ]);
    const { enablePush, pushState } = await import('@/lib/push');
    expect(await pushState()).toBe('off');
    expect(await enablePush()).toBe('on');
    expect(subscribe.mock.calls[0][0].applicationServerKey).toBeInstanceOf(Uint8Array);
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ endpoint: 'https://push/x', keys: { p256dh: 'p', auth: 'a' } });
  });
});
