import { useCallback, useEffect, useState } from 'react';
import { Check, SkipForward, X } from 'lucide-react';
import { Button, Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { artisanApi, type JudgingSheet, type ReviewItem, type ReviewKind, type ReviewOut } from '@/lib/artisan';
import { cx } from '@/lib/cx';
import { CRITERION_LABEL, termLabel } from '@/lib/ruleLabels';
import { Badge, PageHeader, Tabs } from '../admin/kit';

// Lỗi thiết kế (Cổng 1: chấm bản vẽ P2) — phần ảnh dùng danh sách lỗi loại thẳng của bảng chấm.
const DESIGN_FAULTS = ['wrong_style_for_material', 'kept_forbidden_branch', 'cut_needed_branch', 'first_branch_wrong', 'apex_wrong', 'pot_wrong'];
const DESIGN_FAULT_LABEL: Record<string, string> = {
  wrong_style_for_material: 'Thế không hợp phôi', kept_forbidden_branch: 'Giữ cành cấm', cut_needed_branch: 'Cắt mất cành cần giữ',
  first_branch_wrong: 'Cành đầu sai', apex_wrong: 'Ngọn sai chỗ', pot_wrong: 'Chậu không hợp',
};
const COUNTS: Record<string, string> = { cut: 'cắt', keep: 'giữ', new: 'nuôi mới' };

function Figure({ label, href, children }: { label: string; href?: string | null; children: React.ReactNode }) {
  const box = <div className="relative overflow-hidden rounded-img border border-line bg-photo">{children}</div>;
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-1">
      <figcaption className="line-clamp-1 text-label font-medium text-ink-muted">{label}</figcaption>
      {href ? <a href={href} target="_blank" rel="noreferrer" title="Mở ảnh lớn">{box}</a> : box}
    </figure>
  );
}

