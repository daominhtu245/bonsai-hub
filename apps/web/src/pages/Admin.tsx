import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Button, FilterChip, Notice, Skeleton, StateView, type ViewState } from '@/components/ui';
import { adminApi, type AiSettings, type CostMode, type Costs, type FailedJob, type FeedbackRow, type PromptRow, type SpeciesRefs } from '@/lib/admin';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): [ViewState<T>, () => void] {
  const [s, setS] = useState<ViewState<T>>({ status: 'loading' });
  const load = () => {
    setS({ status: 'loading' });
    fn().then((data) => setS({ status: 'ready', data })).catch((e: ApiError) => setS({ status: 'error', message: e.message, retry: load }));
  };
  useEffect(load, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return [s, load];
}

function CostsTab() {
  const [state] = useLoad<Costs>(() => adminApi.costs(14));
  return (
    <StateView state={state} skeleton={<Skeleton className="h-64 rounded-card" />} empty={null}>
      {(c) => {
        const max = Math.max(0.0001, ...c.days.map((d) => d.cost_usd));
        return (
          <div className="flex flex-col gap-4 text-caption">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-card border border-line bg-surface p-3"><div className="text-ink-muted">Tổng 14 ngày</div><div className="text-h2 font-display">{usd(c.total_usd)}</div></div>
              <div className="rounded-card border border-line bg-surface p-3"><div className="text-ink-muted">TB mỗi lượt trả phí</div><div className="text-h2 font-display">{c.avg_cost_per_paid_job_usd !== null ? usd(c.avg_cost_per_paid_job_usd) : '—'}</div></div>
            </div>
            <div className="overflow-x-auto"><table className="w-full border-collapse">
              <caption className="mb-1 text-left font-semibold">Theo ngày</caption>
              <thead><tr className="text-left text-ink-muted"><th className="py-1">Ngày</th><th>Chi phí</th><th>Phiên</th><th>Trả phí</th><th>Lỗi</th></tr></thead>
              <tbody>
                {c.days.map((d) => (
                  <tr key={d.day} className="border-t border-line">
                    <td className="py-1.5">{d.day.slice(5)}</td>
                    <td><div className="flex items-center gap-2"><div className="h-2 rounded-full bg-primary" style={{ width: `${(d.cost_usd / max) * 60}px` }} />{usd(d.cost_usd)}</div></td>
                    <td>{d.jobs}</td><td>{d.paid_jobs}</td><td className={d.failed_jobs ? 'font-semibold text-danger' : undefined}>{d.failed_jobs}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div className="overflow-x-auto"><table className="w-full border-collapse">
              <caption className="mb-1 text-left font-semibold">Theo bước</caption>
              <thead><tr className="text-left text-ink-muted"><th className="py-1">Bước</th><th>Lần gọi</th><th>Chi phí</th><th>Độ trễ TB</th><th>Tỉ lệ lỗi</th></tr></thead>
              <tbody>
                {c.steps.map((s) => (
                  <tr key={s.step_code} className="border-t border-line">
                    <td className="py-1.5 font-mono">{s.step_code}</td><td>{s.calls}</td><td>{usd(s.cost_usd)}</td>
                    <td>{(s.avg_latency_ms / 1000).toFixed(1)} s</td><td className={s.fail_rate > 0.1 ? 'font-semibold text-danger' : undefined}>{Math.round(s.fail_rate * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        );
      }}
    </StateView>
  );
}

function PromptsTab() {
  const [state, reload] = useLoad<PromptRow[]>(adminApi.prompts);
  const [step, setStep] = useState('P1');
  const [draft, setDraft] = useState<{ system: string; user: string; description: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const rows = state.status === 'ready' ? state.data : [];
  const steps = useMemo(() => [...new Set(rows.map((r) => r.step_code))], [rows]);
  const versions = rows.filter((r) => r.step_code === step);

  const save = async () => {
    if (!draft) return;
    try {
      const r = await adminApi.createPrompt({ step_code: step, system: draft.system || null, user: draft.user, description: draft.description });
      setMsg(`Đã tạo ${r.step_code}.${r.version} (chưa kích hoạt).`);
      setDraft(null);
      reload();
    } catch (e) {
      setMsg((e as ApiError).message);
    }
  };

  return (
    <StateView state={state} skeleton={<Skeleton className="h-64 rounded-card" />} empty={null}>
      {() => (
        <div className="flex flex-col gap-3 text-caption">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Bước">
            {steps.map((s) => <FilterChip key={s} selected={s === step} onClick={() => { setStep(s); setDraft(null); }}>{s}</FilterChip>)}
          </div>
          {msg ? <Notice tone="success">{msg}</Notice> : null}
          {versions.map((v) => (
            <details key={v.id} className="rounded-card border border-line bg-surface px-3 py-1">
              <summary className="flex min-h-touch cursor-pointer items-center gap-2">
                <span className="font-mono font-semibold">{v.version}</span>
                {v.active ? <span className="rounded-full bg-primary px-2 text-label text-primary-on">Đang dùng</span> : null}
                <span className="truncate text-ink-muted">{v.description}</span>
              </summary>
              {v.template.system ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-img bg-bg p-2 font-mono text-label">{v.template.system}</pre> : null}
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-img bg-bg p-2 font-mono text-label">{v.template.user}</pre>
              <div className="flex gap-2 py-2">
                {!v.active ? <Button size="touch" block={false} onClick={() => adminApi.activate(v.id).then(() => { setMsg(`Đã kích hoạt ${v.step_code}.${v.version}.`); reload(); })}>Kích hoạt</Button> : null}
                <Button size="touch" block={false} variant="secondary" onClick={() => setDraft({ system: v.template.system ?? '', user: v.template.user, description: '' })}>Tạo bản mới từ đây</Button>
              </div>
            </details>
          ))}
          {draft ? (
            <div className="flex flex-col gap-2 rounded-card border border-primary bg-surface p-3">
              <label className="font-medium" htmlFor="d-desc">Ghi chú thay đổi</label>
              <input id="d-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="min-h-touch rounded-btn border border-line-strong bg-surface px-3" />
              <label className="font-medium" htmlFor="d-sys">System</label>
              <textarea id="d-sys" rows={6} value={draft.system} onChange={(e) => setDraft({ ...draft, system: e.target.value })} className="rounded-btn border border-line-strong bg-surface p-2 font-mono text-label" />
              <label className="font-medium" htmlFor="d-user">User (biến dạng {'{{ten_bien}}'})</label>
              <textarea id="d-user" rows={14} value={draft.user} onChange={(e) => setDraft({ ...draft, user: e.target.value })} className="rounded-btn border border-line-strong bg-surface p-2 font-mono text-label" />
              <div className="flex gap-2"><Button size="touch" block={false} onClick={save}>Lưu bản mới</Button><Button size="touch" block={false} variant="ghost" onClick={() => setDraft(null)}>Hủy</Button></div>
            </div>
          ) : null}
        </div>
      )}
    </StateView>
  );
}

function FailedTab() {
  const [state] = useLoad<FailedJob[]>(adminApi.failed);
  return (
    <StateView state={state} skeleton={<Skeleton className="h-40 rounded-card" />} empty={null}>
      {(jobs) => jobs.length === 0 ? <p className="text-caption text-ink-muted">Không có job lỗi.</p> : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-caption">
          {jobs.map((j) => (
            <li key={j.id} className="rounded-card border border-line bg-surface p-3">
              <div className="flex justify-between gap-2"><span className="font-mono">{j.id.slice(0, 8)} · {j.error_code}</span><span className="text-ink-muted">{new Date(j.created_at).toLocaleString('vi-VN')}</span></div>
              {j.charged ? <div className="text-label text-ink-muted">Đã trừ lượt → đã hoàn</div> : null}
              <div className="mt-1 break-words font-mono text-label text-ink-muted">{j.error}</div>
            </li>
          ))}
        </ul>
      )}
    </StateView>
  );
}

function FeedbackTab() {
  const [rating, setRating] = useState<1 | -1 | undefined>(-1);
  const [state] = useLoad<FeedbackRow[]>(() => adminApi.feedback(rating), [rating]);
  return (
    <div className="flex flex-col gap-3 text-caption">
      <div className="flex gap-2" role="group" aria-label="Lọc đánh giá">
        <FilterChip selected={rating === -1} onClick={() => setRating(-1)}>Chưa đúng</FilterChip>
        <FilterChip selected={rating === 1} onClick={() => setRating(1)}>Hợp lý</FilterChip>
        <FilterChip selected={rating === undefined} onClick={() => setRating(undefined)}>Tất cả</FilterChip>
      </div>
      <StateView state={state} skeleton={<Skeleton className="h-40 rounded-card" />} empty={null}>
        {(rows) => rows.length === 0 ? <p className="text-ink-muted">Chưa có phản hồi.</p> : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {rows.map((r) => (
              <li key={r.job_id + r.created_at} className="rounded-card border border-line bg-surface p-3">
                <div className="flex justify-between gap-2">
                  <span className={r.rating === 1 ? 'font-semibold text-primary-ink' : 'font-semibold text-danger'}>{r.rating === 1 ? 'Hợp lý' : 'Chưa đúng'}</span>
                  <span className="text-ink-muted">{new Date(r.created_at).toLocaleString('vi-VN')}</span>
                </div>
                <div className="text-ink-muted">{r.user_email} · {r.style_key ?? '—'} · <span className="font-mono">{r.job_id.slice(0, 8)}</span></div>
                {r.comment ? <p className="m-0 mt-1">{r.comment}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </StateView>
    </div>
  );
}

function GiftTab() {
  const [email, setEmail] = useState('');
  const [credits, setCredits] = useState(3);
  const [batch, setBatch] = useState('beta-1');
  const [msg, setMsg] = useState<{ tone: 'success' | 'warn' | 'danger'; text: string } | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await adminApi.gift(email.trim(), credits, batch.trim());
      setMsg(r.credited ? { tone: 'success', text: `Đã cộng ${credits} lượt cho ${r.email} (hiện có ${r.credits}).` } : { tone: 'warn', text: `${r.email} đã nhận lượt của đợt "${batch}" rồi.` });
    } catch (err) {
      setMsg({ tone: 'danger', text: (err as ApiError).message });
    }
  };
  const input = 'min-h-touch rounded-btn border border-line-strong bg-surface px-3 text-body text-ink';
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 text-caption">
      <p className="m-0 text-ink-muted">Tặng lượt cho người dùng thử (họ cần đăng nhập ít nhất 1 lần). Mỗi người nhận 1 lần mỗi đợt.</p>
      <label htmlFor="g-email" className="font-medium">Email</label>
      <input id="g-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
      <label htmlFor="g-n" className="font-medium">Số lượt</label>
      <input id="g-n" type="number" min={1} max={100} value={credits} onChange={(e) => setCredits(Number(e.target.value))} className={input} />
      <label htmlFor="g-batch" className="font-medium">Mã đợt</label>
      <input id="g-batch" required pattern="[a-zA-Z0-9_-]+" value={batch} onChange={(e) => setBatch(e.target.value)} className={input} />
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <Button type="submit">Tặng lượt</Button>
    </form>
  );
}

type Choice<K extends string> = { key: K; title: string; detail: string; note?: string };

const COST: Choice<CostMode>[] = [
  { key: 'standard', title: 'Tiêu chuẩn', detail: 'Ảnh kết quả chất lượng vừa · ảnh giai đoạn chất lượng thấp', note: '≈ $0,40 / lượt' },
  { key: 'economy', title: 'Tiết kiệm', detail: 'Mọi ảnh chất lượng thấp · model chữ rẻ hơn', note: '≈ $0,17 / lượt' },
];
const ANALYSIS: Choice<AiSettings['analysis_mode']>[] = [
  { key: 'hybrid', title: 'Model riêng, API dự phòng', detail: 'YOLO-seg đọc thân, cành, rễ; chưa chắc thì gọi API' },
  { key: 'api', title: 'Chỉ API', detail: 'Luôn gọi API đọc ảnh' },
];
const DESIGN: Choice<AiSettings['design_mode']>[] = [
  { key: 'api', title: 'API', detail: 'AI thiết kế trong khuôn khổ bộ luật tỉ lệ' },
  { key: 'rules', title: 'Bộ luật', detail: 'Không tốn API · cần nghệ nhân duyệt trước khi dùng thật' },
];

function ChoiceGroup<K extends string>({ legend, name, choices, value, disabled, onChange }: {
  legend: string; name: string; choices: Choice<K>[]; value: K; disabled: boolean; onChange: (k: K) => void;
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 font-semibold">{legend}</legend>
      {choices.map((c) => (
        <label key={c.key} className={`flex min-h-[64px] cursor-pointer items-center gap-3 rounded-card border bg-surface px-4 py-3 ${value === c.key ? 'border-primary' : 'border-line'}`}>
          <input type="radio" name={name} checked={value === c.key} disabled={disabled} onChange={() => onChange(c.key)} className="h-5 w-5 accent-[var(--primary)]" />
          <span className="flex-1">
            <span className="block text-body font-medium">{c.title}</span>
            <span className="block text-ink-muted">{c.detail}</span>
          </span>
          {c.note ? <span className="tabular text-ink-muted">{c.note}</span> : null}
        </label>
      ))}
    </fieldset>
  );
}

/** Chế độ AI (apps/api/bonsai_api/services/settings.py) — áp dụng cho job bắt đầu sau khi đổi. */
function AiModeTab() {
  const [state, reload] = useLoad(adminApi.settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (patch: Parameters<typeof adminApi.saveSettings>[0]) => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.saveSettings(patch);
      reload();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <StateView state={state} skeleton={<Skeleton className="h-64 rounded-card" />} empty={null}>
      {(s) => (
        <div className="flex flex-col gap-6 text-caption">
          <ChoiceGroup legend="Chi phí ảnh" name="cost" choices={COST} value={s.cost_mode} disabled={saving} onChange={(k) => save({ cost_mode: k })} />
          <div className="flex flex-col gap-2">
            <ChoiceGroup legend="Phân tích phôi" name="analysis" choices={ANALYSIS} value={s.analysis_mode} disabled={saving} onChange={(k) => save({ analysis_mode: k })} />
            {s.analysis_mode === 'hybrid' && !s.seg_model_ready ? <Notice tone="info">Chưa có model YOLO-seg trên worker — đang dùng API.</Notice> : null}
          </div>
          <ChoiceGroup legend="Thiết kế dáng" name="design" choices={DESIGN} value={s.design_mode} disabled={saving} onChange={(k) => save({ design_mode: k })} />
          {error ? <Notice tone="danger">{error}</Notice> : null}
        </div>
      )}
    </StateView>
  );
}

function SpeciesTab() {
  const [state, reload] = useLoad<SpeciesRefs[]>(adminApi.species);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-3 text-caption">
      <p className="m-0 text-ink-muted">3–5 ảnh cây hoàn thiện mỗi loài (ảnh có quyền sử dụng). Model ảnh dùng để vẽ đúng lá, vỏ, hoa của loài.</p>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <StateView state={state} skeleton={<Skeleton className="h-40 rounded-card" />} empty={null}>
        {(list) => (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {list.map((sp) => (
              <li key={sp.key} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{sp.name_vi} <span className="font-normal text-ink-muted">· {sp.refs.length}/5 ảnh</span></span>
                  {sp.refs.length < 5 ? (
                    <label className="flex min-h-touch cursor-pointer items-center rounded-btn border border-primary px-3 font-medium text-primary-ink">
                      {busy === sp.key ? 'Đang tải…' : 'Thêm ảnh'}
                      <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy !== null}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) run(sp.key, () => adminApi.addRef(sp.key, f)); e.target.value = ''; }} />
                    </label>
                  ) : null}
                </div>
                {sp.refs.length ? (
                  <div className="flex flex-wrap gap-2">
                    {sp.refs.map((r) => (
                      <div key={r.key} className="relative">
                        <img src={r.url} alt={`Ảnh tham chiếu ${sp.name_vi}`} className="h-20 w-20 rounded-img object-cover" />
                        <button type="button" aria-label="Xóa ảnh" onClick={() => run(sp.key, () => adminApi.removeRef(sp.key, r.key))}
                          className="absolute -right-2 -top-2 flex h-touch w-touch items-center justify-center">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-ink shadow-sm" aria-hidden="true">×</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </StateView>
    </div>
  );
}

/** Trang quản trị: chi phí (pipeline_steps), prompt (phiên bản trong DB), job lỗi, phản hồi, tặng lượt, ảnh tham chiếu loài. */
export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'costs' | 'ai' | 'prompts' | 'failed' | 'feedback' | 'gift' | 'species'>('costs');
  if (user.status === 'ready' && user.data.role !== 'admin') return <Navigate to="/" replace />;
  return (
    <div className="mx-auto flex min-h-dvh max-w-wide flex-col">
      <BackHeader to="/tai-khoan" title="Quản trị" />
      <div className="h-3" />
      <div className="flex flex-wrap gap-2 px-gutter pb-3" role="group" aria-label="Mục">
        {([['costs', 'Chi phí'], ['ai', 'Chế độ AI'], ['prompts', 'Prompt'], ['failed', 'Job lỗi'], ['feedback', 'Phản hồi'], ['gift', 'Tặng lượt'], ['species', 'Ảnh loài']] as const).map(([k, label]) => (
          <FilterChip key={k} selected={tab === k} onClick={() => setTab(k)}>{label}</FilterChip>
        ))}
      </div>
      <main className="px-gutter pb-8">
        {{ costs: <CostsTab />, ai: <AiModeTab />, prompts: <PromptsTab />, failed: <FailedTab />, feedback: <FeedbackTab />, gift: <GiftTab />, species: <SpeciesTab /> }[tab]}
      </main>
    </div>
  );
}
