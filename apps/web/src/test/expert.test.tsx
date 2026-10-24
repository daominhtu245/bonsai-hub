import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicProfile } from '@/components/PublicProfile';
import { AuthProvider } from '@/lib/auth';
import ArtisanConsults from '@/pages/artisan/Consults';
import { CareDetailPage, CareNewPage } from '@/pages/expert/Care';
import { AskConsultPage, ConsultDetailPage } from '@/pages/expert/Consults';
import PersonPage from '@/pages/expert/Person';
import { json, mockFetch } from './fetchMock';
import { user } from './fixtures';

function renderAt(path: string, route: string, el: JSX.Element, extra?: JSX.Element) {
  localStorage.setItem('bonsai.token', 'tok');
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={route} element={el} />{extra}</Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const consult = (patch = {}) => ({
  id: 'c1', job_id: 'j1', question: 'Cành thứ nhất có nên hạ thấp hơn?', answer: null, verdict: null, verdict_vi: null, status: 'open', credits: 2,
  rating: null, artisan: null, artisan_slug: null, created_at: '2026-10-25T00:00:00Z', answered_at: null, photo_url: 'https://r2/p.webp', sketch_url: null,
  style_vi: 'Trực uốn', design_notes: null, ...patch,
});
const garden = { credits: 3, trees: [{ tree_id: 't1', nickname: 'Si sân', species_key: 'si', thumbnail_url: null, job_id: 'j1', job_status: 'done',
  style_vi: null, stage_code: null, stage_name_vi: null, stages_done: 0, next_task_vi: null }] };

describe('Nghệ nhân, chăm hộ', () => {
  it('asks an artisan about a tree from the garden', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/public/artisans', () => json([{ slug: 'ong-tu', name: 'Ông Tư', role: 'artisan', bio: null, specialties: ['Si'], province_vi: null, answered: 3, rating: 4.8 }])],
      ['GET /api/v1/consults/price', () => json({ credits: 2, answer_within_hours: 72 })],
      ['GET /api/v1/garden', () => json(garden)],
      ['POST /api/v1/jobs/j1/consults', () => json(consult(), 201)],
    ]);
    renderAt('/hoi-nghe-nhan/moi?nghe-nhan=ong-tu', '/hoi-nghe-nhan/moi', <AskConsultPage />, <Route path="/hoi-nghe-nhan/:consultId" element={<div>chi tiết câu hỏi</div>} />);
    await userEvent.click(await screen.findByRole('radio', { name: /Si sân/ }));
    await waitFor(() => expect(screen.getByRole('radio', { name: /Ông Tư/ })).toHaveAttribute('aria-checked', 'true'));
    await userEvent.click(screen.getByRole('button', { name: '+ Cành nào nên cắt bỏ?' }));
    await userEvent.type(screen.getByLabelText('Câu hỏi'), ' Cành thứ nhất có nên hạ thấp hơn?');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi · 2 lượt' }));
    expect(await screen.findByText('chi tiết câu hỏi')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ question: 'Cành nào nên cắt bỏ? Cành thứ nhất có nên hạ thấp hơn?', artisan_slug: 'ong-tu' });
  });

  it('shows the answer and rates it', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/consults/c1', () => json(consult({ status: 'answered', answer: 'Hạ cành 15 độ.', verdict: 'fix', verdict_vi: 'Cần sửa vài chỗ', artisan: 'Ông Tư' }))],
      ['POST /api/v1/consults/c1/rate', () => new Response(null, { status: 204 })],
    ]);
    renderAt('/hoi-nghe-nhan/c1', '/hoi-nghe-nhan/:consultId', <ConsultDetailPage />);
    expect(await screen.findByText('Cần sửa vài chỗ')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '4 sao' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ rating: 4 }));
    expect(screen.getByRole('button', { name: '4 sao' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('artisan claims and answers', async () => {
    let state: 'unclaimed' | 'claimed' | 'answered' = 'unclaimed';
    const calls = mockFetch([
      ['GET /api/v1/me', () => json({ ...user, role: 'artisan' })],
      [/GET \/api\/v1\/artisan\/consults/, () => json(state === 'answered' ? [] : [consult(state === 'claimed' ? { artisan: 'Tôi' } : {})])],
      ['POST /api/v1/artisan/consults/c1/claim', () => { state = 'claimed'; return json(consult({ artisan: 'Tôi' })); }],
      ['POST /api/v1/artisan/consults/c1/answer', () => { state = 'answered'; return json(consult({ status: 'answered' })); }],
    ]);
    renderAt('/admin/hoi-dap', '/admin/hoi-dap', <ArtisanConsults />);
    await userEvent.click(await screen.findByRole('button', { name: 'Nhận câu hỏi' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Nên chọn hướng khác' }));
    await userEvent.type(screen.getByLabelText('Lời khuyên'), 'Nên để thế xiêu, giữ cành hậu, hạ ngọn.');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi trả lời' }));
    expect(await screen.findByText('Không có câu hỏi.')).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/answer'))?.body).toEqual({ answer: 'Nên để thế xiêu, giữ cành hậu, hạ ngọn.', verdict: 'rethink' });
  });

  it('nursery page links to care request; owner sends a tree', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/public/people/vuon-a', () => json({ slug: 'vuon-a', name: 'Vườn A', role: 'nursery', bio: 'Chuyên si', specialties: ['Si'], province_vi: 'Cần Thơ',
        answered: 0, rating: null, contact_phone: '0909000111', listings: [{ code: 'L1', title: 'Phôi si', price_vnd: 2000000, photo_url: null }] })],
      ['GET /api/v1/garden', () => json(garden)],
      ['GET /api/v1/public/people/vuon-a', () => json({ slug: 'vuon-a', name: 'Vườn A', role: 'nursery', bio: null, specialties: [], province_vi: 'Cần Thơ', answered: 0, rating: null })],
      ['POST /api/v1/care-requests', () => json({ id: 'r1' }, 201)],
    ]);
    const { unmount } = renderAt('/nguoi/vuon-a', '/nguoi/:slug', <PersonPage />);
    expect(await screen.findByRole('link', { name: 'Gửi chăm hộ' })).toHaveAttribute('href', '/cham-ho/moi?vuon=vuon-a');
    expect(screen.getByRole('link', { name: /Phôi si/ })).toHaveAttribute('href', '/tin/L1');
    unmount();
    renderAt('/cham-ho/moi?vuon=vuon-a', '/cham-ho/moi', <CareNewPage />, <Route path="/cham-ho/:requestId" element={<div>yêu cầu đã gửi</div>} />);
    await userEvent.click(screen.getByRole('radio', { name: /Nuôi hộ/ }));
    await userEvent.click(await screen.findByRole('radio', { name: /Si sân/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    expect(await screen.findByText('yêu cầu đã gửi')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ kind: 'grow', nursery_slug: 'vuon-a', tree_id: 't1', job_id: 'j1' });
  });

  it('nursery accepts a care request', async () => {
    let status = 'requested';
    const req = () => ({ id: 'r1', kind: 'care', kind_vi: 'Chăm hộ', status, status_vi: status === 'active' ? 'Đang chăm' : 'Chờ nhà vườn nhận', tree_id: 't1',
      tree_name: 'Si sân', job_id: null, start_date: null, end_date: null, note: 'Tưới sáng', owner: 'Chú Ba', nursery: 'Vườn A', nursery_slug: 'vuon-a',
      role: 'nursery', contact_phone: null, created_at: '2026-10-25T00:00:00Z', updates: [] });
    mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/care-requests/r1', () => json(req())],
      ['POST /api/v1/care-requests/r1/action', () => { status = 'active'; return json(req()); }],
    ]);
    renderAt('/cham-ho/r1', '/cham-ho/:requestId', <CareDetailPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Nhận chăm' }));
    expect(await screen.findByRole('button', { name: /Gửi ảnh/ })).toBeInTheDocument();
  });

  it('public profile editor is only for nurseries and artisans', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json({ ...user, role: 'nursery', public_slug: null, specialties: [] })],
      ['PATCH /api/v1/me', () => json({ ...user, role: 'nursery', public_slug: 'vuon-ba-la', specialties: ['Si'] })],
    ]);
    localStorage.setItem('bonsai.token', 'tok');
    render(<AuthProvider><MemoryRouter><PublicProfile /></MemoryRouter></AuthProvider>);
    await userEvent.type(await screen.findByLabelText('Tên trang'), 'Vườn Bà Lá');
    await userEvent.type(screen.getByLabelText(/Chuyên môn/), 'Si');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu trang' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ public_slug: 'vuon-ba-la', bio: null, specialties: ['Si'] }));
    expect(await screen.findByText('Đã lưu trang.')).toBeInTheDocument();
  });
});
