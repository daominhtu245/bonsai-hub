import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import Buy from '@/pages/Buy';
import Account from '@/pages/Account';
import Garden from '@/pages/Garden';
import Home from '@/pages/Home';
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
  photo_url: 'https://r2/p.webp', future_url: 'https://r2/S4.webp', last_photo_at: null, created_at: '2020-01-01T00:00:00Z',
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
    const stats = await screen.findByRole('region', { name: 'Tổng quan vườn' });
    expect(stats).toHaveTextContent('2cây');
    expect(stats).toHaveTextContent('1việc');
    expect(stats).toHaveTextContent('4lượt');
    expect(screen.getByRole('link', { name: /Mai mới mua/ })).toHaveTextContent('Chờ chọn thế');
    expect(screen.getByText('Trực uốn · S1 Tạo khung')).toBeInTheDocument();
    expect(screen.getByText('Tiếp theo: Uốn dây cành trái')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mai mới mua/ })).toHaveAttribute('href', '/chon/j2');
    expect(screen.getByRole('img', { name: 'Đã xong 1/5 giai đoạn' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Còn việc cần làm/ }));
    expect(screen.queryByText('Mai mới mua')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeInTheDocument();
    expect(screen.getByText('Minh họa')).toBeInTheDocument();
    expect(screen.getByAltText('Phôi gốc')).toHaveAttribute('src', 'https://r2/p.webp');
    expect(screen.getByText(/ngày chưa chụp/)).toBeInTheDocument();
  });

  it('shows empty state', async () => {
    mockFetch([['GET /api/v1/me', () => json(user)], ['GET /api/v1/garden', () => json({ credits: 1, trees: [] })]]);
    renderAt('/vuon', '/vuon', <Garden />);
    expect(await screen.findByText('Chưa có cây nào')).toBeInTheDocument();
  });
});

describe('Home dashboard', () => {
  it('greets, shows today task, garden rail and explore tiles', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json({ ...user, province: 'hue' })],
      ['GET /api/v1/garden', () => json({ credits: 4, trees: [tree({})] })],
      [/GET .*\/tools\/mai-tet/, () => json({ tet: '2099-01-01', defoliate_from: '2098-12-01' })],
      [/GET .*\/weather/, () => json({ province_vi: 'Huế', days: [{ date: '2026-10-25', min_c: 22, max_c: 29, rain_mm: 0, wind_kmh: 5 }], alerts: [] })],
    ]);
    renderAt('/', '/', <Home />);
    expect(await screen.findByRole('heading', { level: 1, name: /Chào buổi .+, Ba/ })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Việc hôm nay: Si sân sau' })).toHaveAttribute('href', '/ket-qua/j1');
    expect(screen.getByText('Uốn dây cành trái')).toBeInTheDocument();
    expect(await screen.findByText('22–29°')).toBeInTheDocument();
    expect(await screen.findByText(/ngày tới Tết/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Thêm cây/ })).toHaveAttribute('href', '/chup');
    expect(screen.getByRole('link', { name: /Hỏi cách chăm/ })).toHaveAttribute('href', '/tien-ich/hoi-dap');
  });

  it('invites a first capture when the garden is empty', async () => {
    mockFetch([['GET /api/v1/me', () => json(user)], ['GET /api/v1/garden', () => json({ credits: 1, trees: [] })]]);
    renderAt('/', '/', <Home />);
    expect(await screen.findByRole('link', { name: /Chụp phôi đầu tiên/ })).toHaveAttribute('href', '/chup');
  });
});

describe('Account hero', () => {
  it('shows credits, tree count and skill level; gift code folds open', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json({ ...user, credits: 7 })],
      ['GET /api/v1/garden', () => json({ credits: 7, trees: [tree({}), tree({ tree_id: 't2' })] })],
      ['GET /api/v1/me/skill', () => json({ level: 'tho', level_vi: 'Thợ', next_vi: 'Nghệ nhân', progress: [] })],
      ['GET /api/v1/payments', () => json([])],
    ]);
    renderAt('/tai-khoan', '/tai-khoan', <Account />);
    const hero = await screen.findByRole('region', { name: 'Hồ sơ của bạn' });
    expect(hero).toHaveTextContent('Chú Ba');
    expect(hero).toHaveTextContent('7lượt');
    await waitFor(() => expect(hero).toHaveTextContent('2cây'));
    await waitFor(() => expect(hero).toHaveTextContent('Thợbậc'));
    expect(screen.queryByLabelText('Mã quà tặng')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nhập mã quà tặng' }));
    expect(screen.getByLabelText('Mã quà tặng')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu hồ sơ' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Tên vườn'), 'Vườn Ba');
    expect(screen.getByRole('button', { name: 'Lưu hồ sơ' })).toBeInTheDocument();
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
    expect(screen.getByRole('switch')).toBeDisabled(); // không phải nhà vườn
    await userEvent.click(screen.getByRole('button', { name: 'Sao chép link trang kết quả' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://x/s/abc'));
  });
});
