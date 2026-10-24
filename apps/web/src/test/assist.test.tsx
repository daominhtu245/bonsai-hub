import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SpeakButton } from '@/components/SpeakButton';
import { AuthProvider } from '@/lib/auth';
import AssistantPage from '@/pages/utilities/Assistant';
import HealthPage from '@/pages/utilities/Health';
import WeatherPage from '@/pages/utilities/Weather';
import { json, mockFetch } from './fetchMock';
import { user } from './fixtures';

function renderPage(el: JSX.Element) {
  localStorage.setItem('bonsai.token', 'tok');
  return render(<AuthProvider><MemoryRouter>{el}</MemoryRouter></AuthProvider>);
}

const finding = { key: 'rep_sap', name_vi: 'Rệp sáp, rệp vảy', kind: 'pest', likelihood: 'medium', likelihood_vi: 'Khá giống', reason_vi: null,
  signs_vi: 'Đốm bông trắng', treat_now_vi: ['Cách ly cây.'], prevent_vi: ['Kiểm tra mỗi tuần.'], see_expert_if_vi: 'Rệp phủ dày' };

describe('Trợ lý chăm cây', () => {
  it('checks leaf health from symptoms', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/tools/health/symptoms', () => json([{ code: 'white_cotton', label_vi: 'Có đốm bông trắng' }, { code: 'sticky_leaves', label_vi: 'Lá dính nhớt' }])],
      ['POST /api/v1/health-checks', () => json({ id: 'h1', status: 'done', symptoms: ['white_cotton'], photo_url: null, created_at: '',
        result: { method: 'symptoms', usable: true, healthy: false, findings: [finding] } }, 201)],
    ]);
    renderPage(<HealthPage />);
    expect(screen.getByRole('button', { name: 'Xem bệnh gì' })).toBeDisabled();
    await userEvent.click(await screen.findByRole('button', { name: 'Có đốm bông trắng' }));
    await userEvent.click(screen.getByRole('button', { name: 'Xem bệnh gì' }));
    expect(await screen.findByRole('heading', { name: 'Rệp sáp, rệp vảy' })).toBeInTheDocument();
    expect(screen.getByText('Cách ly cây.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ symptoms: ['white_cotton'] });
  });

  it('asks a question and gets the AI answer after the offline one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let polls = 0;
    mockFetch([
      ['GET /api/v1/me', () => json(user)],
      ['GET /api/v1/garden', () => json({ credits: 1, trees: [] })],
      ['POST /api/v1/assistant/questions', () => json({ id: 'q1', question: 'Khi nào tuốt lá?', status: 'queued', created_at: '',
        answer: { answer_vi: 'Tra bảng: 2–4 lần/năm.', topics: ['defoliation'], method: 'offline', suggest_expert: false } }, 201)],
      ['GET /api/v1/assistant/questions/q1', () => { polls++; return json({ id: 'q1', question: 'Khi nào tuốt lá?', status: 'done', created_at: '',
        answer: { answer_vi: 'Bạn tuốt lá khoảng 35 ngày trước khi muốn hoa nở.', topics: [], method: 'ai', suggest_expert: true } }); }],
    ]);
    renderPage(<AssistantPage />);
    await userEvent.type(await screen.findByLabelText('Câu hỏi'), 'Khi nào tuốt lá?');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    expect(await screen.findByText('Tra bảng: 2–4 lần/năm.')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(await screen.findByText('Bạn tuốt lá khoảng 35 ngày trước khi muốn hoa nở.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hỏi nghệ nhân' })).toBeInTheDocument();
    expect(polls).toBe(1);
    vi.useRealTimers();
  });

  it('shows weather alerts for the profile province', async () => {
    const calls = mockFetch([
      ['GET /api/v1/me', () => json({ ...user, province: 'can_tho' })],
      ['GET /api/v1/tools/provinces', () => json([{ code: 'can_tho', name: 'Cần Thơ', region: 'south' }, { code: 'ho_chi_minh', name: 'TP. Hồ Chí Minh', region: 'south' }])],
      [/GET \/api\/v1\/tools\/weather/, () => json({ province: 'can_tho', province_vi: 'Cần Thơ', days: [{ date: '2026-10-26', max_c: 33, min_c: 25, rain_mm: 80, wind_kmh: 10 }],
        alerts: [{ date: '2026-10-26', kind: 'heavy_rain', title_vi: 'Sắp mưa to', advice_vi: 'Kê chậu cao.', value: 80 }] })],
    ]);
    renderPage(<WeatherPage />);
    expect(await screen.findByText('Sắp mưa to · 26/10')).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('weather?province=can_tho'))).toBe(true));
    expect(calls.some((c) => c.url.endsWith('weather?province=ho_chi_minh'))).toBe(false); // chờ hồ sơ, không tải tỉnh mặc định trước
  });

  it('reads text aloud in Vietnamese when supported', async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    Object.assign(window, { speechSynthesis: { speak, cancel, getVoices: () => [] } });
    (globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class { lang = ''; rate = 1; voice = null; onend = null; onerror = null; constructor(public text: string) {} };
    render(<SpeakButton text="Tưới khi đất se khô." />);
    await userEvent.click(screen.getByRole('button', { name: 'Đọc to' }));
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Tưới khi đất se khô.', lang: 'vi-VN' }));
    expect(screen.getByRole('button', { name: 'Dừng đọc' })).toBeInTheDocument();
  });
});
