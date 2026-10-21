import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Button, Notice, Skeleton } from '@/components/ui';
import { accountApi, downloadImage, type Share as ShareData } from '@/lib/account';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cx } from '@/lib/cx';

type Fmt = '9x16' | '1x1';

async function imageFile(url: string, name: string): Promise<File> {
  const blob = await (await fetch(url)).blob();
  return new File([blob], name, { type: 'image/jpeg' });
}

/** Màn 07 — Chia sẻ (design/mockups/Share.dc.html). Ảnh ghép và watermark làm phía server. */
export default function Share() {
  const { jobId = '' } = useParams();
  const { user } = useAuth();
  const [fmt, setFmt] = useState<Fmt>('9x16');
  const [branded, setBranded] = useState(false);
  const [share, setShare] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const me = user.status === 'ready' ? user.data : null;
  const isNursery = me?.role === 'nursery' || me?.role === 'admin';
  const hasBrandInfo = Boolean(me?.garden_name || me?.phone);

  useEffect(() => {
    setShare(null);
    setError(null);
    accountApi.share(jobId, branded).then(setShare).catch((e: ApiError) => setError(e.message));
  }, [jobId, branded]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const filename = `bonsai-${fmt}.jpg`;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') setToast(e instanceof ApiError ? e.message : 'Chưa chia sẻ được, bạn thử lại nhé.');
    } finally {
      setBusy(false);
    }
  };

  /** Ưu tiên bảng chia sẻ của máy (có Zalo, Facebook, TikTok); không có thì dùng cách thay thế. */
  const shareTo = (target: 'zalo' | 'facebook' | 'tiktok') =>
    run(async () => {
      if (!share) return;
      const file = await imageFile(share.images[fmt], filename);
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `Dáng cây sau vài năm — xem lộ trình: ${share.url}` });
        return;
      }
      if (target === 'facebook') {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(share.url)}`, '_blank', 'noopener');
      } else if (target === 'zalo') {
        await navigator.clipboard.writeText(share.url);
        setToast('Đã sao chép link. Mở Zalo và dán vào tin nhắn nhé.');
      } else {
        await downloadImage(share.images[fmt], filename);
        setToast('Đã lưu ảnh. Mở TikTok và chọn ảnh vừa lưu để đăng.');
      }
    });

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to={`/ket-qua/${jobId}`} title="Chia sẻ kết quả" />

      <div className="flex gap-2 px-gutter" role="group" aria-label="Khổ ảnh">
        {(['9x16', '1x1'] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={fmt === f}
            onClick={() => setFmt(f)}
            className={cx('min-h-touch flex-1 rounded-btn border text-caption', fmt === f ? 'border-primary bg-primary-soft font-medium text-primary-ink' : 'border-line-strong bg-surface text-ink')}
          >
            {f === '9x16' ? 'Dọc 9:16' : 'Vuông 1:1'}
          </button>
        ))}
      </div>

      <div className="mx-auto mt-4 w-[236px] max-w-full">
        {error ? (
          <Notice tone="danger">{error}</Notice>
        ) : share ? (
          <img
            src={share.images[fmt]}
            alt="Ảnh chia sẻ: phôi hôm nay và minh họa cây sau vài năm"
            className={cx('w-full rounded-card border border-line bg-ink', fmt === '9x16' ? 'aspect-[9/16]' : 'aspect-square')}
          />
        ) : (
          <Skeleton className={cx('w-full rounded-card', fmt === '9x16' ? 'aspect-[9/16]' : 'aspect-square')} />
        )}
      </div>

      <label className={cx('mx-gutter mt-4 flex min-h-cta items-center gap-3 rounded-card border border-line bg-surface px-3.5', !isNursery && 'opacity-70')}>
        <span className="flex-1">
          <span className="block font-medium">Chèn logo và số điện thoại vườn</span>
          <span className="block text-caption text-ink-muted">
            {!isNursery ? 'Dành cho tài khoản nhà vườn' : hasBrandInfo ? `${me?.garden_name ?? ''} ${me?.phone ?? ''}`.trim() : (
              <>Chưa có tên vườn, SĐT · <Link to="/tai-khoan">Thêm ở Tài khoản</Link></>
            )}
          </span>
        </span>
        <input
          type="checkbox"
          checked={branded && isNursery}
          disabled={!isNursery || !hasBrandInfo}
          onChange={(e) => setBranded(e.target.checked)}
          className="h-6 w-6 accent-[var(--primary)]"
        />
      </label>

      <div className="mx-gutter mt-4 grid grid-cols-4 gap-2">
        {([['zalo', 'Zalo'], ['facebook', 'Facebook'], ['tiktok', 'TikTok']] as const).map(([k, label]) => (
          <button key={k} type="button" disabled={!share || busy} onClick={() => shareTo(k)}
            className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-card border border-line bg-surface text-caption text-ink disabled:opacity-50">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary-ink">{label[0]}</span>
            {label}
          </button>
        ))}
        <button type="button" disabled={!share || busy} onClick={() => run(async () => { await downloadImage(share!.images[fmt], filename); setToast('Đã lưu ảnh vào máy.'); })}
          className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-card border border-line bg-surface text-caption text-ink disabled:opacity-50">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></svg>
          Lưu ảnh
        </button>
      </div>

      <div className="mx-gutter mt-3">
        <Button variant="secondary" disabled={!share || busy}
          onClick={() => run(async () => { await navigator.clipboard.writeText(share!.url); setToast('Đã sao chép link trang kết quả.'); })}>
          Sao chép link trang kết quả
        </Button>
      </div>

      {toast ? <div className="fixed inset-x-gutter bottom-6 mx-auto max-w-content"><Notice tone="success">{toast}</Notice></div> : null}
      <p className="mx-gutter mb-7 mt-4 text-label text-ink-muted">Ảnh tương lai luôn có nhãn "Minh họa". Trang chia sẻ không hiện thông tin tài khoản của bạn.</p>
    </div>
  );
}
