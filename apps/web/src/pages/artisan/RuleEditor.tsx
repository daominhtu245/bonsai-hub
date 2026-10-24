import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, Plus, Trash2, X } from 'lucide-react';
import { cx } from '@/lib/cx';
import { TERM_LABEL, keyLabel, termLabel } from '@/lib/ruleLabels';

/** Trình sửa bộ luật dạng form (không cần biết YAML): số, khoảng [từ, đến], bật/tắt, danh sách mã (thẻ), chữ, mục con. */

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Path = Array<string | number>;

const isObj = (v: Json): v is { [k: string]: Json } => typeof v === 'object' && v !== null && !Array.isArray(v);
const isSlug = (v: string) => /^[a-z][a-z0-9_]*$/.test(v);

function setIn(root: Json, path: Path, value: Json | undefined): Json {
  if (path.length === 0) return value as Json;
  const [k, ...rest] = path;
  if (Array.isArray(root)) {
    const copy = [...root];
    if (value === undefined && rest.length === 0) copy.splice(k as number, 1);
    else copy[k as number] = setIn(copy[k as number], rest, value);
    return copy;
  }
  const obj = { ...(root as Record<string, Json>) };
  if (value === undefined && rest.length === 0) delete obj[k as string];
  else obj[k as string] = setIn(obj[k as string], rest, value);
  return obj;
}

const input = 'min-h-[40px] rounded-btn border border-line-strong bg-surface px-3 text-caption text-ink disabled:bg-surface-2 disabled:text-ink-muted';

function NumberField({ value, onChange, readOnly, label }: { value: number; onChange: (v: number) => void; readOnly?: boolean; label: string }) {
  const [text, setText] = useState(String(value));
  return (
    <input aria-label={label} inputMode="decimal" className={cx(input, 'w-[110px] tabular')} value={text} disabled={readOnly}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value.replace(',', '.'));
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n);
      }} />
  );
}

function Tags({ value, onChange, readOnly, label }: { value: string[]; onChange: (v: string[]) => void; readOnly?: boolean; label: string }) {
  const [draft, setDraft] = useState('');
  const listId = useId();
  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((v, i) => (
        <span key={v + i} className="inline-flex min-h-[32px] items-center gap-1 rounded-chip border border-line bg-surface-2 pl-2.5 text-label" title={v}>
          {termLabel(v)}
          {!readOnly ? (
            <button type="button" aria-label={`Bỏ ${termLabel(v)}`} onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="flex h-[32px] w-[28px] items-center justify-center text-ink-subtle hover:text-danger"><X size={14} /></button>
          ) : <span className="pr-2.5" />}
        </span>
      ))}
      {!readOnly ? (
        <span className="inline-flex items-center gap-1">
          <input aria-label={`Thêm vào ${label}`} list={listId} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Thêm…"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} className={cx(input, 'w-[170px]')} />
          <datalist id={listId}>{Object.keys(TERM_LABEL).map((k) => <option key={k} value={k}>{TERM_LABEL[k]}</option>)}</datalist>
          <button type="button" onClick={add} aria-label="Thêm" className="flex h-[40px] w-[40px] items-center justify-center rounded-btn border border-line"><Plus size={16} /></button>
        </span>
      ) : null}
    </div>
  );
}

function Row({ label, code, children, onRemove }: { label: string; code: string; children: ReactNode; onRemove?: () => void }) {
  return (
    <div className="grid gap-1.5 border-b border-line py-2.5 last:border-0 md:grid-cols-[minmax(200px,32%)_1fr] md:items-center md:gap-4">
      <div className="min-w-0">
        <div className="text-caption font-medium">{label}</div>
        <div className="font-mono text-[11px] text-ink-subtle">{code}</div>
      </div>
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {onRemove ? <button type="button" onClick={onRemove} aria-label={`Xóa ${label}`} className="flex h-[40px] w-[40px] flex-none items-center justify-center rounded-btn text-ink-subtle hover:text-danger"><Trash2 size={16} /></button> : null}
      </div>
    </div>
  );
}

