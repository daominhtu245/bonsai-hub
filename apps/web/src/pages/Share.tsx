import { useEffect, useState } from 'react';
import { ChevronRight, Clapperboard, Download, Facebook, Link2, Share2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Notice, Segmented, Skeleton } from '@/components/ui';
import { accountApi, downloadImage, type Share as ShareData } from '@/lib/account';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cx } from '@/lib/cx';
import { mediaApi, pollMedia, type MediaState } from '@/lib/media';
import { useFeature } from '@/lib/features';

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
  const [video, setVideo] = useState<MediaState | null>(null);
  const [videoPoll, setVideoPoll] = useState(false);
  const timelapse = useFeature('timelapse');

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

  useEffect(() => {
    if (!timelapse) return;
    mediaApi.video(jobId).then((v) => { setVideo(v); if (v.state === 'running') setVideoPoll(true); }).catch(() => setVideo(null));
  }, [jobId, timelapse]);

  useEffect(() => {
    if (!videoPoll) return;
    return pollMedia(() => mediaApi.makeVideo(jobId), () => mediaApi.video(jobId), (v) => {
      setVideo(v);
      if (v.state !== 'running') setVideoPoll(false);
    }, (e) => { setToast(e.message); setVideoPoll(false); });
  }, [jobId, videoPoll]);

  const videoName = video?.content_type === 'video/mp4' ? 'bonsai-tua-nhanh.mp4' : 'bonsai-tua-nhanh.webp';
  const videoAction = () => {
    if (video?.state !== 'done' || !video.url) return setVideoPoll(true);
    const url = video.url;
    return run(async () => {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], videoName, { type: video.content_type ?? blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
      await downloadImage(url, videoName);
      setToast('Đã lưu video.');
    });
  };
  const videoHint = videoPoll || video?.state === 'running' ? 'Đang dựng video…' : video?.state === 'done' ? 'Sẵn sàng · TikTok, Reels, Zalo' : video?.state === 'failed' ? 'Chưa dựng được, bấm để thử lại' : 'Phôi → dáng hoàn chỉnh, 10 giây';

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

  /** Bảng chia sẻ của máy (Zalo, Messenger, TikTok…) nếu có; không có thì sao chép liên kết. */
  const nativeShare = () =>
    run(async () => {
      if (!share) return;
      const file = await imageFile(share.images[fmt], filename);
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: share.url });
        return;
      }
      await navigator.clipboard.writeText(share.url);
      setToast('Đã sao chép liên kết.');
    });

  const actions = [
    { key: 'share', label: 'Chia sẻ', hint: 'Zalo, Messenger, TikTok…', Icon: Share2, onClick: nativeShare },
    { key: 'fb', label: 'Đăng lên Facebook', Icon: Facebook, onClick: () => share && window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(share.url)}`, '_blank', 'noopener') },
    { key: 'save', label: 'Tải ảnh về máy', Icon: Download, onClick: () => run(async () => { await downloadImage(share!.images[fmt], filename); setToast('Đã lưu ảnh.'); }) },
    { key: 'copy', label: 'Sao chép link trang kết quả', Icon: Link2, onClick: () => run(async () => { await navigator.clipboard.writeText(share!.url); setToast('Đã sao chép liên kết.'); }) },
  ];

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to={`/ket-qua/${jobId}`} title="Chia sẻ" />

      <div className="px-gutter pt-4">
        <Segmented<Fmt> label="Khổ ảnh" value={fmt} onChange={setFmt} options={[['9x16', 'Dọc 9:16'], ['1x1', 'Vuông 1:1']]} />
      </div>

      <div className="mx-auto mt-4 w-[220px] max-w-full">
        {error ? (
          <Notice tone="danger">{error}</Notice>
        ) : share ? (
          <img src={share.images[fmt]} alt="Ảnh chia sẻ: phôi hôm nay và minh họa cây sau vài năm"
            className={cx('w-full rounded-card border border-line bg-surface-2 shadow-raised', fmt === '9x16' ? 'aspect-[9/16]' : 'aspect-square')} />
        ) : (
          <Skeleton className={cx('w-full rounded-card', fmt === '9x16' ? 'aspect-[9/16]' : 'aspect-square')} />
        )}
      </div>

      <div className="mx-gutter mt-5 flex flex-col gap-3">
        <label className={cx('flex min-h-[56px] items-center gap-3 rounded-card border border-line bg-surface px-4 shadow-card', !isNursery && 'opacity-60')}>
          <span className="flex-1">
            <span className="block text-caption font-medium">Logo và số điện thoại vườn</span>
            <span className="block text-label text-ink-subtle">
              {!isNursery ? 'Dành cho tài khoản nhà vườn' : hasBrandInfo ? `${me?.garden_name ?? ''} ${me?.phone ?? ''}`.trim() : <Link to="/tai-khoan">Thêm tên vườn, SĐT</Link>}
            </span>
          </span>
          <input type="checkbox" role="switch" checked={branded && isNursery} disabled={!isNursery || !hasBrandInfo} onChange={(e) => setBranded(e.target.checked)} className="switch" />
        </label>

        <ul className="m-0 list-none divide-y divide-line overflow-hidden rounded-card border border-line bg-surface p-0 shadow-card">
          {actions.map(({ key, label, hint, Icon, onClick }) => (
            <li key={key}>
              <button type="button" disabled={!share || busy} onClick={onClick} className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left hover:bg-surface-2 disabled:opacity-50">
                <Icon size={18} strokeWidth={1.75} className="flex-none text-ink-muted" aria-hidden="true" />
                <span className="flex-1">
                  <span className="block text-caption font-medium">{label}</span>
                  {hint ? <span className="block text-label text-ink-subtle">{hint}</span> : null}
                </span>
                <ChevronRight size={16} className="text-ink-subtle" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>

        {timelapse ? <button type="button" disabled={busy || videoPoll} onClick={videoAction}
          className="flex min-h-[56px] w-full items-center gap-3 rounded-card border border-line bg-surface px-4 text-left shadow-card hover:bg-surface-2 disabled:opacity-60">
          <Clapperboard size={18} strokeWidth={1.75} className="flex-none text-ink-muted" aria-hidden="true" />
          <span className="flex-1">
            <span className="block text-caption font-medium">{video?.state === 'done' ? 'Chia sẻ video tua nhanh' : 'Tạo video tua nhanh'}</span>
            <span className="block text-label text-ink-subtle" aria-live="polite">{videoHint}</span>
          </span>
          <ChevronRight size={16} className="text-ink-subtle" aria-hidden="true" />
        </button> : null}
      </div>

      {toast ? <div className="fixed inset-x-gutter bottom-6 mx-auto max-w-content shadow-raised"><Notice tone="success">{toast}</Notice></div> : null}
      <div className="h-8" />
    </div>
  );
}
