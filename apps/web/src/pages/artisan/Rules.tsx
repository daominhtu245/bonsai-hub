import { useEffect, useMemo, useRef, useState } from 'react';
import { History, RotateCcw, Save } from 'lucide-react';
import { Button, Notice, Skeleton, StateView } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { artisanApi, type RuleDocDetail, type RuleDocKey } from '@/lib/artisan';
import { cx } from '@/lib/cx';
import { Badge, JsonBlock, PageHeader, Panel, Tabs, dt, useLoad } from '../admin/kit';
import { RuleEditor } from './RuleEditor';
import { RuleSetVisual, StylesVnVisual } from './visual/RuleVisual';

const VISUAL: Partial<Record<RuleDocKey, typeof RuleSetVisual>> = { rule_set: RuleSetVisual, styles_vn: StylesVnVisual };

// danh sách được thêm / xóa mục trong từng bộ luật ("" = cấp trên cùng, vd. mỗi loài)
const COLLECTIONS: Record<RuleDocKey, string[]> = { rule_set: ['style_specifics'], styles_vn: ['the'], species: [''], judging: ['criteria'], pests: ['items'] };

const DOCS: Array<[RuleDocKey, string]> = [
  ['rule_set', 'Luật tạo dáng & tỉ lệ'], ['styles_vn', 'Dáng & thế Việt'], ['species', 'Loài cây'], ['judging', 'Bảng chấm & ngưỡng'], ['pests', 'Sâu bệnh, thời tiết'],
];

/** Bộ luật có phiên bản: sửa bằng form → lưu bản mới (kèm ghi chú) → áp dụng; xem / quay về bản cũ. */
export default function RulesPage() {
  const [doc, setDoc] = useState<RuleDocKey>('rule_set');
  const [state, reload, setData] = useLoad(() => artisanApi.rule(doc), [doc]);
  return (
    <div>
      <PageHeader title="Bộ luật & thông số" sub="Sửa trên form, lưu thành bản mới. Phiên AI bắt đầu sau khi áp dụng sẽ dùng bản mới." />
      <Tabs value={doc} onChange={setDoc} tabs={DOCS} />
      <StateView state={state} skeleton={<Skeleton className="h-96 rounded-card" />} empty={null}>
        {(d) => <DocEditor key={d.doc} detail={d} onSaved={setData} reload={reload} />}
      </StateView>
    </div>
  );
}

