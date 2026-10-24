import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SkillCard } from '@/components/SkillCard';
import { TreeDiary } from '@/components/TreeDiary';
import { TreePassport } from '@/components/TreePassport';
import { AuthProvider } from '@/lib/auth';
import Studio from '@/pages/Studio';
import ChallengeDetailPage from '@/pages/community/ChallengeDetail';
import PassportPublicPage from '@/pages/community/PassportPublic';
import VotePage from '@/pages/community/Vote';
import manifest from '../../public/studio/manifest.json';
import { json, mockFetch } from './fetchMock';
import { studio, user } from './fixtures';

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

const side = (id: string, style: string) => ({ id, style_vi: style, image_url: `https://r2/${id}.png` });
const today = new Date().toISOString().slice(0, 10);

describe('Cộng đồng', () => {
  it('chooses the nicer design and moves on', async () => {
    let n = 0;
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/votes/next', () => json(n++ === 0 ? { job_id: 'j1', a: side('o1', 'Trực uốn'), b: side('o2', 'Trực') } : null)],
      ['POST /api/v1/votes', () => new Response(null, { status: 204 })],
    ]);
    renderAt('/chon-dang', '/chon-dang', <VotePage />);
    await userEvent.click(await screen.findByRole('button', { name: /bên phải: Trực$/ }));
    expect(await screen.findByText(/Cảm ơn bạn đã chọn 1 cặp/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ job_id: 'j1', winner_id: 'o2', loser_id: 'o1' });
  });

  it('votes in an open challenge and hides counts', async () => {
    const detail = (myVote: number | null) => ({
      id: 'c1', title: 'Si tháng 11', description: null, prize: 'Chậu', starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-11-21T00:00:00Z',
      state: 'open', photo_url: 'https://r2/p.webp', my_vote: myVote,
      entries: [{ id: 1, image_url: 'https://r2/1.jpg', author: 'Ba', votes: null, mine: false }, { id: 2, image_url: 'https://r2/2.jpg', author: 'Tư', votes: null, mine: true }],
    });
    let voted: number | null = null;
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/challenges/c1', () => json(detail(voted))],
      ['POST /api/v1/challenges/c1/vote', () => { voted = 1; return new Response(null, { status: 204 }); }],
    ]);
    renderAt('/thu-thach/c1', '/thu-thach/:challengeId', <ChallengeDetailPage />);
    expect(await screen.findByRole('link', { name: 'Sửa bài của tôi' })).toHaveAttribute('href', '/thu-thach/c1/thiet-ke');
    expect(screen.getAllByRole('button', { name: 'Bầu' })).toHaveLength(1); // không bầu bài của mình
    await userEvent.click(screen.getByRole('button', { name: 'Bầu' }));
    expect(await screen.findByRole('button', { name: /Đã bầu/ })).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ entry_id: 1 });
    expect(screen.queryByText(/phiếu/)).toBeNull();
  });

  it('submits a challenge entry from the studio', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/challenges/c1/studio', () => json(studio)],
      ['GET /studio/manifest.json', () => json(manifest)],
      ['POST /api/v1/challenges/c1/entry', () => json({ id: 5, image_url: 'x' })],
    ]);
    renderAt('/thu-thach/c1/thiet-ke', '/thu-thach/:challengeId/thiet-ke', <Studio challengeId="c1" />,
      <Route path="/thu-thach/:challengeId" element={<div>trang thử thách</div>} />);
    expect(await screen.findByRole('button', { name: 'Cành 2: giữ' })).toBeInTheDocument(); // bắt đầu trống, không theo mẫu AI
    await userEvent.click(screen.getByRole('button', { name: 'Hoàn tất' }));
    expect(screen.queryByRole('button', { name: /Xem thử AI/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Gửi bài dự thi/ }));
    expect(await screen.findByText('trang thử thách')).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/my-design/preview'))).toBe(false);
    expect((calls.find((c) => c.method === 'POST')?.body as { style_key: string }).style_key).toBe('moyogi');
  });

  it('shows a stolen warning on the public passport', async () => {
    mockFetch([
      ['GET /api/v1/public/passport/ABCD2345', () => json({ code: 'ABCD2345', nickname: 'Si cổ', species_vi: 'Si', since: '2026-10-01', photo_url: null,
        owner: null, stolen: true, stolen_at: '2026-10-20', transfers: 1, timeline: [] })],
    ]);
    renderAt('/so-cay/ABCD2345', '/so-cay/:code', <PassportPublicPage />);
    expect(await screen.findByText(/đã được chủ báo mất/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Si cổ' })).toBeInTheDocument();
    expect(screen.getByText(/đã đổi chủ 1 lần/)).toBeInTheDocument();
  });

  it('opens the tree passport and starts a transfer', async () => {
    const base = { code: 'ABCD2345', url: 'https://x/so-cay/ABCD2345', public: false, stolen: false, pending_transfer: null, transfer_expires_at: null };
    mockFetch([
      ['POST /api/v1/trees/t1/passport', () => json(base)],
      ['POST /api/v1/trees/t1/transfer', () => json({ ...base, pending_transfer: 'XYZ98765', transfer_expires_at: '2026-11-01T00:00:00Z' })],
    ]);
    render(<TreePassport treeId="t1" />);
    await userEvent.click(screen.getByText('Sổ cây (mã QR)'));
    expect(await screen.findByAltText('Mã QR sổ cây ABCD2345')).toHaveAttribute('src', '/api/v1/public/passport/ABCD2345/qr.svg');
    await userEvent.click(screen.getByRole('button', { name: 'Chuyển cây cho chủ mới' }));
    expect(await screen.findByText('XYZ98765')).toBeInTheDocument();
  });

  it('diary shows milestones and the reward after an on-time photo', async () => {
    mockFetch([
      ['GET /api/v1/trees/t1/progress', () => json([])],
      ['GET /api/v1/trees/t1/milestones', () => json([
        { month: 1, due: today, open_from: '2000-01-01', open_to: '2999-01-01', rewarded: false, photo_taken: false, credits: 1 },
        { month: 3, due: '2999-01-01', open_from: '2998-12-01', open_to: '2999-01-20', rewarded: false, photo_taken: false, credits: 1 },
      ])],
      ['GET /api/v1/trees/t1/reality', () => json(null)],
    ]);
    render(<TreeDiary treeId="t1" />);
    expect(await screen.findByText('Chụp ngay +1 lượt')).toBeInTheDocument();
    expect(screen.getByText('3 tháng')).toBeInTheDocument();
  });

  it('shows the skill level progress', async () => {
    mockFetch([['GET /api/v1/me/skill', () => json({ level: 'hoc_tro', level_vi: 'Học trò', next_vi: 'Thợ',
      progress: [{ key: 'designs', label_vi: 'Bản thiết kế đã tạo ảnh', have: 1, need: 3 }] })]]);
    render(<SkillCard />);
    expect((await screen.findAllByText('Học trò')).length).toBeGreaterThan(0);
    expect(screen.getByRole('progressbar', { name: 'Bản thiết kế đã tạo ảnh' })).toHaveAttribute('aria-valuenow', '1');
    await waitFor(() => expect(screen.getByText('1/3')).toBeInTheDocument());
  });
});