function Value({ k, value, path, onSet, readOnly }: { k: string; value: Json; path: Path; onSet: (p: Path, v: Json | undefined) => void; readOnly?: boolean }) {
  const label = keyLabel(k);
  if (typeof value === 'boolean') {
    return (
      <label className="inline-flex min-h-[40px] items-center gap-2 text-caption">
        <input type="checkbox" checked={value} disabled={readOnly} onChange={(e) => onSet(path, e.target.checked)} className="h-5 w-5 accent-[var(--primary)]" />
        {value ? 'Có' : 'Không'}
      </label>
    );
  }
  if (typeof value === 'number') return <NumberField label={label} value={value} readOnly={readOnly} onChange={(v) => onSet(path, v)} />;
  if (typeof value === 'string') {
    if (isSlug(value)) {
      return (
        <div className="flex flex-col gap-1">
          <input aria-label={label} className={cx(input, 'w-full max-w-[420px] font-mono')} value={value} disabled={readOnly} onChange={(e) => onSet(path, e.target.value)} />
          {TERM_LABEL[value] ? <span className="text-label text-ink-muted">{TERM_LABEL[value]}</span> : null}
        </div>
      );
    }
    return value.length > 60 ? (
      <textarea aria-label={label} className={cx(input, 'min-h-[72px] w-full py-2')} value={value} disabled={readOnly} onChange={(e) => onSet(path, e.target.value)} />
    ) : (
      <input aria-label={label} className={cx(input, 'w-full')} value={value} disabled={readOnly} onChange={(e) => onSet(path, e.target.value)} />
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 2 && value.every((x) => typeof x === 'number')) {
      return (
        <span className="inline-flex flex-wrap items-center gap-2 text-caption">
          từ <NumberField label={`${label} từ`} value={value[0] as number} readOnly={readOnly} onChange={(v) => onSet([...path, 0], v)} />
          đến <NumberField label={`${label} đến`} value={value[1] as number} readOnly={readOnly} onChange={(v) => onSet([...path, 1], v)} />
        </span>
      );
    }
    if (value.every((x) => typeof x === 'number')) {
      return (
        <span className="inline-flex flex-wrap gap-2">
          {value.map((x, i) => <NumberField key={i} label={`${label} ${i + 1}`} value={x as number} readOnly={readOnly} onChange={(v) => onSet([...path, i], v)} />)}
        </span>
      );
    }
    if (value.every((x) => typeof x === 'string')) return <Tags label={label} value={value as string[]} readOnly={readOnly} onChange={(v) => onSet(path, v)} />;
  }
  if (value === null) return <span className="text-ink-subtle">—</span>;
  return <pre className="m-0 overflow-auto rounded-btn bg-surface-2 p-2 font-mono text-[12px]">{JSON.stringify(value, null, 2)}</pre>;
}

const Ctx = { collections: [] as string[] };

function AddItem({ value, path, onSet }: { value: { [key: string]: Json }; path: Path; onSet: (p: Path, v: Json | undefined) => void }) {
  const [newKey, setNewKey] = useState('');
  const addItem = () => {
    const key = newKey.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    const template = Object.values(value).find(isObj);
    if (!key || key in value || !template) return;
    const blank: { [k: string]: Json } = {};
    for (const [tk, tv] of Object.entries(template)) blank[tk] = typeof tv === 'number' ? 0 : typeof tv === 'boolean' ? false : Array.isArray(tv) ? [] : isObj(tv) ? {} : '';
    onSet([...path, key], blank);
    setNewKey('');
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input aria-label="Mã mục mới" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="mã mục mới, vd. tung_la_han" className={cx(input, 'w-[240px] font-mono')} />
      <button type="button" onClick={addItem} className="inline-flex min-h-[40px] items-center gap-1 rounded-btn border border-line px-3 text-caption"><Plus size={14} /> Thêm mục</button>
    </div>
  );
}

