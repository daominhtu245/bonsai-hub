import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Button, FilterChip, Notice, Skeleton, StateView, type ViewState } from '@/components/ui';
import { adminApi, type Costs, type FailedJob, type PromptRow } from '@/lib/admin';
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
            <table className="w-full border-collapse">
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
            </table>
            <table className="w-full border-collapse">
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
            </table>
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

/** Trang quản trị: chi phí (pipeline_steps), prompt (phiên bản trong DB), job lỗi. */
export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'costs' | 'prompts' | 'failed'>('costs');
  if (user.status === 'ready' && user.data.role !== 'admin') return <Navigate to="/" replace />;
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/tai-khoan" title="Quản trị" />
      <div className="flex gap-2 px-gutter pb-3" role="group" aria-label="Mục">
        <FilterChip selected={tab === 'costs'} onClick={() => setTab('costs')}>Chi phí</FilterChip>
        <FilterChip selected={tab === 'prompts'} onClick={() => setTab('prompts')}>Prompt</FilterChip>
        <FilterChip selected={tab === 'failed'} onClick={() => setTab('failed')}>Job lỗi</FilterChip>
      </div>
      <main className="px-gutter pb-8">{tab === 'costs' ? <CostsTab /> : tab === 'prompts' ? <PromptsTab /> : <FailedTab />}</main>
    </div>
  );
}
