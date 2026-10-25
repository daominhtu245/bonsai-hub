import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import AdminLayout from '@/pages/admin/AdminLayout';
import Dashboard from '@/pages/admin/Dashboard';
import ReviewPage from '@/pages/artisan/Review';
import RulesPage from '@/pages/artisan/Rules';
import { json, mockFetch } from './fetchMock';
import { user } from './fixtures';

const artisan = { ...user, role: 'artisan', email: 'nghenhan@x.vn' };

function renderAt(path: string) {
  localStorage.setItem('bonsai.token', 'tok');
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="cham-diem" element={<ReviewPage />} />
            <Route path="bo-luat" element={<RulesPage />} />
          </Route>
          <Route path="*" element={<div>trang khác</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const sheet = {
  version: 1, pass_score: 65, presentation_faults: [],
  criteria: { trunk_nebari: { weight: 60, check: ['taper'] }, branches: { weight: 40, check: [] } },
  fidelity_hard_fail: ['trunk_changed', 'removed_branch_present'],
};
const item = {
  kind: 'image', job_id: 'j1', render_id: 'r1', option_id: null, photo_url: 'https://r2/p.webp', photo_size: [400, 600],
  result_url: 'https://r2/s4.webp', collage_url: 'https://r2/c.jpg', sketch_svg_url: null, style_vi: 'Trực uốn', species_vi: 'Si',
  years: 4, why_vi: null, counts: { cut: 2, keep: 3 }, remaining: 1,
};

describe('Khu nghệ nhân', () => {
  it('artisan only sees artisan menu and is sent to review from other admin pages', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json(artisan)],
      ['GET /api/v1/artisan/judging', () => json(sheet)],
      ['GET /api/v1/artisan/reviews/next?kind=image', () => json(null)],
    ]);
    renderAt('/admin');
    expect(await screen.findByRole('heading', { name: 'Chấm điểm' })).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Quản trị' })[0];
    expect(within(nav).getByRole('link', { name: 'Bộ luật & thông số' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Người dùng' })).toBeNull();
    expect(await screen.findByText('Đã chấm hết. Cảm ơn bạn!')).toBeInTheDocument();
  });

  it('scores an image, blocks "Đạt" when a hard fail is ticked, and shows AI score after saving', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(artisan)],
      ['GET /api/v1/artisan/judging', () => json(sheet)],
      [/GET \/api\/v1\/artisan\/reviews\/next\?kind=image/, () => json(calls.filter((c) => c.method === 'POST').length ? null : item)],
      ['POST /api/v1/artisan/reviews', () => json({
        id: 1, kind: 'image', job_id: 'j1', total: 76, passed: false, hard_fails: ['trunk_changed'], scores: {}, comment: null,
        created_at: '2026-10-25T10:00:00Z', ai_total: 70, ai_hard_fail: [], ai_summary: null,
      })],
    ]);
    renderAt('/admin/cham-diem');
    expect(await screen.findByAltText('Ảnh kết quả do AI tạo')).toBeInTheDocument();
    expect(screen.queryByText(/AI chấm/)).toBeNull(); // chưa chấm thì chưa thấy điểm AI
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Thân & rễ' })).getByRole('radio', { name: '8' }));
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Cành' })).getByRole('radio', { name: '7' }));
    await userEvent.click(screen.getByText('Thân bị đổi'));
    expect(screen.getByRole('button', { name: 'Đạt' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Không đạt' }));
    expect(await screen.findByText(/AI chấm 70 điểm/)).toBeInTheDocument();
    const body = calls.find((c) => c.method === 'POST')?.body as { scores: Record<string, number>; hard_fails: string[]; passed: boolean; render_id: string };
    expect(body).toMatchObject({ scores: { trunk_nebari: 8, branches: 7 }, hard_fails: ['trunk_changed'], passed: false, render_id: 'r1' });
  });

  it('edits a rule with Vietnamese labels and saves a new version with a note', async () => {
    const content = { version: 2, proportions: { first_branch_height_ratio: [0.25, 0.4], branch_to_trunk_caliper_max: 0.33 },
      branches: { forbidden: ['bar_branches'], one_per_level: true } };
    const detail = {
      doc: 'rule_set', title_vi: 'Luật tạo dáng & tỉ lệ', content,
      active: { version: 1, note: 'Từ file', active: true, created_by: 'seed', created_at: '2026-10-25T00:00:00Z', activated_by: 'seed', activated_at: null },
      versions: [{ version: 1, note: 'Từ file', active: true, created_by: 'seed', created_at: '2026-10-25T00:00:00Z', activated_by: 'seed', activated_at: null }],
    };
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(artisan)],
      ['GET /api/v1/artisan/rules/rule_set', () => json(detail)],
      ['POST /api/v1/artisan/rules/rule_set/validate', () => json({ errors: [] })],
      ['POST /api/v1/artisan/rules/rule_set', () => json({ ...detail, active: { ...detail.active, version: 2 } })],
    ]);
    renderAt('/admin/bo-luat');
    await userEvent.click(await screen.findByRole('button', { name: 'Form đầy đủ' }));
    expect(await screen.findByText('Độ cao cành đầu (phần chiều cao cây)')).toBeInTheDocument();
    expect(screen.getByTitle('bar_branches')).toHaveTextContent('Cành ngang nhau hai bên'); // mã → nhãn tiếng Việt
    const to = screen.getByLabelText('Độ cao cành đầu (phần chiều cao cây) đến');
    await userEvent.clear(to);
    await userEvent.type(to, '0.36');
    const save = screen.getByRole('button', { name: /Lưu bản mới/ });
    expect(save).toBeDisabled(); // cần ghi chú
    await userEvent.type(screen.getByLabelText('Ghi chú thay đổi'), 'Hạ cành đầu');
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    expect(await screen.findByText('Đã lưu và áp dụng bản mới.')).toBeInTheDocument();
    const body = calls.find((c) => c.method === 'POST' && c.url.endsWith('/rules/rule_set'))?.body as { content: typeof content; note: string; activate: boolean };
    expect(body.content.proportions.first_branch_height_ratio).toEqual([0.25, 0.36]);
    expect(body).toMatchObject({ note: 'Hạ cành đầu', activate: true });
  });

  it('visual mode: steppers redraw the diagram, fault cards toggle rules', async () => {
    const content = { version: 2, proportions: { height_to_base_diameter: [5, 7], first_branch_height_ratio: [0.25, 0.4], branch_to_trunk_caliper_max: 0.33 },
      branches: { forbidden: ['bar_branches', 'crossing_branches'], one_per_level: true, spread_angle_deg: 120, order: ['left_or_right'] } };
    const detail = {
      doc: 'rule_set', title_vi: 'Luật tạo dáng & tỉ lệ', content,
      active: { version: 1, note: 'Từ file', active: true, created_by: 'seed', created_at: '2026-10-25T00:00:00Z', activated_by: 'seed', activated_at: null },
      versions: [{ version: 1, note: 'Từ file', active: true, created_by: 'seed', created_at: '2026-10-25T00:00:00Z', activated_by: 'seed', activated_at: null }],
    };
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(artisan)],
      ['GET /api/v1/artisan/rules/rule_set', () => json(detail)],
      ['POST /api/v1/artisan/rules/rule_set/validate', () => json({ errors: [] })],
      ['POST /api/v1/artisan/rules/rule_set', () => json(detail)],
    ]);
    renderAt('/admin/bo-luat');
    expect(await screen.findByRole('img', { name: 'Sơ đồ tỉ lệ cây mẫu' })).toHaveTextContent('cao = 6 × gốc');
    await userEvent.click(screen.getByRole('button', { name: 'Tăng Chiều cao so với đường kính gốc đến' }));
    expect(screen.getByRole('img', { name: 'Sơ đồ tỉ lệ cây mẫu' })).toHaveTextContent('cao = 6,25 × gốc');
    expect(screen.getAllByText('đã sửa').length).toBe(1);

    await userEvent.click(screen.getByRole('tab', { name: 'Lỗi cấm & nguyên tắc' }));
    expect(screen.getByRole('img', { name: 'Cành ngang nhau hai bên' })).toBeInTheDocument();
    const crossing = screen.getByRole('switch', { name: 'Áp dụng: Cành bắt chéo' });
    expect(crossing).toBeChecked();
    await userEvent.click(crossing);
    await userEvent.click(screen.getByRole('switch', { name: 'Áp dụng: Cành chĩa vào người xem' }));
    await userEvent.type(screen.getByLabelText('Ghi chú thay đổi'), 'Cho phép cành chéo nhẹ');
    const save = screen.getByRole('button', { name: /Lưu bản mới/ });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/rules/rule_set'))).toBeTruthy());
    const body = calls.find((c) => c.method === 'POST' && c.url.endsWith('/rules/rule_set'))?.body as { content: typeof content };
    expect(body.content.branches.forbidden).toEqual(['bar_branches', 'eye_poke_branches']);
    expect(body.content.proportions.height_to_base_diameter).toEqual([5, 7.5]);
  });
});
