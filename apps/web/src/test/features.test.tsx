import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import { FeatureGate, FeaturesProvider } from '@/lib/features';
import FeaturesPage from '@/pages/admin/Features';
import UtilitiesHub from '@/pages/utilities/Hub';
import { json, mockFetch } from './fetchMock';
import { user } from './fixtures';

function renderWith(el: JSX.Element, path = '/') {
  localStorage.setItem('bonsai.token', 'tok');
  localStorage.removeItem('bonsai.features');
  return render(
    <AuthProvider><FeaturesProvider><MemoryRouter initialEntries={[path]}><Routes><Route path={path} element={el} /></Routes></MemoryRouter></FeaturesProvider></AuthProvider>,
  );
}

describe('Bật / tắt tính năng', () => {
  it('hub hides closed features and routes show a lock page', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/features', () => json({ market: false, price_index: false, assistant: true, weather: false, mai_tet: false })],
      ['GET /api/v1/garden', () => json({ credits: 1, trees: [] })],
    ]);
    const { unmount } = renderWith(<UtilitiesHub />, '/tien-ich');
    expect(await screen.findByRole('link', { name: /Hỏi cách chăm/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('link', { name: /Chợ phôi/ })).toBeNull());
    expect(screen.queryByText('Mua bán')).toBeNull(); // nhóm rỗng thì ẩn cả nhóm
    unmount();
    renderWith(<FeatureGate k="market"><div>trang chợ</div></FeatureGate>, '/cho');
    expect(await screen.findByText('Tính năng sắp mở')).toBeInTheDocument();
    expect(screen.queryByText('trang chợ')).toBeNull();
  });

  it('admin switches a feature to staff-only', async () => {
    let state = 'on';
    const calls = mockFetch([
      ['GET /api/v1/me', () => json({ ...user, role: 'admin' })],
      ['GET /api/v1/features', () => json({})],
      ['GET /api/v1/admin/features', () => json({ testers: [], items: [{ key: 'market', label_vi: 'Chợ phôi', group_vi: 'Mua bán', state, usage_30d: 4 }] })],
      ['PUT /api/v1/admin/features', () => { state = 'staff'; return json({ testers: [], items: [{ key: 'market', label_vi: 'Chợ phôi', group_vi: 'Mua bán', state, usage_30d: 4 }] }); }],
    ]);
    renderWith(<FeaturesPage />, '/admin/tinh-nang');
    const group = await screen.findByRole('radiogroup', { name: 'Chợ phôi' });
    expect(screen.getByText('4 lượt dùng / 30 ngày')).toBeInTheDocument();
    await userEvent.click(within(group).getByRole('radio', { name: 'Nội bộ' }));
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Nội bộ' })).toHaveAttribute('aria-checked', 'true'));
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ flags: { market: 'staff' } });
  });
});
