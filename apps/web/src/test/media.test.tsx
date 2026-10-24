import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import type { ResultView } from '@/lib/jobs';
import Result from '@/pages/Result';
import Share from '@/pages/Share';
import TechDrawing from '@/pages/TechDrawing';
import Worksheet from '@/pages/Worksheet';
import { json, mockFetch } from './fetchMock';
import { job, user } from './fixtures';

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

const view: ResultView = {
  job_id: 'j1', tree_id: 't1', tree_nickname: 'Si', style_vi: 'Trực uốn', style_jp: 'Moyogi', low_confidence: false, years: 4,
  front_photo: { id: 'p1', url: 'https://r2/p1.webp', width: 1000, height: 1500 }, sketch_svg_url: null,
  stages: (['S0', 'S1', 'S2', 'S3', 'S4'] as const).map((code) => ({
    code, short_vi: code, name_vi: `Tên ${code}`, time_from_start: null, image_url: `https://r2/${code}.webp`, fallback_sketch: false, guide: null, done_tasks: [],
  })),
  report: null, disclaimer_vi: '', my_rating: null,
};

describe('Nội dung từ kết quả', () => {
  it('switches the result to a pencil drawing', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/jobs/j1', () => json(job({ status: 'done', chosen_option_id: 'o1' }))],
      ['GET /api/v1/jobs/j1/result', () => json(view)],
      ['GET /api/v1/jobs/j1/art?style=pencil', () => json({ S0: 'https://r2/a0.webp', S4: 'https://r2/a4.webp' })],
    ]);
    renderAt('/ket-qua/j1', '/ket-qua/:jobId', <Result />);
    await screen.findByAltText(/Minh họa giai đoạn S4/);
    await userEvent.click(screen.getByRole('button', { name: 'Bút chì' }));
    await waitFor(() => expect(screen.getByAltText(/Minh họa giai đoạn S4/)).toHaveAttribute('src', 'https://r2/a4.webp'));
    await userEvent.click(screen.getByRole('button', { name: 'Ảnh' }));
    expect(screen.getByAltText(/Minh họa giai đoạn S4/)).toHaveAttribute('src', 'https://r2/S4.webp');
    await userEvent.click(screen.getByRole('button', { name: 'Bút chì' }));
    expect(calls.filter((c) => c.url.includes('/art')).length).toBe(1); // đã lưu, không hỏi lại
    expect(screen.getByRole('link', { name: /Bản vẽ kỹ thuật/ })).toHaveAttribute('href', '/ket-qua/j1/ban-ve-ky-thuat');
    expect(screen.getByRole('link', { name: /Đặt vào phòng/ })).toHaveAttribute('href', '/ket-qua/j1/dat-vao-phong');
  });

  it('builds the timelapse video on the share screen', async () => {
    let state = 'none';
    mockFetch([
      ['GET /api/v1/me', () => json(user)],
      [/POST \/api\/v1\/jobs\/j1\/share/, () => json({ code: 'c', url: 'https://x/s/c', images: { '9x16': 'https://r2/a.jpg', '1x1': 'https://r2/b.jpg' }, can_brand: false })],
      ['GET /api/v1/jobs/j1/video', () => json({ state, url: state === 'done' ? 'https://r2/v.mp4' : null, content_type: state === 'done' ? 'video/mp4' : null, width: null, height: null })],
      ['POST /api/v1/jobs/j1/video', () => { state = 'done'; return json({ state: 'running', url: null, content_type: null, width: null, height: null }); }],
    ]);
    renderAt('/chia-se/j1', '/chia-se/:jobId', <Share />);
    const btn = await screen.findByRole('button', { name: /Tạo video tua nhanh/ });
    await userEvent.click(btn);
    expect(await screen.findByText('Đang dựng video…')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Chia sẻ video tua nhanh/ }, { timeout: 5000 })).toBeInTheDocument();
  }, 10000);

  it('prints the technical drawing with numbered rows', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/tools/drawing/j1', () => json({ svg: '<svg/>', width: 1000, height: 1500, photo_url: 'https://r2/p.webp', rows: [
        { no: 1, action: 'cut', title_vi: 'Cắt bỏ', detail_vi: 'Cành đối', gauge_mm: null, length_cm: null },
        { no: 2, action: 'wire', title_vi: 'Quấn dây', detail_vi: 'Giữ làm cành thứ nhất.', gauge_mm: 3, length_cm: 40 },
      ] })],
    ]);
    renderAt('/ket-qua/j1/ban-ve-ky-thuat', '/ket-qua/:jobId/ban-ve-ky-thuat', <TechDrawing />);
    expect(await screen.findByText('3 mm · 40 cm')).toBeInTheDocument();
    expect(screen.getByText('Cành đối')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /In \/ Lưu PDF/ })).toBeEnabled();
  });

  it('prints the drawing worksheet from the pencil sketch', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/jobs/j1/art?style=pencil', () => json({ S0: 'https://r2/a0.webp' })],
    ]);
    renderAt('/ket-qua/j1/phieu-tap-ve', '/ket-qua/:jobId/phieu-tap-ve', <Worksheet />);
    expect(await screen.findByAltText('Phác họa phôi')).toHaveAttribute('src', 'https://r2/a0.webp');
  });
});
