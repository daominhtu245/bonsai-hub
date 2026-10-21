import { render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import { CaptureProvider, useCapture } from '@/lib/capture';
import { measure } from '@/lib/imageQuality';
import { watchJob } from '@/lib/jobs';
import Analyzing from '@/pages/Analyzing';
import Choose from '@/pages/Choose';
import TreeInfo from '@/pages/TreeInfo';
import { json, mockFetch, sse } from './fetchMock';
import { job, user } from './fixtures';

function img(w: number, h: number, px: (x: number, y: number) => number) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = px(x, y);
      d.set([v, v, v, 255], (y * w + x) * 4);
    }
  return d;
}

describe('image quality', () => {
  it('flags dark, bright, blurry and accepts sharp images', () => {
    expect(measure(img(64, 64, () => 20), 64, 64).issue).toBe('dark');
    expect(measure(img(64, 64, () => 240), 64, 64).issue).toBe('bright');
    expect(measure(img(64, 64, () => 128), 64, 64).issue).toBe('blurry');
    expect(measure(img(64, 64, (x, y) => ((x + y) % 2 ? 60 : 200)), 64, 64).issue).toBeNull();
  });
});

describe('watchJob', () => {
  it('parses SSE events and stops at a terminal status', async () => {
    mockFetch([['GET /api/v1/jobs/j1/events', () => sse([{ status: 'analyzing', progress: {}, error_code: null }, { status: 'awaiting_choice', progress: {}, error_code: null }])]]);
    const seen: string[] = [];
    await new Promise<void>((resolve) => {
      watchJob('j1', (e) => {
        seen.push(e.status);
        if (e.status === 'awaiting_choice') resolve();
      }, () => resolve());
    });
    expect(seen).toEqual(['analyzing', 'awaiting_choice']);
  });
});

function renderAt(path: string, routes: JSX.Element) {
  localStorage.setItem('bonsai.token', 'tok');
  return render(
    <AuthProvider>
      <CaptureProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            {routes}
            <Route path="*" element={<div>trang khác</div>} />
          </Routes>
        </MemoryRouter>
      </CaptureProvider>
    </AuthProvider>,
  );
}

/** Thêm 2 ảnh vào CaptureProvider trước khi hiển thị màn cần ảnh. */
function WithShots({ children }: { children: JSX.Element }) {
  const { shots, add } = useCapture();
  useEffect(() => {
    add(new Blob(['a'], { type: 'image/jpeg' }), null);
    add(new Blob(['b'], { type: 'image/jpeg' }), null);
  }, [add]);
  return shots.length >= 2 ? children : null;
}

describe('TreeInfo', () => {
  beforeAll(() => {
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => undefined;
  });

  it('uploads photos, creates tree and job, then opens analyzing', async () => {
    let n = 0;
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/species', () => json([{ key: 'sanh', name_vi: 'Sanh', growth_speed: 'fast' }, { key: 'si', name_vi: 'Si', growth_speed: 'fast' }])],
      ['POST /api/v1/uploads/presign', () => json({ key: `uploads/u1/${++n}.jpg`, url: `https://r2/put/${n}`, method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, expires_in: 3600 })],
      [/^PUT https:\/\/r2\/put\//, () => new Response(null, { status: 200 })],
      ['POST /api/v1/trees', () => json({ id: 't1' }, 201)],
      ['POST /api/v1/trees/t1/jobs', () => json(job({ status: 'queued', options: [] }), 202)],
    ]);
    renderAt('/chup/thong-tin', <><Route path="/chup/thong-tin" element={<WithShots><TreeInfo /></WithShots>} /><Route path="/phan-tich/:jobId" element={<div>đang phân tích</div>} /></>);

    await userEvent.click(await screen.findByRole('radio', { name: 'Si' }));
    await userEvent.click(screen.getByRole('radio', { name: /Mặt phải/ }));
    await userEvent.type(screen.getByLabelText(/Chiều cao/), '45,5');
    await userEvent.type(screen.getByLabelText(/Đặt tên/), 'Si sân sau');
    await userEvent.click(screen.getByRole('button', { name: /Phân tích phôi/ }));

    expect(await screen.findByText('đang phân tích')).toBeInTheDocument();
    const tree = calls.find((c) => c.method === 'POST' && c.url.endsWith('/trees'))!.body as Record<string, unknown>;
    expect(tree).toEqual({
      nickname: 'Si sân sau', species_key: 'si', real_height_cm: 45.5,
      photos: [{ key: 'uploads/u1/1.jpg', view_index: 0, is_front: false }, { key: 'uploads/u1/2.jpg', view_index: 1, is_front: true }],
    });
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(2);
  });

  it('validates height', async () => {
    mockFetch([['GET /api/v1/me', () => json(user)], ['GET /api/v1/species', () => json([])]]);
    renderAt('/chup/thong-tin', <Route path="/chup/thong-tin" element={<WithShots><TreeInfo /></WithShots>} />);
    await userEvent.type(await screen.findByLabelText(/Chiều cao/), 'abc');
    expect(screen.getByText(/Chiều cao cần là số/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Phân tích phôi/ })).toBeDisabled();
  });
});

