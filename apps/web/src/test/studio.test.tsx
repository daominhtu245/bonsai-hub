import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import Studio from '@/pages/Studio';
import { json, mockFetch } from './fetchMock';
import { user } from './fixtures';
import manifest from '../../public/studio/manifest.json';

const studio = {
  species_key: 'si',
  photo_url: 'https://r2/p.webp', width: 1000, height: 1500,
  trunk: { base_point_px: [500, 1300], apex_point_px: [520, 300], height_px: 1000, base_diameter_px: 120 },
  branches: [
    { id: 'b1', start_px: [480, 1000], end_px: [300, 950], direction: 'left', thickness: 'thick', height_ratio: 0.3 },
    { id: 'b2', start_px: [520, 990], end_px: [700, 940], direction: 'right', thickness: 'medium', height_ratio: 0.31 },
  ],
  candidate_apex_px: [515, 400], first_branch_y_range_px: [900, 1050],
  styles: [{ key: 'moyogi', name_vi: 'Trực uốn', suggested: true }, { key: 'chokkan', name_vi: 'Trực', suggested: false }],
  templates: [{ rank: 1, style_key: 'moyogi', removed: ['b2'], apex: [515, 400], pads: 3, silhouette: { width_px: 600, height_px: 520, pads: 3 }, pot: { shape: 'oval', color: 'x', position: 'center' } }],
  draft: null,
};

function renderStudio() {
  localStorage.setItem('bonsai.token', 'tok');
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/tu-thiet-ke/j1']}>
        <Routes>
          <Route path="/tu-thiet-ke/:jobId" element={<Studio />} />
          <Route path="/chon/:jobId" element={<div>màn chọn thế</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('Studio', () => {
  it('starts from the AI template, toggles branches, adds a pad and saves', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/jobs/j1/studio', () => json(studio)],
      ['GET /studio/manifest.json', () => json(manifest)],
      ['GET /api/v1/jobs/j1/my-design/preview', () => json({ state: 'none', url: null, remaining: 2 })],
      ['POST /api/v1/jobs/j1/my-design', () => json({ option_id: 'o9', hints: [], sketch_svg_url: 'x' })],
    ]);
    renderStudio();
    // mẫu AI: cành 2 cắt, 3 tầng lá
    expect(await screen.findByRole('button', { name: 'Cành 2: cắt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cành 1: giữ' })).toBeInTheDocument();
    // giữ lại cành 2 → cặp cành chống → gợi ý
    await userEvent.pointer({ keys: '[MouseLeft]', target: screen.getByRole('button', { name: 'Cành 2: cắt' }) });
    expect(await screen.findByText(/Cành 1 và 2 mọc ngang nhau/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    expect(screen.getByRole('button', { name: 'Cành 2: cắt' })).toBeInTheDocument();
    // loại lá mặc định theo loài (si → lá si, sanh); thêm một tầng từ thư viện
    expect(screen.getByRole('button', { name: 'Lá si, sanh' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Thêm Tầng dẹt · Lá si / sanh' }));
    expect(screen.getByText('Tầng lá D')).toBeInTheDocument(); // đang chọn tầng mới → hiện thanh chỉnh
    await userEvent.click(screen.getByRole('button', { name: 'Lật' }));
    await userEvent.selectOptions(screen.getByLabelText('Thế cây'), 'chokkan');
    await userEvent.click(screen.getByRole('button', { name: 'Chậu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Thêm Chậu chữ nhật nâu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Rêu, đá' }));
    await userEvent.click(screen.getByRole('button', { name: 'Thêm Rêu' }));
    await userEvent.click(screen.getByRole('button', { name: /Lưu thiết kế/ }));
    expect(await screen.findByText('màn chọn thế')).toBeInTheDocument();
    const body = calls.find((c) => c.method === 'POST')?.body as {
      style_key: string; removed: string[]; pads: { kind: string; flip: boolean }[]; pot: { shape: string }; pot_kind: string; accents: { kind: string }[];
    };
    expect(body.style_key).toBe('chokkan');
    expect(body.removed).toEqual(['b2']);
    expect(body.pads).toHaveLength(4);
    expect(body.pads[0].kind).toBe('ficus_wide');
    expect(body.pads[3]).toMatchObject({ kind: 'ficus_flat', flip: true });
    expect(body.pot.shape).toBe('rectangle');
    expect(body.pot_kind).toBe('pot_rect_brown');
    expect(body.accents.map((a) => a.kind)).toEqual(['moss']);
  });

  it('shows the server message when the job cannot be edited', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json(user)],
      [/GET \/studio\/manifest|my-design\/preview/, () => json([])],
      ['GET /api/v1/jobs/j1/studio', () => json({ detail: 'Chỉ tự thiết kế được sau khi phân tích xong và trước khi tạo ảnh.' }, 409)],
    ]);
    renderStudio();
    expect(await screen.findByText(/Chỉ tự thiết kế được/)).toBeInTheDocument();
  });
});
