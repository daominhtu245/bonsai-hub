import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReferralCard } from '@/components/ReferralCard';
import { TreeTools } from '@/components/TreeTools';
import { AuthProvider } from '@/lib/auth';
import UtilitiesHub from '@/pages/utilities/Hub';
import MaiTetPage from '@/pages/utilities/MaiTet';
import MenhPage from '@/pages/utilities/Menh';
import RescuePage from '@/pages/utilities/Rescue';
import { json, mockFetch } from './fetchMock';
import { user } from './fixtures';

function renderAt(path: string, el: JSX.Element, route = path) {
  localStorage.setItem('bonsai.token', 'tok');
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={route} element={el} /></Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const me = { ...user, birth_year: 1984, province: 'ho_chi_minh' };

describe('Tiện ích', () => {
  it('lists tools in the hub', async () => {
    mockFetch([['GET /api/v1/me', () => json(me)]]);
    renderAt('/tien-ich', <UtilitiesHub />);
    expect(await screen.findByRole('link', { name: /Mai kịp Tết/ })).toHaveAttribute('href', '/tien-ich/mai-tet');
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toHaveTextContent('Tiện ích');
  });

  it('rescue: answers questions and shows a plan', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(me)],
      ['GET /api/v1/tools/rescue/questions', () => json([{ key: 'wilting', text_vi: 'Lá héo rũ?' }, { key: 'dry_soil', text_vi: 'Đất khô cứng?' }])],
      ['POST /api/v1/tools/rescue', () => json({ cause_vi: 'Thiếu nước', now: ['Ngâm chậu 20 phút'], day3: [], day7: ['Phủ rêu'], see_expert: false, causes: ['thirst'] })],
    ]);
    renderAt('/tien-ich/cap-cuu', <RescuePage />);
    await userEvent.click(within(await screen.findByRole('group', { name: 'Lá héo rũ?' })).getByRole('button', { name: 'Có' }));
    await userEvent.click(within(screen.getByRole('group', { name: 'Đất khô cứng?' })).getByRole('button', { name: 'Có' }));
    await userEvent.click(screen.getByRole('button', { name: 'Xem cách xử lý' }));
    expect(await screen.findByText('Thiếu nước')).toBeInTheDocument();
    expect(screen.getByText('Ngâm chậu 20 phút')).toBeInTheDocument();
    expect(screen.queryByText('Sau 3 ngày')).toBeNull();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ answers: { wilting: true, dry_soil: true } });
  });

  it('menh: uses birth year from the profile', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json(me)],
      ['GET /api/v1/tools/menh?year=1984', () => json({ year: 1984, can_chi: 'Giáp Tý', element: 'Kim', nap_am: 'Hải trung Kim', good_elements: ['Kim', 'Thổ'], pot_colors: ['trắng', 'vàng'], species: ['mai_chieu_thuy'] })],
    ]);
    renderAt('/tien-ich/hop-menh', <MenhPage />);
    expect(await screen.findByText('Mệnh Kim')).toBeInTheDocument();
    expect(screen.getByText(/Mai chiếu thủy/)).toBeInTheDocument();
  });

  it('mai tết: shows the defoliation window for the chosen province', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(me)],
      ['GET /api/v1/tools/provinces', () => json([{ code: 'ho_chi_minh', name: 'TP. Hồ Chí Minh', region: 'south' }, { code: 'hue', name: 'Huế', region: 'central' }])],
      [/GET \/api\/v1\/tools\/mai-tet/, () => json({ tet: '2027-02-06', region: 'south', defoliate_from: '2027-01-17', defoliate_to: '2027-01-22', province: 'ho_chi_minh',
        note_vi: 'Tham khảo', steps: [{ when: '2027-01-17', title_vi: 'Tuốt lá', detail_vi: 'Tuốt sạch lá' }] })],
    ]);
    renderAt('/tien-ich/mai-tet', <MaiTetPage />);
    expect(await screen.findByText('17/1 – 22/1')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Tỉnh, thành'), 'hue');
    expect(calls.some((c) => c.url.endsWith('mai-tet?province=hue'))).toBe(true);
    expect(screen.getByRole('button', { name: /Thêm vào lịch/ })).toBeInTheDocument();
  });

  it('tree tools load on demand', async () => {
    mockFetch([
      ['GET /api/v1/tools/wire/j1', () => json({ scale_known: true, copper_note: 'Đồng nhỏ hơn một bậc.', shopping: [[3, 1.5]],
        lines: [{ branch: 'b1', label_vi: 'Cành 1', diameter_mm: 9, gauge_mm: 3, length_cm: 40 }] })],
    ]);
    render(<TreeTools jobId="j1" />);
    await userEvent.click(screen.getByText('Tính dây uốn'));
    expect(await screen.findByText('3 mm · 1.5 m')).toBeInTheDocument();
    expect(screen.getByText('Cành 1')).toBeInTheDocument();
  });

  it('referral card shares the code and claims a friend code', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me/referral', () => json({ code: 'ABC234', link: 'https://x/?ref=ABC234', claimed: false, invited: 2, rewarded: 1, credits_each: 1 })],
      ['POST /api/v1/me/referral/claim', () => new Response(null, { status: 204 })],
    ]);
    render(<ReferralCard />);
    expect(await screen.findByText('ABC234')).toBeInTheDocument();
    expect(screen.getByText('Đã mời 2 người · 1 người đã dùng')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Mã người giới thiệu bạn'), 'xyz789');
    await userEvent.click(screen.getByRole('button', { name: 'Nhập' }));
    expect(await screen.findByText(/Đã nhận mã/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ code: 'XYZ789' });
  });
});
