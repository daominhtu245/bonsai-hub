import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import Admin from '@/pages/Admin';
import Buy from '@/pages/Buy';
import Garden from '@/pages/Garden';
import Share from '@/pages/Share';
import { json, mockFetch } from './fetchMock';
import { user } from './fixtures';

function renderAt(path: string, route: string, el: JSX.Element) {
  localStorage.setItem('bonsai.token', 'tok');
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={el} />
          <Route path="*" element={<div>trang khác</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const tree = (patch: object) => ({
  tree_id: 't1', nickname: 'Si sân sau', species_key: 'si', thumbnail_url: 'https://r2/t.webp', job_id: 'j1', job_status: 'done',
  style_vi: 'Trực uốn', stage_code: 'S1', stage_name_vi: 'Tạo khung', stages_done: 1, next_task_vi: 'Uốn dây cành trái', ...patch,
});

describe('Garden', () => {
  it('lists trees with stage, next task and filter', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/garden', () => json({ credits: 4, trees: [
        tree({}),
        tree({ tree_id: 't2', nickname: 'Mai mới mua', job_id: 'j2', job_status: 'awaiting_choice', style_vi: null, next_task_vi: null }),
      ] })],
    ]);
    renderAt('/vuon', '/vuon', <Garden />);
    expect(await screen.findByText('2 cây · còn 4 lượt')).toBeInTheDocument();
    expect(screen.getByText('Trực uốn · S1 Tạo khung')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mai mới mua/ })).toHaveAttribute('href', '/chon/j2');
    expect(screen.getByRole('img', { name: 'Đã xong 1/5 giai đoạn' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Còn việc cần làm' }));
    expect(screen.queryByText('Mai mới mua')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeInTheDocument();
  });

  it('shows empty state', async () => {
    mockFetch([['GET /api/v1/me', () => json(user)], ['GET /api/v1/garden', () => json({ credits: 1, trees: [] })]]);
    renderAt('/vuon', '/vuon', <Garden />);
    expect(await screen.findByText('Vườn còn trống')).toBeInTheDocument();
  });
});

describe('Buy', () => {
  it('creates a VietQR payment and credits when paid', async () => {
    const payment = { id: 'pay1', package_code: 'player', amount_vnd: 199000, transfer_code: 'BONSAI8F3K2', transfer_code_display: 'BONSAI 8F3K2',
      status: 'pending', qr_url: 'https://img.vietqr.io/x.png', bank_name: 'Vietcombank', bank_account: '0123', bank_account_name: 'VUON', credits_left: 1 };
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/packages', () => json([
        { code: 'le', name_vi: 'Lẻ', credits: 1, amount_vnd: 49000, note_vi: 'Thử với một cây', popular: false, nursery: false },
        { code: 'player', name_vi: 'Người chơi', credits: 5, amount_vnd: 199000, note_vi: '39.800 đ mỗi lượt', popular: true, nursery: false },
      ])],
      ['POST /api/v1/payments', () => json(payment, 201)],
      ['GET /api/v1/payments/pay1/events', () => new Response(`event: payment\ndata: {"status": "pending"}\n\nevent: payment\ndata: {"status": "paid"}\n\n`)],
    ]);
    renderAt('/mua-luot', '/mua-luot', <Buy />);
    await userEvent.click(await screen.findByRole('button', { name: /Lấy mã chuyển khoản · 199.000 đ/ }));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ package_code: 'player' });
    expect(await screen.findByText(/Đã nhận 199.000 đ · cộng 5 lượt/)).toBeInTheDocument();
  });

  it('explains when payments are not configured', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/packages', () => json([{ code: 'le', name_vi: 'Lẻ', credits: 1, amount_vnd: 49000, note_vi: '', popular: false, nursery: false }])],
      ['POST /api/v1/payments', () => json({ detail: 'Thanh toán chưa được cấu hình. Bạn quay lại sau nhé.' }, 503)],
    ]);
    renderAt('/mua-luot', '/mua-luot', <Buy />);
    await userEvent.click(await screen.findByRole('radio', { name: /Lẻ/ }));
    await userEvent.click(screen.getByRole('button', { name: /Lấy mã chuyển khoản/ }));
    expect(await screen.findByText(/chưa được cấu hình/)).toBeInTheDocument();
  });
});

describe('Share', () => {
  it('previews both formats and copies the link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['POST /api/v1/jobs/j1/share', () => json({ code: 'abc', url: 'http://x/s/abc', images: { '9x16': 'https://r2/9.jpg', '1x1': 'https://r2/1.jpg' }, can_brand: false })],
    ]);
    renderAt('/chia-se/j1', '/chia-se/:jobId', <Share />);
    expect(await screen.findByAltText(/Ảnh chia sẻ/)).toHaveAttribute('src', 'https://r2/9.jpg');
    await userEvent.click(screen.getByRole('button', { name: 'Vuông 1:1' }));
    expect(screen.getByAltText(/Ảnh chia sẻ/)).toHaveAttribute('src', 'https://r2/1.jpg');
    expect(screen.getByRole('checkbox')).toBeDisabled(); // không phải nhà vườn
    await userEvent.click(screen.getByRole('button', { name: 'Sao chép link trang kết quả' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://x/s/abc'));
  });
});

describe('Admin', () => {
  it('redirects non-admins', async () => {
    mockFetch([['GET /api/v1/me', () => json(user)]]);
    renderAt('/admin', '/admin', <Admin />);
    expect(await screen.findByText('trang khác')).toBeInTheDocument();
  });

  it('shows costs for admins', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json({ ...user, role: 'admin' })],
      ['GET /api/v1/admin/costs?days=14', () => json({ total_usd: 1.234, avg_cost_per_paid_job_usd: 0.51, days: [{ day: '2026-10-21', cost_usd: 1.234, jobs: 3, paid_jobs: 2, failed_jobs: 1 }],
        steps: [{ step_code: 'P3a', calls: 6, cost_usd: 0.2, avg_latency_ms: 9000, fail_rate: 0.17 }] })],
    ]);
    renderAt('/admin', '/admin', <Admin />);
    expect(await screen.findAllByText('$1.23')).toHaveLength(2); // ô tổng + dòng theo ngày
    expect(screen.getByText('$0.5100')).toBeInTheDocument();
    expect(screen.getByText('17%')).toBeInTheDocument();
  });
});
