import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import AdminLayout from '@/pages/admin/AdminLayout';
import Dashboard from '@/pages/admin/Dashboard';
import JobDetail from '@/pages/admin/JobDetail';
import Users from '@/pages/admin/Users';
import { CostsPage, FeedbackPage } from '@/pages/admin/pages';
import { json, mockFetch } from './fetchMock';
import { user } from './fixtures';

const admin = { ...user, role: 'admin', email: 'boss@x.vn' };

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

const kpi = (value: number, previous = 0) => ({ value, previous });

describe('Admin console', () => {
  it('redirects non-admins', async () => {
    mockFetch([['GET /api/v1/me', () => json(user)]]);
    renderAdmin('/admin', '', <Dashboard />);
    expect(await screen.findByText('trang khác')).toBeInTheDocument();
  });

  it('shows dashboard KPIs, comparisons and navigation', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json(admin)],
      ['GET /api/v1/admin/dashboard?days=30', () => json({
        days: 30, usd_vnd_rate: 26000,
        kpis: {
          users_new: kpi(12, 6), jobs_a: kpi(40, 20), jobs_paid: kpi(10, 5), jobs_done: kpi(9), conversion: kpi(0.25, 0.25),
          fail_rate: kpi(0.05, 0.1), revenue_vnd: kpi(1990000, 995000), ai_cost_vnd: kpi(104000, 52000),
          gross_margin_vnd: kpi(1886000, 943000), ai_cost_per_paid_vnd: kpi(10400, 10400), feedback_positive: kpi(0.8, 0),
        },
        series: [{ day: '2026-10-24', users: 2, jobs_a: 5, jobs_paid: 2, jobs_failed: 0, revenue_vnd: 398000, ai_cost_vnd: 20800 }],
        funnel: { users: 30, analysed: 25, chose: 10, done: 9, shared: 4 },
        median_phase_a_s: 42, median_phase_b_s: 130,
      })],
      [/GET \/api\/v1\/admin\/jobs\?/, () => json({ items: [], total: 0, limit: 6, offset: 0 })],
    ]);
    renderAdmin('/admin', '', <Dashboard />);
    expect(await screen.findByText('1.990.000 đ')).toBeInTheDocument();
    expect(screen.getByText('kỳ trước 995.000 đ')).toBeInTheDocument();
    expect(screen.getByText('2,2 ph')).toBeInTheDocument(); // trung vị tạo ảnh
    expect(screen.getByRole('navigation', { name: 'Quản trị' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Phiên thiết kế/ })).toHaveAttribute('href', '/admin/phien');
    // biểu đồ có chế độ bảng
    await userEvent.click(screen.getAllByRole('button', { name: 'Bảng' })[0]);
    expect(screen.getByRole('columnheader', { name: 'Có trả lượt' })).toBeInTheDocument();
  });

  it('shows AI costs by step', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json(admin)],
      ['GET /api/v1/admin/costs?days=14', () => json({ total_usd: 1.234, avg_cost_per_paid_job_usd: 0.51, days: [{ day: '2026-10-21', cost_usd: 1.234, jobs: 3, paid_jobs: 2, failed_jobs: 1 }],
        steps: [{ step_code: 'P3a', calls: 6, cost_usd: 0.2, avg_latency_ms: 9000, fail_rate: 0.17 }] })],
    ]);
    renderAdmin('/admin/chi-phi', 'chi-phi', <CostsPage />);
    expect(await screen.findByText('$1.23')).toBeInTheDocument();
    expect(screen.getByText('$0.5100')).toBeInTheDocument();
    expect(screen.getByText('17%')).toBeInTheDocument();
  });

  it('gifts credits to many emails at once', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(admin)],
      [/GET \/api\/v1\/admin\/users/, () => json({ items: [], total: 0, limit: 50, offset: 0 })],
      ['POST /api/v1/admin/users/gift', () => json({ credited: ['a@b.vn', 'c@d.vn'], already: [], not_found: [] })],
    ]);
    renderAdmin('/admin/nguoi-dung', 'nguoi-dung', <Users />);
    await userEvent.click(await screen.findByRole('button', { name: /Tặng lượt/ }));
    await userEvent.type(screen.getByLabelText('Danh sách email'), 'a@b.vn, c@d.vn');
    await userEvent.click(screen.getAllByRole('button', { name: 'Tặng lượt' }).at(-1)!);
    expect(await screen.findByText('Đã tặng lượt cho 2 người.')).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/admin/users/gift'))?.body).toEqual({ emails: ['a@b.vn', 'c@d.vn'], credits: 3, batch: 'beta-1' });
  });

  it('retries a failed paid job with a note', async () => {
    const job = {
      job: { id: 'aaaaaaaa-1111-2222-3333-444444444444', created_at: '2026-10-24T03:00:00Z', status: 'failed', error_code: 'image_unavailable', user_id: 'u1', user_email: 'k@x.vn',
        tree_nickname: 'Si', species_key: 'si', style_key: 'moyogi', paid: true, cost_usd: 0.12, cost_mode: 'standard', prompt_version: 'P1.v1+P2.v1', duration_s: 80, stuck: false },
      inputs: {}, progress: {}, analysis: null, targets: null, report: null, error: 'openai 400', charge_ref: 'x', share_code: null, photos: [],
      options: [], renders: [], stages: [], steps: [], feedback: [], ledger: [], can_retry: 'phase_b', can_refund: false,
    };
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(admin)],
      [`GET /api/v1/admin/jobs/${job.job.id}`, () => json(job)],
      [`POST /api/v1/admin/jobs/${job.job.id}/retry`, () => json({ ...job, job: { ...job.job, status: 'rendering_final' }, can_retry: null })],
    ]);
    renderAdmin(`/admin/phien/${job.job.id}`, 'phien/:jobId', <JobDetail />);
    expect(await screen.findByText('openai 400')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Chạy lại' }));
    expect(screen.getByText(/không mất lượt/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Ghi chú/), 'model lỗi tạm');
    await userEvent.click(screen.getAllByRole('button', { name: 'Chạy lại' }).at(-1)!);
    await waitFor(() => expect(screen.getByText('Đã đưa vào hàng đợi.')).toBeInTheDocument());
    expect(calls.find((c) => c.url.endsWith('/retry'))?.body).toEqual({ note: 'model lỗi tạm' });
    expect(screen.getByText('Đang tạo ảnh')).toBeInTheDocument();
  });

  it('lists feedback with a link to the job', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json(admin)],
      ['GET /api/v1/admin/inbox', () => json({ items: [], urgent: 0, badges: {} })],
      ['GET /api/v1/admin/feedback?rating=-1&open_only=true', () => json([{ id: 'f1', user_id: 'u9', job_id: 'j1234567890', rating: -1, reason_tags: ['trunk'], comment: 'Thân bị vẽ khác', style_key: 'moyogi', user_email: 'a@b.vn', created_at: '2026-10-21T10:00:00Z', resolved_at: null, admin_note: null }])],
      ['POST /api/v1/admin/feedback/f1/resolve', () => json({ resolved_at: '2026-10-25T10:00:00Z', admin_note: 'sửa P3a' })],
    ]);
    renderAdmin('/admin/phan-hoi', 'phan-hoi', <FeedbackPage />);
    expect(await screen.findByText('“Thân bị vẽ khác”')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'phiên j1234567' })).toHaveAttribute('href', '/admin/phien/j1234567890');
    expect(screen.getByRole('link', { name: 'a@b.vn' })).toHaveAttribute('href', '/admin/nguoi-dung/u9');
    await userEvent.click(screen.getByRole('button', { name: 'Đã xử lý' }));
    await userEvent.type(screen.getByLabelText('Đã làm gì'), 'sửa P3a');
    await userEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã xử lý' }));
    expect(await screen.findByText('Không còn phản hồi chưa xử lý.')).toBeInTheDocument();
  });
});
