import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import Studio from '@/pages/Studio';
import { json, mockFetch } from './fetchMock';
import { studio, user } from './fixtures';
import manifest from '../../public/studio/manifest.json';


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
    // mẫu AI: cành 2 cắt, 3 tầng lá; mở màn ở chế độ Cành
    expect(await screen.findByRole('button', { name: 'Cành 2: cắt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cành 1: giữ' })).toBeInTheDocument();
    // chạm (không kéo) → giữ lại cành 2 → cặp cành chống → gợi ý ở tab Hoàn tất
    await userEvent.pointer({ keys: '[MouseLeft]', target: screen.getByRole('button', { name: 'Cành 2: cắt' }) });
    expect(screen.getByRole('button', { name: 'Cành 2: giữ' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hoàn tất' }));
    expect(screen.getByText(/Cành 1 và 2 mọc ngang nhau/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    expect(screen.getByRole('button', { name: 'Cành 2: cắt' })).toBeInTheDocument();
    // tab Tầng lá: loại lá mặc định theo loài (si → lá si, sanh); thêm một tầng
    await userEvent.click(screen.getByRole('button', { name: 'Tầng lá' }));
    expect(screen.getByRole('button', { name: 'Lá si, sanh' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Thêm Tầng dẹt · Lá si / sanh' }));
    expect(screen.getByText('Tầng lá D')).toBeInTheDocument(); // tầng mới đang chọn → bảng chỉnh hiện ngay dưới ảnh
    await userEvent.click(screen.getByRole('button', { name: 'Lật' }));
    await userEvent.click(screen.getByRole('button', { name: 'Xong' }));
    await userEvent.click(screen.getByRole('button', { name: 'Chậu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Thêm Chậu chữ nhật nâu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Rêu, đá' }));
    await userEvent.click(screen.getByRole('button', { name: 'Thêm Rêu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hoàn tất' }));
    await userEvent.selectOptions(screen.getByLabelText('Thế cây'), 'chokkan');
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
