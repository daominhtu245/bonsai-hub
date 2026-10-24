// Các mục quản trị chuyển từ trang tab cũ (prompt, phản hồi, chế độ AI, gán nhãn, ảnh loài) — nay là trang riêng.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, FilterChip, Notice, Skeleton, StateView } from '@/components/ui';
import { adminApi, type AiSettings, type CostMode, type FeedbackRow, type PromptRow, type SpeciesRefs } from '@/lib/admin';
import { ApiError } from '@/lib/api';
import { labelsApi, type LabelList, type LabelStatus } from '@/lib/labels';
import { useLoad } from './kit';

export function PromptsTab() {
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

export function FeedbackTab() {
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
                <div className="text-ink-muted">{r.user_email} · {r.style_key ?? '—'} · <Link to={`/admin/phien/${r.job_id}`} className="font-mono">{r.job_id.slice(0, 8)}</Link>{r.reason_tags.length ? ` · ${r.reason_tags.join(', ')}` : ''}</div>
                {r.comment ? <p className="m-0 mt-1">{r.comment}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </StateView>
    </div>
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
export function AiModeTab() {
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

const LABEL_STATUS: Array<[LabelStatus, string]> = [
  ['draft', 'Chờ duyệt'], ['reviewed', 'Đã duyệt'], ['pending', 'Đang tạo nháp'], ['rejected', 'Đã bỏ'], ['failed', 'Lỗi'],
];
const LABEL_TARGET = 300;

/** Bộ dữ liệu YOLO-seg 3 lớp: tải ảnh lên / lấy ảnh từ phiên đã chạy → worker tạo mask nháp → duyệt ở trang sửa. */
export function LabelsTab() {
  const [filter, setFilter] = useState<LabelStatus | undefined>('draft');
  const [state, reload] = useLoad<LabelList>(() => labelsApi.list(filter), [filter]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const pending = state.status === 'ready' ? state.data.counts.pending : 0;

  useEffect(() => {
    if (!pending) return;
    const t = window.setInterval(reload, 4000);
    return () => window.clearInterval(t);
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (label: string, fn: () => Promise<{ created: number }>) => {
    setBusy(label);
    setMsg(null);
    try {
      const r = await fn();
      setMsg({ tone: 'success', text: `Đã thêm ${r.created} ảnh, đang tạo mask nháp.` });
      setFilter(undefined);
      reload();
    } catch (e) {
      setMsg({ tone: 'danger', text: (e as ApiError).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 text-caption">
      <StateView state={state} skeleton={<Skeleton className="h-64 rounded-card" />} empty={null}>
        {(d) => (
          <>
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">Đã duyệt</span>
                <span className="tabular text-ink-muted">{d.counts.reviewed} / {LABEL_TARGET} ảnh</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={LABEL_TARGET} aria-valuenow={d.counts.reviewed}>
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, (d.counts.reviewed / LABEL_TARGET) * 100)}%` }} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <label className="inline-flex min-h-touch cursor-pointer items-center gap-2 rounded-btn bg-primary px-4 font-semibold text-primary-on">
                {busy === 'upload' ? 'Đang tải…' : 'Tải ảnh lên'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple hidden disabled={busy !== null}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []).slice(0, 200);
                    e.target.value = '';
                    if (files.length) run('upload', () => labelsApi.upload(files));
                  }} />
              </label>
              {d.eligible_jobs > 0 ? (
                <Button variant="secondary" size="touch" block={false} loading={busy === 'jobs'} disabled={busy !== null}
                  onClick={() => run('jobs', () => labelsApi.fromJobs(Math.min(d.eligible_jobs, 200)))}>
                  Lấy {Math.min(d.eligible_jobs, 200)} ảnh từ phiên đã chạy
                </Button>
              ) : null}
            </div>
            {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

            <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc">
              <FilterChip selected={filter === undefined} onClick={() => setFilter(undefined)}>Tất cả</FilterChip>
              {LABEL_STATUS.map(([k, label]) => (
                <FilterChip key={k} selected={filter === k} onClick={() => setFilter(k)}>{label} · {d.counts[k]}</FilterChip>
              ))}
            </div>

            {d.items.length === 0 ? (
              <p className="m-0 text-ink-muted">Chưa có ảnh.</p>
            ) : (
              <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-4 lg:grid-cols-6">
                {d.items.map((it) => {
                  const label = LABEL_STATUS.find(([k]) => k === it.status)?.[1];
                  const body = (
                    <>
                      {it.thumb_url ? <img src={it.thumb_url} alt="" className="aspect-square w-full rounded-img object-cover" /> : <Skeleton className="aspect-square w-full rounded-img" />}
                      <span className="mt-1 block truncate text-label text-ink-muted">{label}{it.objects ? ` · ${it.accepted}/${it.objects}` : ''}</span>
                    </>
                  );
                  return (
                    <li key={it.id} title={it.error ?? undefined}>
                      {it.status === 'pending' ? <div>{body}</div> : <Link to={`/admin/gan-nhan/${it.id}`} className="block no-underline">{body}</Link>}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </StateView>
    </div>
  );
}

export function SpeciesTab() {
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
