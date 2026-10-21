import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
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

describe('Result', () => {
  it('follows phase B progress and shows before/after when done', async () => {
    let gets = 0;
    const done = job({ status: 'done', chosen_option_id: 'o1', result: { final_url: 'https://r2/S4_1.webp', years: 4, low_confidence: true, chosen_style_vi: 'Trực uốn' } });
    mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/jobs/j1', () => json(gets++ === 0 ? job({ status: 'rendering_final', chosen_option_id: 'o1', progress: { steps: { render: { state: 'running' } } } }) : done)],
      ['GET /api/v1/jobs/j1/events', () => sse([
        { status: 'judging', progress: { steps: { render: { state: 'done' }, judge: { state: 'running' } } }, error_code: null },
        { status: 'done', progress: {}, error_code: null },
      ])],
    ]);
    renderResult();
    expect(await screen.findByAltText(/Minh họa cây sau khoảng 4 năm/)).toHaveAttribute('src', 'https://r2/S4_1.webp');
    expect(screen.getByText('Minh họa sau ~4 năm')).toBeInTheDocument();
    expect(screen.getByText(/Độ tin cậy thấp/)).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '30');
  });

  it('tells the user the credit was refunded on failure', async () => {
    mockFetch([['GET /api/v1/me', () => json(user)], ['GET /api/v1/jobs/j1', () => json(job({ status: 'failed', chosen_option_id: 'o1', error_code: 'image_unavailable' }))]]);
    renderResult();
    expect(await screen.findByText(/Đã hoàn lượt cho bạn/)).toBeInTheDocument();
  });
});
