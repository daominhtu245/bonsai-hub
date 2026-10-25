import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReportButton } from '@/components/ReportButton';
import { AuthProvider } from '@/lib/auth';
import AdminLayout from '@/pages/admin/AdminLayout';
import Community from '@/pages/admin/Community';
import { InboxPanel } from '@/pages/admin/Dashboard';
import Reports from '@/pages/admin/Reports';
import UserDetail from '@/pages/admin/UserDetail';
import { json, mockFetch } from './fetchMock';
import { user } from './fixtures';

const admin = { ...user, role: 'admin', email: 'boss@x.vn' };
const inbox = {
  urgent: 3, badges: { '/admin/bao-cao': 2, '/admin/thanh-toan': 1 },
  items: [
    { key: 'reports', title: 'Báo vi phạm chờ xử lý', tone: 'danger', to: '/admin/bao-cao', count: 2, preview: [{ label: 'Tin đăng · Lừa đảo', sub: '5 phút trước', to: '/admin/bao-cao' }] },
    { key: 'payments', title: 'Chuyển khoản chờ đối soát', tone: 'warn', to: '/admin/thanh-toan?status=pending', count: 1, preview: [] },
    { key: 'listings', title: 'Tin đăng mới 24 giờ', tone: 'info', to: '/admin/cong-dong?tab=listings', count: 4, preview: [] },
  ],
};

