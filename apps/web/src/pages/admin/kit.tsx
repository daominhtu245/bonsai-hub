// Thành phần dùng chung cho bảng điều khiển quản trị (bố cục máy tính, vẫn dùng được trên điện thoại).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button, Notice, Skeleton } from '@/components/ui';
import type { ViewState } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';

// ---------- định dạng ----------
export const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;
export const vndShort = (n: number) =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`;
export const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
export const pct = (n: number) => `${(n * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
export const num = (n: number) => n.toLocaleString('vi-VN');
export const dt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).replace(' ', '\u00a0') : '—'; // không xuống dòng giữa giờ và ngày
export const dur = (s: number | null | undefined) =>
  s == null ? '—' : s < 90 ? `${Math.round(s)} s` : `${(s / 60).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} ph`;
/** mili-giây → "9,1 s" */
export const secs = (ms: number) => `${(ms / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
export const shortId = (id: string) => id.slice(0, 8);

// ---------- dữ liệu ----------
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): [ViewState<T>, () => void, (d: T) => void] {
  const [s, setS] = useState<ViewState<T>>({ status: 'loading' });
  const seq = useRef(0);
  const load = useCallback(() => {
    const id = ++seq.current;
    setS((prev) => (prev.status === 'ready' ? prev : { status: 'loading' })); // giữ dữ liệu cũ khi lọc lại
    fn()
      .then((data) => id === seq.current && setS({ status: 'ready', data }))
      .catch((e: ApiError) => id === seq.current && setS({ status: 'error', message: e.message, retry: load }));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  return [s, load, (data: T) => setS({ status: 'ready', data })];
}

/** Bộ lọc nằm trên URL → tải lại trang / gửi link vẫn giữ bộ lọc. */
export function useUrlState<T extends Record<string, string>>(defaults: T): [T, (patch: Partial<T>) => void] {
  const [params, setParams] = useSearchParams();
  const state = { ...defaults } as T;
  for (const k of Object.keys(defaults)) {
    const v = params.get(k);
    if (v !== null) (state as Record<string, string>)[k] = v;
  }
  const update = (patch: Partial<T>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '' || v === defaults[k]) next.delete(k);
      else next.set(k, v as string);
    }
    if (!('offset' in patch)) next.delete('offset');
    setParams(next, { replace: true });
  };
  return [state, update];
}

// ---------- bố cục ----------
export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-5">
      <div className="min-w-0">
        <h1 className="m-0 text-h1">{title}</h1>
        {sub ? <p className="m-0 mt-1 text-caption text-ink-muted">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx('min-w-0 rounded-card border border-line bg-surface shadow-card', className)}>
      {title || actions ? (
        <header className="flex min-h-[48px] flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
          {title ? <h2 className="m-0 text-caption font-semibold">{title}</h2> : <span />}
          {actions}
        </header>
      ) : null}
      <div className={pad ? 'p-4' : undefined}>{children}</div>
    </section>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-center gap-2">{children}</div>;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    const t = window.setTimeout(() => v !== value && onChange(v), 350);
    return () => window.clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="relative flex min-w-[220px] flex-1 items-center sm:max-w-[360px]">
      <Search size={16} className="pointer-events-none absolute left-3 text-ink-subtle" aria-hidden="true" />
      <input type="search" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="min-h-touch w-full rounded-btn border border-line-strong bg-surface pl-9 pr-3 text-caption text-ink" />
    </label>
  );
}

export function Select<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: Array<[T, string]> }) {
  return (
    <label className="flex min-h-touch items-center gap-2 rounded-btn border border-line-strong bg-surface pl-3 text-caption">
      <span className="text-ink-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="min-h-[42px] rounded-btn bg-transparent pr-2 font-medium text-ink">
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: Array<[T, ReactNode]> }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={cx('-mb-px min-h-touch whitespace-nowrap border-b-2 px-3 text-caption font-medium',
            value === k ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:text-ink')}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------- hiển thị ----------
type Tone = 'neutral' | 'success' | 'warn' | 'danger' | 'info';
const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-muted',
  success: 'bg-primary-soft text-primary-ink',
  warn: 'bg-warn-soft text-warn-ink',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-surface-2 text-ink',
};
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-chip px-2 py-0.5 text-label font-medium', TONE[tone])}>{children}</span>;
}

const JOB_STATUS: Record<string, [string, Tone]> = {
  queued: ['Chờ', 'neutral'], analyzing: ['Đang phân tích', 'info'], designing: ['Đang thiết kế', 'info'],
  awaiting_choice: ['Chờ chọn', 'neutral'], rendering_final: ['Đang tạo ảnh', 'info'], judging: ['Đang chấm', 'info'],
  rendering_stages: ['Ảnh giai đoạn', 'info'], writing_guide: ['Viết hướng dẫn', 'info'], done: ['Xong', 'success'], failed: ['Lỗi', 'danger'],
  pending: ['Chờ thanh toán', 'warn'], paid: ['Đã thanh toán', 'success'], expired: ['Hết hạn', 'neutral'], cancelled: ['Đã hủy', 'neutral'],
};
export function StatusBadge({ status, stuck }: { status: string; stuck?: boolean }) {
  if (stuck) return <Badge tone="danger">Bị treo</Badge>;
  const [label, tone] = JOB_STATUS[status] ?? [status, 'neutral'];
  return <Badge tone={tone}>{label}</Badge>;
}

export const ROLE_LABEL: Record<string, string> = { player: 'Người chơi', nursery: 'Nhà vườn', admin: 'Quản trị' };

export function StatCard({ label, value, previous, format, goodWhen = 'up', hint }: {
  label: string; value: number; previous?: number; format: (n: number) => string; goodWhen?: 'up' | 'down'; hint?: string;
}) {
  const change = previous !== undefined && previous !== 0 ? (value - previous) / Math.abs(previous) : null;
  const good = change === null || change === 0 ? null : (change > 0) === (goodWhen === 'up');
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-card border border-line bg-surface p-4 shadow-card">
      <span className="text-label font-medium text-ink-muted">{label}</span>
      <span className="tabular truncate text-[24px] font-semibold leading-tight">{format(value)}</span>
      <span className="flex flex-wrap items-center gap-1 text-label text-ink-subtle">
        {change !== null ? (
          <span className={cx('inline-flex items-center gap-0.5 font-medium', good ? 'text-primary-ink' : good === false ? 'text-danger' : 'text-ink-muted')}>
            {change > 0 ? <ArrowUpRight size={14} aria-hidden="true" /> : change < 0 ? <ArrowDownRight size={14} aria-hidden="true" /> : null}
            {pct(Math.abs(change))}
          </span>
        ) : null}
        {previous !== undefined ? <span>kỳ trước {format(previous)}</span> : null}
        {hint ? <span>{hint}</span> : null}
      </span>
    </div>
  );
}

export function KeyValue({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="m-0 grid grid-cols-[minmax(120px,40%)_1fr] gap-x-4 gap-y-2 text-caption">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-muted">{k}</dt>
          <dd className="m-0 min-w-0 break-words">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function JsonBlock({ data, open = false, label = 'JSON' }: { data: unknown; open?: boolean; label?: string }) {
  if (data === null || data === undefined) return <span className="text-ink-subtle">—</span>;
  return (
    <details open={open} className="rounded-btn border border-line bg-bg">
      <summary className="cursor-pointer px-3 py-2 text-label font-medium text-ink-muted">{label}</summary>
      <pre className="m-0 max-h-[420px] overflow-auto whitespace-pre-wrap break-words px-3 pb-3 font-mono text-[12px] leading-relaxed">{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}

// ---------- bảng ----------
export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, empty = 'Không có dữ liệu.', dense }: {
  columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; empty?: ReactNode; dense?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-caption">
        <thead className="sticky top-0 z-[1] bg-surface">
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx('whitespace-nowrap px-3 py-2 text-label font-medium text-ink-muted', c.align === 'right' ? 'text-right' : 'text-left', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-ink-muted">{empty}</td></tr>
          ) : rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined} tabIndex={onRowClick ? 0 : undefined}
              className={cx('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2')}>
              {columns.map((c) => (
                <td key={c.key} className={cx('px-3 align-middle', dense ? 'py-1.5' : 'py-2.5', c.align === 'right' && 'tabular text-right', c.className)}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= limit) return <div className="px-3 py-2 text-label text-ink-subtle">{num(total)} dòng</div>;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-label text-ink-muted">
      <span>{num(offset + 1)}–{num(Math.min(total, offset + limit))} / {num(total)}</span>
      <span className="flex items-center gap-1">
        <button type="button" aria-label="Trang trước" disabled={page <= 1} onClick={() => onChange(Math.max(0, offset - limit))}
          className="flex h-touch w-touch items-center justify-center rounded-btn hover:bg-surface-2 disabled:opacity-40"><ChevronLeft size={16} /></button>
        <span className="tabular">{page}/{pages}</span>
        <button type="button" aria-label="Trang sau" disabled={page >= pages} onClick={() => onChange(offset + limit)}
          className="flex h-touch w-touch items-center justify-center rounded-btn hover:bg-surface-2 disabled:opacity-40"><ChevronRight size={16} /></button>
      </span>
    </div>
  );
}

/** Bảng có 4 trạng thái: đang tải (khung xương), lỗi, rỗng, bình thường. */
export function TableView<T>({ state, children }: { state: ViewState<T>; children: (data: T) => ReactNode }) {
  if (state.status === 'loading') return <div className="flex flex-col gap-2 p-3" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full rounded-btn" />)}</div>;
  if (state.status === 'error') return <div className="p-3"><Notice tone="danger" action={state.retry ? <Button variant="secondary" size="touch" block={false} onClick={state.retry}>Thử lại</Button> : undefined}>{state.message}</Notice></div>;
  if (state.status === 'empty') return null;
  return <>{children(state.data)}</>;
}

// ---------- hộp xác nhận ----------
interface ConfirmOpts {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  note?: { label: string; required?: boolean; placeholder?: string };
  fields?: Array<{ name: string; label: string; type?: 'text' | 'number'; required?: boolean; placeholder?: string; defaultValue?: string }>;
}
type ConfirmResult = { note: string; values: Record<string, string> } | null;

export function useConfirm(): [(o: ConfirmOpts) => Promise<ConfirmResult>, ReactNode] {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<(r: ConfirmResult) => void>();
  const ref = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const d = ref.current;
    if (!opts || !d) return;
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', ''); // trình duyệt cũ / jsdom
  }, [opts]);

  const ask = (o: ConfirmOpts) =>
    new Promise<ConfirmResult>((resolve) => {
      resolver.current = resolve;
      setNote('');
      setValues(Object.fromEntries((o.fields ?? []).map((f) => [f.name, f.defaultValue ?? ''])));
      setOpts(o);
    });
  const close = (r: ConfirmResult) => {
    ref.current?.close?.();
    setOpts(null);
    resolver.current?.(r);
  };
  const valid = opts && (!opts.note?.required || note.trim().length >= 3) && (opts.fields ?? []).every((f) => !f.required || values[f.name]?.trim());
  const input = 'min-h-touch w-full rounded-btn border border-line-strong bg-surface px-3 text-body text-ink';

  const node = opts ? (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); close(null); }} aria-labelledby="confirm-title"
      className="w-[min(92vw,460px)] rounded-card border border-line bg-surface p-0 text-ink shadow-raised backdrop:bg-[var(--ink)] backdrop:opacity-40">
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); if (valid) close({ note: note.trim(), values }); }} className="flex flex-col gap-3 p-5">
        <h2 id="confirm-title" className="m-0 text-h2">{opts.title}</h2>
        {opts.body ? <div className="text-caption text-ink-muted">{opts.body}</div> : null}
        {(opts.fields ?? []).map((f) => (
          <label key={f.name} className="flex flex-col gap-1 text-caption font-medium">
            {f.label}
            <input type={f.type ?? 'text'} required={f.required} placeholder={f.placeholder} value={values[f.name] ?? ''}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} className={input} />
          </label>
        ))}
        {opts.note ? (
          <label className="flex flex-col gap-1 text-caption font-medium">
            {opts.note.label}
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={opts.note.placeholder}
              className="rounded-btn border border-line-strong bg-surface p-2 text-body text-ink" />
          </label>
        ) : null}
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" size="touch" block={false} onClick={() => close(null)}>Hủy</Button>
          <Button type="submit" variant={opts.danger ? 'danger' : 'primary'} size="touch" block={false} disabled={!valid}
            className={opts.danger ? 'border border-danger' : undefined}>{opts.confirmLabel}</Button>
        </div>
      </form>
    </dialog>
  ) : null;
  return [ask, node];
}

/** Chạy một thao tác, hiện thông báo kết quả ở đầu trang. */
export function useAction(): [(fn: () => Promise<unknown>, ok: string) => Promise<boolean>, ReactNode, boolean] {
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (msg?.tone !== 'success') return;
    const t = window.setTimeout(() => setMsg(null), 4000);
    return () => window.clearTimeout(t);
  }, [msg]);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      setMsg({ tone: 'success', text: ok });
      return true;
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof ApiError || e instanceof Error ? e.message : 'Có lỗi xảy ra.' });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const node = msg ? <div className="mb-4" role="status"><Notice tone={msg.tone}>{msg.text}</Notice></div> : null;
  return [run, node, busy];
}