describe('Analyzing', () => {
  it('shows step progress from the stream and moves to choose', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/jobs/j1', () => json(job({ status: 'analyzing', options: [] }))],
      ['GET /api/v1/jobs/j1/events', () => sse([
        { status: 'designing', progress: { steps: { species: { state: 'done', key: 'si', confidence: 0.92 }, branches: { state: 'done', count: 6 } } }, error_code: null },
        { status: 'awaiting_choice', progress: {}, error_code: null },
      ])],
    ]);
    renderAt('/phan-tich/j1', <><Route path="/phan-tich/:jobId" element={<Analyzing />} /><Route path="/chon/:jobId" element={<div>màn chọn</div>} /></>);
    expect(await screen.findByText('màn chọn')).toBeInTheDocument();
  });

  it('explains unusable photos and offers recapture', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/jobs/j1', () => json(job({ status: 'failed', error_code: 'unusable_photo', options: [], analysis: { ...job().analysis!, usable: false, issues: ['blurry', 'base_hidden'] } }))],
    ]);
    renderAt('/phan-tich/j1', <Route path="/phan-tich/:jobId" element={<Analyzing />} />);
    expect(await screen.findByText(/ảnh bị mờ, không thấy rõ gốc/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chụp lại' })).toHaveAttribute('href', '/chup');
  });
});

describe('Choose', () => {
  it('shows options with sketch, switches option and spends a credit', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/jobs/j1', () => json(job())],
      ['POST /api/v1/jobs/j1/choose', () => json(job({ status: 'rendering_final', chosen_option_id: 'o2', credits_left: 0 }))],
    ]);
    renderAt('/chon/j1', <><Route path="/chon/:jobId" element={<Choose />} /><Route path="/ket-qua/:jobId" element={<div>đang tạo ảnh</div>} /></>);
    expect(await screen.findByRole('heading', { name: /Trực uốn/ })).toBeInTheDocument();
    expect(screen.getByText('Ø gốc 4,2 cm')).toBeInTheDocument();
    expect(screen.getByText(/Cắt bỏ \(2 cành \+ hạ ngọn\)/)).toBeInTheDocument();
    expect(screen.getByText('Hạ ngọn khoảng 8 cm')).toBeInTheDocument();
    expect(screen.getByAltText(/Bản vẽ thiết kế thế Trực uốn/)).toHaveAttribute('src', 'https://r2/s1.svg');

    await userEvent.click(screen.getByRole('button', { name: 'Ảnh gốc' }));
    expect(screen.queryByAltText(/Bản vẽ thiết kế thế Trực uốn/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Xiêu/ }));
    expect(screen.getByRole('heading', { name: /Xiêu/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Tạo ảnh tương lai/ }));
    expect(await screen.findByText('đang tạo ảnh')).toBeInTheDocument();
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/choose'))?.body).toEqual({ option_id: 'o2' }));
  });

  it('asks to buy when out of credits', async () => {
    mockFetch([['GET /api/v1/me', () => json({ ...user, credits: 0 })], ['GET /api/v1/jobs/j1', () => json(job({ credits_left: 0 }))]]);
    renderAt('/chon/j1', <Route path="/chon/:jobId" element={<Choose />} />);
    expect(await screen.findByRole('link', { name: 'Mua lượt' })).toHaveAttribute('href', '/mua-luot');
    expect(screen.queryByRole('button', { name: /Tạo ảnh tương lai/ })).not.toBeInTheDocument();
  });
});

describe('Choose read-only after phase B', () => {
  it('shows the chosen option without spending again', async () => {
    mockFetch([['GET /api/v1/me', () => json(user)], ['GET /api/v1/jobs/j1', () => json(job({ status: 'done', chosen_option_id: 'o2', credits_left: 0 }))]]);
    renderAt('/chon/j1', <Route path="/chon/:jobId" element={<Choose />} />);
    expect(await screen.findByRole('heading', { name: /Xiêu/ })).toBeInTheDocument();
    expect(screen.getByText('Đã dùng')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tạo ảnh tương lai/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về ảnh kết quả' })).toHaveAttribute('href', '/ket-qua/j1');
  });
});

describe('Choose extras', () => {
  it('offers re-analysis with the AI-suggested front and retry after failure', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/jobs/j1', () => json(job({
        status: 'failed', chosen_option_id: 'o1', can_retry: true,
        progress: { steps: { front: { state: 'done', suggested_photo_id: 'p2', is_current: false } } },
        photos: [{ id: 'p1', url: 'https://r2/p1.webp', is_front: true }, { id: 'p2', url: 'https://r2/p2.webp', is_front: false }],
      }))],
      ['POST /api/v1/trees/t1/jobs', () => json(job({ id: 'j2', status: 'queued', options: [] }), 202)],
    ]);
    renderAt('/chon/j1', <><Route path="/chon/:jobId" element={<Choose />} /><Route path="/phan-tich/:jobId" element={<div>phân tích lại</div>} /></>);
    expect(await screen.findByRole('button', { name: 'Thử lại · dùng 1 lượt' })).toBeInTheDocument();
    expect(screen.getByText(/đã hoàn lượt cho bạn/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Phân tích lại với mặt này/ }));
    expect(await screen.findByText('phân tích lại')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ front_photo_id: 'p2' });
  });
});