function renderAdmin(path: string, child: string, el: JSX.Element) {
  localStorage.setItem('bonsai.token', 'tok');
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path={child} element={el} />
          </Route>
          <Route path="*" element={<div>trang khác</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const listing = {
  id: 'l1', code: 'BAD00001', title: 'Phôi si giá rẻ', price_vnd: 100000, status: 'active', views: 9, featured: false, photo_url: null,
  created_at: '2026-10-24T10:00:00Z', description: 'Chuyển cọc trước', kind: 'phoi', species_key: 'si', reports: 2, seller: { id: 's1', name: 'Vườn X', email: 'x@x.vn' },
};
const report = {
  id: 'r1', kind: 'listing', kind_vi: 'Tin đăng', reason: 'scam', reason_vi: 'Lừa đảo', note: 'đòi cọc', status: 'open', resolution: null, resolved_by: null, resolved_at: null,
  created_at: '2026-10-25T09:00:00Z', reporter: { id: 'a1', name: 'Anh A', email: 'a@x.vn' }, owner: { id: 's1', name: 'Vườn X', email: 'x@x.vn', locked: false },
  target: { title: 'Phôi si giá rẻ', code: 'BAD00001', status: 'active', price_vnd: 100000, description: 'Chuyển cọc trước', photo_url: null, public_url: '/tin/BAD00001', hidden: false },
  reports_on_target: 2,
};

describe('Admin inbox & moderation', () => {
  it('shows sidebar badges, inbox cards and typeahead search', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json(admin)],
      ['GET /api/v1/admin/settings', () => json({ app_env: 'dev' })],
      ['GET /api/v1/admin/inbox', () => json(inbox)],
      [/GET .*\/admin\/search\?q=vuon/, () => json([{ kind: 'user', label: 'Vườn X', sub: 'x@x.vn', to: '/admin/nguoi-dung/s1' }, { kind: 'listing', label: 'Phôi si', sub: 'BAD00001 · active', to: '/admin/cong-dong?tab=listings&q=BAD00001' }])],
    ]);
    renderAdmin('/admin', '', <InboxPanel />);
    const nav = await screen.findByRole('navigation', { name: 'Quản trị' });
    expect(await within(nav).findByLabelText('2 việc chờ')).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Báo vi phạm/ })).toHaveAttribute('href', '/admin/bao-cao');
    const panel = screen.getByRole('region', { name: 'Việc cần xử lý' });
    expect(within(panel).getByText('3 việc gấp')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /Báo vi phạm chờ xử lý/ })).toHaveAttribute('href', '/admin/bao-cao');
    expect(within(panel).getByRole('link', { name: /Tin đăng · Lừa đảo/ })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('(3) Quản trị · Bonsai AI'));

    await userEvent.type(screen.getByRole('combobox', { name: 'Tìm nhanh' }), 'vuon');
    const list = await screen.findByRole('listbox', { name: 'Kết quả tìm nhanh' });
    expect(within(list).getAllByRole('option')).toHaveLength(2);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(await screen.findByText('trang khác')).toBeInTheDocument(); // điều hướng tới /admin/cong-dong (ngoài route test)
  });

  it('resolves a report: hide and lock the poster', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(admin)],
      ['GET /api/v1/admin/inbox', () => json(inbox)],
      ['GET /api/v1/admin/reports?status=open', () => json({ summary: { open: 1, actioned: 0, dismissed: 0 }, items: [report] })],
      ['POST /api/v1/admin/reports/r1/resolve', () => json({ resolved: 2 })],
    ]);
    renderAdmin('/admin/bao-cao', 'bao-cao', <Reports />);
    expect(await screen.findByRole('tab', { name: 'Chờ xử lý (1)' })).toBeInTheDocument();
    expect(await screen.findByText('Chuyển cọc trước')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Vườn X/ })).toHaveAttribute('href', '/admin/nguoi-dung/s1');
    await userEvent.click(screen.getByRole('button', { name: 'Ẩn và khóa người đăng' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Lý do gửi người đăng'), 'lừa cọc');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ẩn và khóa người đăng' }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/resolve'))?.body).toEqual({ action: 'hide_lock', note: 'lừa cọc' }));
  });

  it('community: tab counts, listing detail with reports and hide reason', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(admin)],
      ['GET /api/v1/admin/inbox', () => json(inbox)],
      ['GET /api/v1/admin/community/counts', () => json({ listings: 5, listings_hidden: 0, consults: 2, care: 0, profiles: 1, stolen: 0 })],
      ['GET /api/v1/admin/listings?q=BAD00001', () => json([listing])],
      ['POST /api/v1/admin/listings/l1/moderate', () => json({ status: 'hidden' })],
    ]);
    renderAdmin('/admin/cong-dong?q=BAD00001', 'cong-dong', <Community />);
    expect(await screen.findByRole('tab', { name: /Hỏi nghệ nhân\s*2/ })).toBeInTheDocument();
    expect(await screen.findByText('Bị báo 2 lần ·', { exact: false })).toBeInTheDocument(); // chỉ 1 kết quả → mở chi tiết luôn
    expect(screen.getByText('Chuyển cọc trước')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ẩn tin' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Lý do'), 'Nghi cây bị trộm');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ẩn tin' }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/moderate'))?.body).toEqual({ status: 'hidden', reason: 'Nghi cây bị trộm' }));
  });

  it('user detail: internal note, private message, related tabs', async () => {
    const detail = {
      user: { id: 'u1', email: 'a@b.vn', name: 'Chú Ba', phone: null, garden_name: null, auth_provider: 'google', role: 'player', credits: 2, consent_training: false,
        deleted: false, created_at: '2026-10-01T00:00:00Z', trees: 1, jobs: 0, paid_jobs: 0, revenue_vnd: 0, last_active_at: null },
      consent_at: null, deleted_at: null, notify_zalo: false, push_devices: 1, ai_cost_usd: 0, ledger: [], ledger_balance: 2, payments: [], jobs: [], audit: [],
    };
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(admin)],
      ['GET /api/v1/admin/inbox', () => json({ items: [], urgent: 0, badges: {} })],
      ['GET /api/v1/admin/users/u1', () => json(detail)],
      ['GET /api/v1/admin/users/u1/related', () => json({ admin_note: 'khách quen', public_slug: null, province: null, reports_made: 0,
        trees: [{ id: 't1', nickname: 'Si cổ', species_key: 'si', passport_code: 'PP1', stolen: true, created_at: '2026-10-02T00:00:00Z' }],
        listings: [], consults: [], care: [], reports_against: [{ id: 'r1', kind_vi: 'Tin đăng', reason_vi: 'Spam', status: 'open', note: null, created_at: '2026-10-03T00:00:00Z' }] })],
      ['PUT /api/v1/admin/users/u1/note', () => json({ admin_note: 'khách quen, hứa bù 1 lượt' })],
      ['POST /api/v1/admin/users/u1/message', () => new Response(null, { status: 202 })],
    ]);
    renderAdmin('/admin/nguoi-dung/u1', 'nguoi-dung/:userId', <UserDetail />);
    const note = await screen.findByLabelText('Ghi chú nội bộ');
    expect(note).toHaveValue('khách quen');
    await userEvent.type(note, ', hứa bù 1 lượt');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ note: 'khách quen, hứa bù 1 lượt' }));

    await userEvent.click(screen.getByRole('tab', { name: 'Cây (1)' }));
    expect(screen.getByText('Báo mất')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Bị báo (1)' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Nhắn riêng' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Tiêu đề'), 'Đã hoàn lượt');
    await userEvent.type(within(dialog).getByLabelText(/Nội dung/), 'Mình đã cộng lại 1 lượt');
    await userEvent.selectOptions(within(dialog).getByLabelText('Bấm vào mở trang'), '/tai-khoan/luot');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi' }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/message'))?.body).toEqual({ title: 'Đã hoàn lượt', body: 'Mình đã cộng lại 1 lượt', path: '/tai-khoan/luot' }));
  });

  it('user reports a listing', async () => {
    const calls = mockFetch([['GET /api/v1/me', () => json(user)], ['POST /api/v1/reports', () => json({ id: 'r1', status: 'open' }, 201)]]);
    localStorage.setItem('bonsai.token', 'tok');
    render(<AuthProvider><MemoryRouter><ReportButton kind="listing" target="BAD00001" /></MemoryRouter></AuthProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'Báo vi phạm' }));
    await userEvent.click(await screen.findByRole('radio', { name: 'Nghi lừa đảo' }));
    await userEvent.type(screen.getByLabelText('Chi tiết'), 'đòi cọc');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi báo cáo' }));
    expect(await screen.findByText('Đã gửi báo cáo, cảm ơn bạn.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ target_kind: 'listing', target: 'BAD00001', reason: 'scam', note: 'đòi cọc' });
  });
});
