import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TreeTools } from '@/components/TreeTools';
import { AuthProvider } from '@/lib/auth';
import type { Listing } from '@/lib/market';
import ListingPublicPage from '@/pages/market/ListingPublic';
import MarketPage from '@/pages/market/Market';
import MyListingsPage from '@/pages/market/MyListings';
import PriceIndexPage from '@/pages/market/PriceIndex';
import { json, mockFetch } from './fetchMock';
import { user } from './fixtures';

function renderAt(path: string, route: string, el: JSX.Element) {
  localStorage.setItem('bonsai.token', 'tok');
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={route} element={el} /></Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const listing = (patch: Partial<Listing> = {}): Listing => ({
  id: 'l1', code: 'ABCD2345', url: 'https://x/tin/ABCD2345', title: 'Phôi si chân to', description: 'Gốc đẹp', species_key: 'si', species_vi: 'Si',
  kind: 'phoi', price_vnd: 3000000, height_cm: 60, trunk_cm: 10, province: 'can_tho', province_vi: 'Cần Thơ', contact_phone: '0909 123 456',
  status: 'active', featured: false, photo_url: 'https://r2/l.webp', views: 3, seller: 'Vườn Ba Lá', seller_slug: null, created_at: '2026-10-25T00:00:00Z', ...patch,
});

describe('Chợ phôi', () => {
  it('browses and filters listings', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/species', () => json([{ key: 'si', name_vi: 'Si', growth_speed: 'fast' }])],
      ['GET /api/v1/tools/provinces', () => json([{ code: 'can_tho', name: 'Cần Thơ', region: 'south' }])],
      [/GET \/api\/v1\/public\/listings/, () => json([listing({ featured: true })])],
    ]);
    renderAt('/cho', '/cho', <MarketPage />);
    expect(await screen.findByText('Phôi si chân to')).toBeInTheDocument();
    expect(screen.getByText('Nổi bật')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Si' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('Loài'), 'si');
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/public/listings?species=si'))).toBe(true));
  });

  it('shows the public listing with previews and Zalo contact', async () => {
    mockFetch([['GET /api/v1/public/listings/ABCD2345', () => json(listing({ previews: [{ kind: 'render', style_vi: 'Trực uốn', url: 'https://r2/s4.webp' }] }))]]);
    renderAt('/tin/ABCD2345', '/tin/:code', <ListingPublicPage />);
    expect(await screen.findByRole('heading', { name: 'Phôi si chân to' })).toBeInTheDocument();
    expect(screen.getByText('3.000.000 đ')).toBeInTheDocument();
    expect(screen.getByAltText('Minh họa dáng Trực uốn')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Nhắn Zalo/ })).toHaveAttribute('href', 'https://zalo.me/0909123456');
    expect(screen.getByRole('link', { name: /Gọi/ })).toHaveAttribute('href', 'tel:0909 123 456');
  });

  it('creates a listing from a result and hides one', async () => {
    let items: Listing[] = [];
    const calls = mockFetch([
      ['GET /api/v1/me', () => json({ ...user, phone: '0909123456', province: 'can_tho' })],
      ['GET /api/v1/species', () => json([{ key: 'si', name_vi: 'Si', growth_speed: 'fast' }])],
      ['GET /api/v1/tools/provinces', () => json([{ code: 'can_tho', name: 'Cần Thơ', region: 'south' }])],
      ['GET /api/v1/me/listings', () => json({ plan_until: null, free_active: 3, featured_max: 3, items })],
      ['POST /api/v1/listings', () => { items = [listing()]; return json(items[0], 201); }],
      ['PATCH /api/v1/listings/l1', () => { items = [listing({ status: 'hidden' })]; return json(items[0]); }],
    ]);
    renderAt('/tin-cua-toi?job=j1&tree=t1&title=Si%20s%C3%A2n', '/tin-cua-toi', <MyListingsPage />);
    expect(await screen.findByText('Kèm dáng tương lai của cây này')).toBeInTheDocument();
    expect(screen.getByLabelText('Tiêu đề')).toHaveValue('Si sân');
    await waitFor(() => expect(screen.getByLabelText('Điện thoại / Zalo')).toHaveValue('0909123456'));
    await userEvent.type(screen.getByLabelText('Giá (đ)'), '3.000.000');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng tin' }));
    expect(await screen.findByText('Phôi si chân to')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ title: 'Si sân', price_vnd: 3000000, job_id: 'j1', tree_id: 't1', contact_phone: '0909123456', province: 'can_tho' });
    expect(screen.getByText('Đang hiện 1/3 tin miễn phí')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Trạng thái tin Phôi si chân to'), 'hidden');
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ status: 'hidden' }));
  });

  it('price index table', async () => {
    mockFetch([['GET /api/v1/public/price-index', () => json([
      { species_key: 'si', species_vi: 'Si', region: null, samples: 6, per_cm_low: 200000, per_cm_median: 300000, per_cm_high: 400000 },
      { species_key: 'si', species_vi: 'Si', region: 'south', samples: 5, per_cm_low: 250000, per_cm_median: 300000, per_cm_high: 350000 },
    ])]]);
    renderAt('/tien-ich/gia', '/tien-ich/gia', <PriceIndexPage />);
    const rows = await screen.findAllByRole('row');
    expect(within(rows[1]).getByText('200k – 400k')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Miền Nam')).toBeInTheDocument();
  });

  it('suggests partner pots on the result', async () => {
    mockFetch([['GET /api/v1/jobs/j1/pots', () => json([{ id: 1, name: 'Bầu nâu 30', maker: 'Bát Tràng', shape: 'oval', color: 'unglazed_brown', length_cm: 30,
      price_vnd: 450000, url: 'https://shop/p?ref=bonsai', image_url: null, active: true }])]]);
    render(<TreeTools jobId="j1" />);
    await userEvent.click(screen.getByText('Chậu hợp dáng'));
    const link = await screen.findByRole('link', { name: /Bầu nâu 30/ });
    expect(link).toHaveAttribute('href', 'https://shop/p?ref=bonsai');
    expect(link).toHaveAttribute('rel', 'noreferrer sponsored');
  });
});