function ScoreRow({ k, weight, checks, value, onChange }: { k: string; weight: number; checks: string[]; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-line py-2.5 last:border-0">
      <div className="flex items-baseline gap-2">
        <span className="text-caption font-semibold">{CRITERION_LABEL[k] ?? termLabel(k)}</span>
        <span className="text-label text-ink-subtle">trọng số {weight}</span>
        {value !== undefined ? (
          <button type="button" onClick={() => onChange(undefined)} className="ml-auto text-label text-ink-subtle underline">bỏ chấm</button>
        ) : <span className="ml-auto text-label text-ink-subtle">chưa chấm</span>}
      </div>
      {checks.length ? <span className="text-label text-ink-muted">{checks.map(termLabel).join(' · ')}</span> : null}
      <div className="grid grid-cols-10 gap-1" role="radiogroup" aria-label={CRITERION_LABEL[k] ?? k}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onChange(n)}
            className={cx('min-h-[40px] rounded-btn border text-caption tabular', value === n ? 'border-ink bg-ink font-semibold text-bg' : 'border-line bg-surface text-ink-muted hover:border-line-strong')}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Nghệ nhân chấm ảnh kết quả (S4) và phương án thiết kế (bản vẽ) theo bảng chấm — dữ liệu cho Cổng 1, Cổng 2. */
export default function ReviewPage() {
  const [kind, setKind] = useState<ReviewKind>('image');
  const [sheet, setSheet] = useState<JudgingSheet | null>(null);
  const [item, setItem] = useState<ReviewItem | null | undefined>(undefined);
  const [skip, setSkip] = useState<string[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [fails, setFails] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ReviewOut | null>(null);

  useEffect(() => { artisanApi.judging().then(setSheet).catch((e: ApiError) => setError(e.message)); }, []);
  const load = useCallback((k: ReviewKind, sk: string[]) => {
    setItem(undefined);
    setScores({});
    setFails([]);
    setComment('');
    setError(null);
    artisanApi.next(k, sk).then(setItem).catch((e: ApiError) => { setError(e.message); setItem(null); });
  }, []);
  useEffect(() => { setSkip([]); setDone(null); load(kind, []); }, [kind, load]);

  const target = item ? (item.kind === 'image' ? item.render_id : item.option_id) : null;
  const submit = async (passed: boolean) => {
    if (!item) return;
    setBusy(true);
    try {
      const r = await artisanApi.review({ kind: item.kind, render_id: item.render_id, option_id: item.option_id, scores, hard_fails: fails,
        passed, comment: comment.trim() || undefined });
      setDone(r);
      load(kind, skip);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  const skipOne = () => {
    if (!target) return;
    const sk = [...skip, target];
    setSkip(sk);
    load(kind, sk);
  };
  const faultList = kind === 'image' ? sheet?.fidelity_hard_fail ?? [] : DESIGN_FAULTS;
  const faultLabel = (f: string) => (kind === 'image' ? termLabel(f) : DESIGN_FAULT_LABEL[f] ?? f);

  return (
    <div>
      <PageHeader title="Chấm điểm" sub="Chấm theo bảng chấm đang áp dụng. Điểm AI chỉ hiện sau khi bạn chấm." />
      <Tabs value={kind} onChange={setKind} tabs={[['image', 'Ảnh kết quả'], ['design', 'Phương án thiết kế']]} />
      {done ? (
        <div className="mb-4">
          <Notice tone={done.passed ? 'success' : 'warn'}>
            Đã lưu: {done.passed ? 'Đạt' : 'Không đạt'}{done.total !== null ? ` · ${done.total.toFixed(0)} điểm` : ''}
            {done.ai_total !== null ? ` — AI chấm ${done.ai_total.toFixed(0)} điểm${done.ai_hard_fail?.length ? `, AI ghi lỗi: ${done.ai_hard_fail.map(termLabel).join(', ')}` : ''}` : ''}
          </Notice>
        </div>
      ) : null}
      {error ? <div className="mb-4"><Notice tone="danger">{error}</Notice></div> : null}
      {item === undefined || !sheet ? <Skeleton className="h-[520px] rounded-card" /> : item === null ? (
        <Notice tone="info">{skip.length ? 'Hết mục (đã bỏ qua một số mục — tải lại trang để xem lại).' : 'Đã chấm hết. Cảm ơn bạn!'}</Notice>
      ) : (
        <div className="grid gap-5 2xl:grid-cols-[1fr_440px]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-caption">
              {item.style_vi ? <Badge tone="info">{item.style_vi}</Badge> : null}
              {item.species_vi ? <Badge>{item.species_vi}</Badge> : null}
              {item.years ? <Badge>{item.years} năm</Badge> : null}
              {Object.entries(item.counts).filter(([k]) => k in COUNTS).map(([k, v]) => <Badge key={k}>{`${v} cành ${COUNTS[k]}`}</Badge>)}
              <span className="ml-auto text-label text-ink-subtle">còn {item.remaining} mục</span>
            </div>
            {item.why_vi ? <p className="m-0 text-caption text-ink-muted">{item.why_vi}</p> : null}
            <div className={cx('grid gap-2 md:gap-3', item.kind === 'image' ? 'grid-cols-3' : 'grid-cols-2')}>
              <Figure label="Ảnh phôi gốc" href={item.photo_url}><img src={item.photo_url} alt="Ảnh phôi gốc" className="block w-full" /></Figure>
              <Figure label={item.kind === 'image' && item.collage_url ? 'Bố cục thiết kế' : 'Bản vẽ thiết kế'} href={item.kind === 'image' ? item.collage_url : null}>
                {item.kind === 'image' && item.collage_url ? <img src={item.collage_url} alt="Bố cục thiết kế" className="block w-full" /> : (
                  <>
                    <img src={item.photo_url} alt="" className="block w-full" />
                    {item.sketch_svg_url ? <img src={item.sketch_svg_url} alt="Bản vẽ thiết kế" className="absolute inset-0 h-full w-full" /> : null}
                  </>
                )}
              </Figure>
              {item.kind === 'image' && item.result_url ? (
                <Figure label="Ảnh kết quả (AI)" href={item.result_url}><img src={item.result_url} alt="Ảnh kết quả do AI tạo" className="block w-full" /></Figure>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 2xl:sticky 2xl:top-[76px] 2xl:self-start">
            <div className="rounded-card border border-line bg-surface px-4 py-2 shadow-card">
              {Object.entries(sheet.criteria).map(([k, c]) => (
                <ScoreRow key={k} k={k} weight={c.weight} checks={c.check ?? []} value={scores[k]}
                  onChange={(v) => setScores((s) => { const n = { ...s }; if (v === undefined) delete n[k]; else n[k] = v; return n; })} />
              ))}
            </div>
            <fieldset className="m-0 rounded-card border border-line bg-surface px-4 py-3">
              <legend className="px-1 text-caption font-semibold">{kind === 'image' ? 'Lỗi loại thẳng (sai so với phôi / thiết kế)' : 'Lỗi thiết kế'}</legend>
              <div className="flex flex-wrap gap-1.5">
                {faultList.map((f) => (
                  <label key={f} className={cx('inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-chip border px-3 text-label',
                    fails.includes(f) ? 'border-danger bg-danger-soft text-danger' : 'border-line text-ink-muted')}>
                    <input type="checkbox" className="sr-only" checked={fails.includes(f)}
                      onChange={(e) => setFails((x) => (e.target.checked ? [...x, f] : x.filter((y) => y !== f)))} />
                    {faultLabel(f)}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex flex-col gap-1 text-caption font-medium">Nhận xét
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} placeholder="Chỗ nào chưa đúng, nên sửa thế nào…"
                className="min-h-[80px] rounded-btn border border-line-strong bg-surface px-3 py-2 font-normal" />
            </label>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Button size="touch" onClick={() => submit(true)} disabled={busy || fails.length > 0} loading={busy}><Check size={16} aria-hidden="true" />Đạt</Button>
              <Button size="touch" variant="danger" onClick={() => submit(false)} disabled={busy}><X size={16} aria-hidden="true" />Không đạt</Button>
              <Button size="touch" variant="ghost" block={false} onClick={skipOne} disabled={busy} aria-label="Bỏ qua"><SkipForward size={16} aria-hidden="true" /></Button>
            </div>
            {fails.length ? <span className="text-label text-ink-subtle">Có lỗi loại thẳng thì không chọn "Đạt" được.</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}
