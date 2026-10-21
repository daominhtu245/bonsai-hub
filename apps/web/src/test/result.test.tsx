import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import type { ResultView } from '@/lib/jobs';
import Result from '@/pages/Result';
import { json, mockFetch, sse } from './fetchMock';
import { job, user } from './fixtures';

function renderResult() {
  localStorage.setItem('bonsai.token', 'tok');
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/ket-qua/j1']}>
        <Routes>
          <Route path="/ket-qua/:jobId" element={<Result />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const stage = (code: 'S0' | 'S1' | 'S2' | 'S3' | 'S4', patch: object = {}) => ({
  code, short_vi: `ngắn ${code}`, name_vi: `Tên ${code}`, time_from_start: `t${code}`,
  image_url: code === 'S2' ? null : `https://r2/${code}.webp`, fallback_sketch: code === 'S2',
  guide: { title_vi: '', see_vi: `Thấy ${code}`, actions_vi: [`Việc A ${code}`, `Việc B ${code}`], best_time_vi: 'Xuân',
           care_vi: ['Tưới'], ready_signs_vi: code === 'S4' ? [] : ['Ra chồi'], common_mistakes_vi: ['Lỗi x.'] },
  done_tasks: code === 'S4' ? [0] : [],
  ...patch,
});

const view: ResultView = {
  job_id: 'j1', tree_id: 't1', tree_nickname: 'Si sân sau', style_vi: 'Trực uốn', style_jp: 'Moyogi', low_confidence: true,
  years: 4, front_photo: { id: 'p1', url: 'https://r2/p1.webp', width: 1000, height: 1500 }, sketch_svg_url: 'https://r2/s1.svg',
  stages: (['S0', 'S1', 'S2', 'S3', 'S4'] as const).map((c) => stage(c)),
  report: { material_review_vi: 'Phôi khỏe' }, disclaimer_vi: 'Ảnh là minh hoạ định hướng.', my_rating: null,
};

describe('Result (màn 06)', () => {
  it('follows phase B progress then shows the roadmap', async () => {
    mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/jobs/j1', () => json(job({ status: 'rendering_stages', chosen_option_id: 'o1', progress: { steps: { render: { state: 'done' }, judge: { state: 'done' }, plan: { state: 'running' } } } }))],
      ['GET /api/v1/jobs/j1/events', () => sse([{ status: 'writing_guide', progress: {}, error_code: null }, { status: 'done', progress: {}, error_code: null }])],
      ['GET /api/v1/jobs/j1/result', () => json(view)],
    ]);
    renderResult();
    expect(await screen.findByRole('heading', { name: 'Tên S4' })).toBeInTheDocument();
    expect(screen.getAllByText('S4 · tS4')).toHaveLength(2); // nhãn trên ảnh + thẻ hướng dẫn
    expect(screen.getByText('Độ tin cậy thấp')).toBeInTheDocument();
    expect(screen.getByAltText(/Minh họa giai đoạn S4/)).toHaveAttribute('src', 'https://r2/S4.webp');
    expect(screen.getByRole('checkbox', { name: 'Việc A S4' })).toBeChecked();
    expect(screen.getByText('Ảnh là minh hoạ định hướng.')).toBeInTheDocument();
  });

  it('switches stages, shows sketch fallback, saves tasks and feedback', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/jobs/j1', () => json(job({ status: 'done', chosen_option_id: 'o1' }))],
      ['GET /api/v1/jobs/j1/result', () => json(view)],
      ['PUT /api/v1/jobs/j1/tasks', () => new Response(null, { status: 204 })],
      ['POST /api/v1/jobs/j1/feedback', () => new Response(null, { status: 204 })],
    ]);
    renderResult();
    await screen.findByRole('heading', { name: 'Tên S4' });

    await userEvent.click(screen.getByRole('button', { name: 'S2 ngắn S2' }));
    expect(screen.getByRole('heading', { name: 'Tên S2' })).toBeInTheDocument();
    expect(screen.getByAltText('Bản vẽ thiết kế thay cho ảnh giai đoạn này')).toHaveAttribute('src', 'https://r2/s1.svg');
    expect(screen.getByText(/chưa tạo được đủ tin cậy/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Việc B S2' }));
    expect(screen.getByRole('checkbox', { name: 'Việc B S2' })).toBeChecked();
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ stage_code: 'S2', task_index: 1, done: true }));

    const fb = screen.getByRole('region', { name: /có hợp lý không/ });
    await userEvent.click(within(fb).getByRole('button', { name: 'Chưa đúng' }));
    expect(within(fb).getByRole('button', { name: 'Chưa đúng' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/feedback'))?.body).toEqual({ rating: -1 }));
  });

  it('tells the user the credit was refunded on failure', async () => {
    mockFetch([['GET /api/v1/me', () => json(user)], ['GET /api/v1/jobs/j1', () => json(job({ status: 'failed', chosen_option_id: 'o1', error_code: 'image_unavailable' }))]]);
    renderResult();
    expect(await screen.findByText(/Đã hoàn lượt cho bạn/)).toBeInTheDocument();
  });
});

describe('Result delete', () => {
  it('deletes the tree after confirmation', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/jobs/j1', () => json(job({ status: 'done', chosen_option_id: 'o1' }))],
      ['GET /api/v1/jobs/j1/result', () => json(view)],
      ['DELETE /api/v1/trees/t1', () => new Response(null, { status: 204 })],
    ]);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderResult();
    const btn = await screen.findByRole('button', { name: 'Xóa cây này' });
    await userEvent.click(btn);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await userEvent.click(btn);
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
  });
});