function Section({ k, value, path, onSet, readOnly, depth }: { k: string; value: { [key: string]: Json }; path: Path; onSet: (p: Path, v: Json | undefined) => void; readOnly?: boolean; depth: number }) {
  // Danh sách mở rộng được (loài, thế Việt, tiêu chí chấm, đặc điểm từng thế) → thêm / xóa mục.
  const collection = Ctx.collections.includes(path.join('.'));
  return (
    <details open={depth < 1} className={cx('rounded-card border border-line bg-surface', depth > 0 && 'my-2')}>
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center gap-2 px-4 text-caption font-semibold">
        <ChevronDown size={16} className="text-ink-subtle" aria-hidden="true" />
        {keyLabel(k)} <span className="font-mono text-[11px] font-normal text-ink-subtle">{k}</span>
      </summary>
      <div className="px-4 pb-3">
        <Fields value={value} path={path} onSet={onSet} readOnly={readOnly} depth={depth + 1} removable={collection} />
        {collection && !readOnly ? <AddItem value={value} path={path} onSet={onSet} /> : null}
      </div>
    </details>
  );
}

function Fields({ value, path, onSet, readOnly, depth, removable }: { value: { [k: string]: Json }; path: Path; onSet: (p: Path, v: Json | undefined) => void; readOnly?: boolean; depth: number; removable?: boolean }) {
  return (
    <div>
      {Object.entries(value).map(([k, v]) => (isObj(v) ? (
        <div key={k} className="flex items-start gap-2">
          <div className="min-w-0 flex-1"><Section k={k} value={v} path={[...path, k]} onSet={onSet} readOnly={readOnly} depth={depth} /></div>
          {removable && !readOnly ? (
            <button type="button" onClick={() => onSet([...path, k], undefined)} aria-label={`Xóa mục ${keyLabel(k)}`}
              className="mt-2 flex h-[40px] w-[40px] flex-none items-center justify-center rounded-btn text-ink-subtle hover:text-danger"><Trash2 size={16} /></button>
          ) : null}
        </div>
      ) : (
        <Row key={k} label={keyLabel(k)} code={k}>
          <Value k={k} value={v} path={[...path, k]} onSet={onSet} readOnly={readOnly} />
        </Row>
      )))}
    </div>
  );
}

/** `collections`: đường dẫn các danh sách được thêm / xóa mục (vd. "the", "criteria"; "" = cấp trên cùng). */
export function RuleEditor({ value, onChange, readOnly, collections = [] }: {
  value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void; readOnly?: boolean; collections?: string[];
}) {
  Ctx.collections = collections;
  const root = value as { [k: string]: Json };
  const onSet = (p: Path, v: Json | undefined) => onChange(setIn(root, p, v) as Record<string, unknown>);
  const top = Object.entries(root).filter(([k]) => k !== 'version');
  const rootCollection = collections.includes('');
  return (
    <div className="flex flex-col gap-3">
      {top.map(([k, v]) => (isObj(v) ? (
        <div key={k} className="flex items-start gap-2">
          <div className="min-w-0 flex-1"><Section k={k} value={v} path={[k]} onSet={onSet} readOnly={readOnly} depth={0} /></div>
          {rootCollection && !readOnly ? (
            <button type="button" onClick={() => onSet([k], undefined)} aria-label={`Xóa mục ${keyLabel(k)}`}
              className="mt-1 flex h-[40px] w-[40px] flex-none items-center justify-center rounded-btn text-ink-subtle hover:text-danger"><Trash2 size={16} /></button>
          ) : null}
        </div>
      ) : (
        <div key={k} className="rounded-card border border-line bg-surface px-4"><Fields value={{ [k]: v }} path={[]} onSet={onSet} readOnly={readOnly} depth={1} /></div>
      )))}
      {rootCollection && !readOnly ? <div className="rounded-card border border-dashed border-line px-4 pb-3"><AddItem value={root} path={[]} onSet={onSet} /></div> : null}
    </div>
  );
}