function DocEditor({ detail, onSaved, reload }: { detail: RuleDocDetail; onSaved: (d: RuleDocDetail) => void; reload: () => void }) {
  const [draft, setDraft] = useState<Record<string, unknown>>(detail.content);
  const [viewing, setViewing] = useState<{ version: number; content: Record<string, unknown> } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [activate, setActivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const Visual = VISUAL[detail.doc];
  const [mode, setMode] = useState<'visual' | 'form'>(Visual ? 'visual' : 'form');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(detail.content), [draft, detail.content]);
  const [rev, setRev] = useState(0); // đổi → form dựng lại (ô số giữ chữ đang gõ riêng)
  const reset = (c: Record<string, unknown>) => { setDraft(c); setRev((r) => r + 1); };
  const shown = useRef(detail);
  useEffect(() => { // đã lưu / đổi bản đang dùng → bản nháp theo bản mới (lần hiển thị đầu thì không)
    if (shown.current !== detail) {
      shown.current = detail;
      reset(detail.content);
    }
  }, [detail]);

  useEffect(() => { // kiểm tra hợp lệ khi đang sửa (chờ 0,5 s sau lần gõ cuối)
    if (!dirty) return setErrors([]);
    const t = window.setTimeout(() => artisanApi.validate(detail.doc, draft).then((r) => setErrors(r.errors)).catch(() => null), 500);
    return () => window.clearTimeout(t);
  }, [draft, dirty, detail.doc]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const d = await artisanApi.saveRule(detail.doc, draft, note.trim(), activate);
      setNote('');
      onSaved(d);
      setMsg({ tone: 'success', text: activate ? 'Đã lưu và áp dụng bản mới.' : 'Đã lưu bản nháp (chưa áp dụng).' });
    } catch (e) {
      setMsg({ tone: 'danger', text: (e as ApiError).message });
    } finally {
      setBusy(false);
    }
  };
  const view = async (v: number) => {
    const r = await artisanApi.ruleVersion(detail.doc, v);
    setViewing({ version: v, content: r.content });
  };
  const activateVersion = async (v: number) => {
    setBusy(true);
    try {
      onSaved(await artisanApi.activate(detail.doc, v));
      setViewing(null);
      setMsg({ tone: 'success', text: `Đang áp dụng bản ${v}.` });
    } catch (e) {
      setMsg({ tone: 'danger', text: (e as ApiError).message });
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="flex min-w-0 flex-col gap-3">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        {viewing ? (
          <Notice tone="info" action={
            <span className="flex flex-wrap gap-2">
              <Button size="touch" block={false} variant="secondary" onClick={() => { reset(viewing.content); setViewing(null); }}>Sửa từ bản này</Button>
              <Button size="touch" block={false} variant="ghost" onClick={() => setViewing(null)}>Về bản đang dùng</Button>
            </span>}>
            Đang xem bản {viewing.version} (chỉ xem).
          </Notice>
        ) : null}
        {Visual ? (
          <div role="group" aria-label="Cách sửa" className="flex self-start rounded-btn bg-surface-2 p-1">
            {([['visual', 'Trực quan (có hình)'], ['form', 'Form đầy đủ']] as const).map(([m, label]) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                className={cx('min-h-[40px] rounded-[6px] px-4 text-caption font-medium', mode === m ? 'bg-surface text-ink shadow-card' : 'text-ink-muted hover:text-ink')}>{label}</button>
            ))}
          </div>
        ) : null}
        {Visual && mode === 'visual' ? (
          <Visual key={viewing ? `v${viewing.version}` : `draft-${rev}`} value={(viewing ? viewing.content : draft) as never} base={detail.content as never}
            onChange={(v) => setDraft(v as Record<string, unknown>)} readOnly={Boolean(viewing)} />
        ) : (
          <RuleEditor key={viewing ? `v${viewing.version}` : `draft-${rev}`} value={viewing ? viewing.content : draft} onChange={setDraft} readOnly={Boolean(viewing)} collections={COLLECTIONS[detail.doc]} />
        )}
        <JsonBlock data={viewing ? viewing.content : draft} label="Xem dạng mã (JSON)" />
      </div>

      <aside className="flex flex-col gap-4 xl:sticky xl:top-[76px] xl:self-start">
        <Panel title="Lưu thay đổi">
          <div className="flex flex-col gap-3 text-caption">
            {errors.length ? (
              <Notice tone="danger"><ul className="m-0 list-none p-0">{errors.map((e) => <li key={e}>{e}</li>)}</ul></Notice>
            ) : dirty ? <span className="text-ink-muted">Có thay đổi chưa lưu.</span> : <span className="text-ink-subtle">Chưa có thay đổi.</span>}
            <label className="flex flex-col gap-1 font-medium">Ghi chú thay đổi
              <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Vd. Hạ độ cao cành đầu cho thế văn nhân"
                className="min-h-[72px] rounded-btn border border-line-strong bg-surface px-3 py-2 font-normal" />
            </label>
            <label className="flex min-h-touch items-center gap-2">
              <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} className="h-5 w-5 accent-[var(--primary)]" />
              Áp dụng ngay
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button size="touch" onClick={save} disabled={!dirty || busy || errors.length > 0 || note.trim().length < 3} loading={busy}>
                <Save size={16} aria-hidden="true" />Lưu bản mới
              </Button>
              <Button size="touch" variant="ghost" onClick={() => reset(detail.content)} disabled={!dirty || busy}>
                <RotateCcw size={16} aria-hidden="true" />Hoàn tác
              </Button>
            </div>
          </div>
        </Panel>
        <Panel title={<span className="inline-flex items-center gap-2"><History size={16} aria-hidden="true" />Các phiên bản</span>} pad={false}>
          <ul className="m-0 max-h-[460px] list-none overflow-y-auto p-0">
            {detail.versions.map((v) => (
              <li key={v.version} className={cx('flex flex-col gap-1 border-b border-line px-4 py-3 text-caption last:border-0', viewing?.version === v.version && 'bg-surface-2')}>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Bản {v.version}</span>
                  {v.active ? <Badge tone="success">Đang dùng</Badge> : null}
                  <span className="ml-auto text-label text-ink-subtle">{dt(v.created_at)}</span>
                </div>
                <span className="text-ink-muted">{v.note || '—'}</span>
                <span className="text-label text-ink-subtle">{v.created_by === 'seed' ? 'Bản gốc từ tài liệu' : v.created_by}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => view(v.version)} className="min-h-[36px] rounded-btn border border-line px-3 text-label">Xem</button>
                  {!v.active ? (
                    <button type="button" disabled={busy} onClick={() => activateVersion(v.version)} className="min-h-[36px] rounded-btn border border-line px-3 text-label">Áp dụng bản này</button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </aside>
    </div>
  );
}
