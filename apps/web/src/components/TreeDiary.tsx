import { useEffect, useRef, useState } from 'react';
import { Camera, Check, X } from 'lucide-react';
import { Notice, Skeleton } from '@/components/ui';
import { accountApi, type ProgressPhoto } from '@/lib/account';
import { ApiError, uploadPhoto } from '@/lib/api';
import { communityApi, type Milestone, type Reality } from '@/lib/community';
import { cx } from '@/lib/cx';

const day = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');
const short = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });

/** Mốc 1 / 3 / 6 tháng: chụp đúng mốc được tặng lượt. */
function Milestones({ items }: { items: Milestone[] }) {
  if (!items.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ul className="m-0 mt-3 flex list-none gap-2 p-0" aria-label="Mốc nhật ký">
      {items.map((m) => {
        const open = !m.rewarded && m.open_from <= today && today <= m.open_to;
        return (
          <li key={m.month} className={cx('flex flex-1 flex-col items-center rounded-btn border px-1 py-1.5 text-center text-label',
            m.rewarded ? 'border-line bg-surface-2 text-ink-muted' : open ? 'border-primary text-ink' : 'border-line text-ink-subtle')}>
            <span className="font-semibold">{m.month} tháng</span>
            <span className="inline-flex items-center gap-0.5">
              {m.rewarded ? <><Check size={12} aria-hidden="true" />Đã nhận</> : open ? `Chụp ngay +${m.credits} lượt` : `${short(m.open_from)} · +${m.credits} lượt`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Dự đoán và thực tế: ảnh giai đoạn lẽ ra đang tới vs ảnh cây thật mới nhất; người dùng chấm độ giống. */
function RealityCard({ treeId, r, onRated }: { treeId: string; r: Reality; onRated: (s: number) => void }) {
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="mb-2 text-label font-semibold text-ink-muted">Dự đoán và thực tế · sau {r.months.toLocaleString('vi-VN')} tháng</div>
      <div className="grid grid-cols-2 gap-2">
        <figure className="m-0">
          {r.predicted_url ? <img src={r.predicted_url} alt={`Minh họa giai đoạn ${r.stage_code}`} className="aspect-square w-full rounded-img object-cover" />
            : <div className="flex aspect-square items-center justify-center rounded-img bg-surface-2 text-label text-ink-subtle">{r.stage_code}</div>}
          <figcaption className="mt-1 text-center text-label text-ink-muted">Minh họa {r.stage_code}</figcaption>
        </figure>
        <figure className="m-0">
          <img src={r.real_url} alt="Ảnh cây thật mới nhất" className="aspect-square w-full rounded-img object-cover" />
          <figcaption className="mt-1 text-center text-label text-ink-muted">Cây thật {day(r.real_taken_at)}</figcaption>
        </figure>
      </div>
      <div className="mt-2 flex items-center gap-1" role="group" aria-label="Cây thật giống dự đoán bao nhiêu (1–5)">
        <span className="mr-1 text-label text-ink-muted">Giống</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-pressed={r.score === n} onClick={() => communityApi.rateReality(treeId, n).then(() => onRated(n)).catch(() => null)}
            className={cx('h-touch min-w-touch flex-1 rounded-btn border text-caption font-medium', r.score === n ? 'border-ink bg-ink text-bg' : 'border-line text-ink-muted')}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Nhật ký cây: chụp ảnh cây thật theo thời gian để so với lộ trình. */
export function TreeDiary({ treeId }: { treeId: string }) {
  const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reward, setReward] = useState<number>(0);
  const [miles, setMiles] = useState<Milestone[]>([]);
  const [reality, setReality] = useState<Reality | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = () => accountApi.progress(treeId).then(setPhotos).catch(() => setPhotos([]));
  const loadExtras = () => {
    communityApi.milestones(treeId).then(setMiles).catch(() => setMiles([]));
    communityApi.reality(treeId).then(setReality).catch(() => setReality(null));
  };
  useEffect(() => {
    load();
    loadExtras();
  }, [treeId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // ảnh mới cần vài giây để xử lý (xóa thông tin vị trí, thu nhỏ)
    if (!photos?.some((p) => !p.ready)) return;
    const t = window.setTimeout(load, 3000);
    return () => window.clearTimeout(t);
  }, [photos]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const p = await accountApi.addProgress(treeId, await uploadPhoto(file));
      setReward(p.reward ?? 0);
      await load();
      loadExtras();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (p: ProgressPhoto) => {
    if (!window.confirm(`Xóa ảnh ngày ${day(p.taken_at)}?`)) return;
    await accountApi.deleteProgress(treeId, p.id).catch(() => null);
    load();
  };

  return (
    <section className="mx-gutter mt-4" aria-labelledby="diary-title">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 id="diary-title" className="eyebrow">Nhật ký cây</h2>
        {photos?.length ? <span className="text-label text-ink-subtle">{photos.length} ảnh</span> : null}
      </div>
      <div className="rounded-card border border-line bg-surface p-3 shadow-card">
        <button type="button" onClick={() => input.current?.click()} disabled={busy}
          className="flex min-h-cta w-full items-center justify-center gap-2 rounded-btn border border-dashed border-line-strong text-caption font-medium text-ink hover:bg-surface-2 disabled:opacity-60">
          <Camera size={20} strokeWidth={1.75} aria-hidden="true" />
          {busy ? 'Đang tải ảnh…' : 'Thêm ảnh cây hôm nay'}
        </button>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) add(f); }} />
        {error ? <div className="mt-2"><Notice tone="danger">{error}</Notice></div> : null}
        {reward > 0 ? <div className="mt-2"><Notice tone="success">Đúng mốc: +{reward} lượt</Notice></div> : null}
        <Milestones items={miles} />
        {photos === null ? <Skeleton className="mt-3 h-24 rounded-img" /> : photos.length ? (
          <ul className="m-0 mt-3 grid list-none grid-cols-3 gap-2 p-0">
            {photos.map((p) => (
              <li key={p.id} className="relative">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={`Ảnh cây ngày ${day(p.taken_at)}`} className="aspect-square w-full rounded-img object-cover" loading="lazy" /></a>
                ) : <Skeleton className="aspect-square w-full rounded-img" />}
                <span className="mt-1 block text-center text-label text-ink-muted">{day(p.taken_at)}</span>
                <button type="button" aria-label={`Xóa ảnh ngày ${day(p.taken_at)}`} onClick={() => remove(p)}
                  className="absolute -right-1 -top-1 flex h-touch w-touch items-center justify-center">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-ink shadow-card"><X size={14} aria-hidden="true" /></span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="m-0 mt-2 text-center text-label text-ink-subtle">Chụp lại cây mỗi tháng để thấy cây lớn dần.</p>}
        {reality ? <RealityCard treeId={treeId} r={reality} onRated={(n) => setReality({ ...reality, score: n })} /> : null}
      </div>
    </section>
  );
}
