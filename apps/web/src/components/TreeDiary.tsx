import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Notice, Skeleton } from '@/components/ui';
import { accountApi, type ProgressPhoto } from '@/lib/account';
import { ApiError, uploadPhoto } from '@/lib/api';

const day = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

/** Nhật ký cây: chụp ảnh cây thật theo thời gian để so với lộ trình. */
export function TreeDiary({ treeId }: { treeId: string }) {
  const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = () => accountApi.progress(treeId).then(setPhotos).catch(() => setPhotos([]));
  useEffect(() => {
    load();
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
      await accountApi.addProgress(treeId, await uploadPhoto(file));
      await load();
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
      </div>
    </section>
  );
}
