import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AnnouncementBar } from '@/components/AnnouncementBar';
import { GiftCodeBox } from '@/components/GiftCodeBox';
import { SaveAndRemind } from '@/components/SaveAndRemind';
import { AuthProvider } from '@/lib/auth';
import AdminLayout from '@/pages/admin/AdminLayout';
import { GiftCodesPage, OpsPage } from '@/pages/admin/OpsPages';
import CreditHistory from '@/pages/CreditHistory';
import { json, mockFetch } from './fetchMock';
import { user } from './fixtures';

function wrap(el: JSX.Element, path = '/') {
  localStorage.setItem('bonsai.token', 'tok');
  return render(<AuthProvider><MemoryRouter initialEntries={[path]}>{el}</MemoryRouter></AuthProvider>);
}

describe('User extras', () => {
  it('redeems a gift code', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['POST /api/v1/me/gift-code', () => json({ credits_added: 2, credits: 3 })],
    ]);
    wrap(<GiftCodeBox />);
    await userEvent.type(screen.getByLabelText('Mã quà tặng'), 'tet2027');
    await userEvent.click(screen.getByRole('button', { name: 'Nhận lượt' }));
    expect(await screen.findByText('Đã nhận 2 lượt. Bạn đang có 3 lượt.')).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/gift-code'))?.body).toEqual({ code: 'TET2027' });
  });

  it('shows the gift code error', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['POST /api/v1/me/gift-code', () => json({ detail: 'Mã này đã hết hạn.' }, 400)],
    ]);
    wrap(<GiftCodeBox />);
    await userEvent.type(screen.getByLabelText('Mã quà tặng'), 'CU2020');
    await userEvent.click(screen.getByRole('button', { name: 'Nhận lượt' }));
    expect(await screen.findByText('Mã này đã hết hạn.')).toBeInTheDocument();
  });

  it('lists credit history', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/me/credits', () => json([
        { at: '2026-10-24T03:00:00Z', delta: -1, label: 'Tạo ảnh tương lai', job_id: 'j1' },
        { at: '2026-10-20T03:00:00Z', delta: 1, label: 'Quà chào mừng', job_id: null },
      ])],
    ]);
    wrap(<CreditHistory />);
    expect(await screen.findByRole('link', { name: 'Tạo ảnh tương lai' })).toHaveAttribute('href', '/ket-qua/j1');
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('opens signed calendar link', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['POST /api/v1/jobs/j1/exports', () => json({ xlsx_url: 'http://x/a.xlsx', ics_url: 'http://x/a.ics' })],
    ]);
    const assign = vi.fn();
    const orig = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...orig, set href(v: string) { assign(v); } } });
    wrap(<SaveAndRemind jobId="j1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Thêm nhắc việc vào lịch điện thoại' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('http://x/a.ics'));
    expect(screen.getByRole('link', { name: 'In hướng dẫn / Lưu PDF' })).toHaveAttribute('href', '/ket-qua/j1/in');
    Object.defineProperty(window, 'location', { configurable: true, value: orig });
  });

  it('shows announcement only when active', async () => {
    mockFetch([['GET /api/v1/announcement', () => json({ text: 'Bảo trì 22h tối nay', tone: 'warn' })]]);
    render(<AnnouncementBar />);
    expect(await screen.findByText('Bảo trì 22h tối nay')).toBeInTheDocument();
  });
});

const admin = { ...user, role: 'admin' };
function renderAdmin(path: string, child: string, el: JSX.Element) {
  localStorage.setItem('bonsai.token', 'tok');
  return render(
    <AuthProvider><MemoryRouter initialEntries={[path]}><Routes><Route path="/admin" element={<AdminLayout />}><Route path={child} element={el} /></Route></Routes></MemoryRouter></AuthProvider>,
  );
}

describe('Admin ops', () => {
  const ops = { trial_credits: 1, phase_a_daily_limit: 10, usd_vnd_rate: 26000, pause_analysis: false, pause_render: false,
    pause_message: 'Hệ thống đang bảo trì.', announcement: { active: false, text: '', tone: 'info' } };

  it('pauses analysis after confirmation and edits announcement', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(admin)],
      ['GET /api/v1/admin/settings', () => json({ app_env: 'dev' })],
      ['GET /api/v1/admin/ops', () => json(ops)],
      ['GET /api/v1/admin/packages', () => json([{ code: 'le', name_vi: 'Lẻ', credits: 1, amount_vnd: 49000, note_vi: '', popular: false, nursery: false, active: true, sold_30d: 3 }])],
      ['PUT /api/v1/admin/ops', (_u, init) => json({ ...ops, ...JSON.parse(String(init.body)) })],
    ]);
    renderAdmin('/admin/van-hanh', 'van-hanh', <OpsPage />);
    await userEvent.click(await screen.findByRole('switch', { name: /Tạm dừng phân tích phôi/ }));
    await userEvent.type(screen.getByLabelText('Nội dung'), 'Nghỉ lễ');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Tạm dừng' }));
    expect(await screen.findByText('Đã lưu. Áp dụng ngay.')).toBeInTheDocument();
    const body = calls.find((c) => c.method === 'PUT')?.body as typeof ops;
    expect(body.pause_analysis).toBe(true);
    expect(body.announcement.text).toBe('Nghỉ lễ');
    expect(screen.getAllByText('49.000 đ')).toHaveLength(2); // giá + giá mỗi lượt
  });

  it('creates a gift code', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(admin)],
      ['GET /api/v1/admin/settings', () => json({ app_env: 'dev' })],
      ['GET /api/v1/admin/gift-codes', () => json([])],
      ['POST /api/v1/admin/gift-codes', () => json({ code: 'TET2027', credits: 2, max_uses: 100, used: 0, expires_at: null, active: true, note: null, created_by: 'a', created_at: '2026-10-25T00:00:00Z', status: 'active' })],
      ['GET /api/v1/admin/gift-codes/TET2027/redemptions', () => json([])],
    ]);
    renderAdmin('/admin/ma-qua-tang', 'ma-qua-tang', <GiftCodesPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Tạo mã/ }));
    await userEvent.type(screen.getByLabelText(/^Mã \(/), 'TET2027');
    await userEvent.clear(screen.getByLabelText('Số lượt mỗi người'));
    await userEvent.type(screen.getByLabelText('Số lượt mỗi người'), '2');
    await userEvent.type(screen.getByLabelText(/Tổng số người/), '100');
    await userEvent.click(screen.getAllByRole('button', { name: 'Tạo mã' }).at(-1)!);
    expect(await screen.findByText('Đã tạo mã.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ code: 'TET2027', credits: 2, max_uses: 100, expires_at: null });
  });
});
