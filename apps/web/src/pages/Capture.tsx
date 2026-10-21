import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Notice } from '@/components/ui';
import { MAX_SHOTS, useCapture, VIEW_LABELS } from '@/lib/capture';
import { cx } from '@/lib/cx';
import { issueText, measureSource, type Quality } from '@/lib/imageQuality';

type CameraState = { status: 'loading' } | { status: 'ready' } | { status: 'unavailable'; reason: string };

function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Bạn chưa cho phép dùng camera. Bạn có thể bật lại trong cài đặt trình duyệt, hoặc chọn ảnh có sẵn.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Máy không có camera phù hợp. Bạn chọn ảnh có sẵn nhé.';
  return 'Không mở được camera. Bạn chọn ảnh có sẵn nhé.';
}

function QualityPill({ q }: { q: Quality | null }) {
  if (!q) return null;
  const ok = q.issue === null;
  return (
    <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-btn scrim px-3 py-2.5 text-caption" role="status" aria-live="polite">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={ok ? 'var(--leaf)' : 'var(--warn)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ok ? <path d="M5 12l4 4 10-10" /> : <path d="M12 4 2.5 20h19L12 4Zm0 6v4m0 3h.01" />}
      </svg>
      <span className="truncate">{ok ? 'Đủ sáng · ảnh nét' : issueText[q.issue!]}</span>
    </div>
  );
}

/** Màn 02 — Chụp 4 mặt phôi (design/mockups/Capture.dc.html). Luôn dùng nền tối để nhìn rõ khung ngắm. */
export default function Capture() {
  const { shots, add, addFiles, remove } = useCapture();
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState<CameraState>({ status: 'loading' });
  const [live, setLive] = useState<Quality | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  const full = shots.length >= MAX_SHOTS;
  const viewIndex = Math.min(shots.length, MAX_SHOTS - 1);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera({ status: 'unavailable', reason: 'Trình duyệt không hỗ trợ camera. Bạn chọn ảnh có sẵn nhé.' });
      return;
    }
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => undefined);
        }
        setCamera({ status: 'ready' });
      })
      .catch((e) => setCamera({ status: 'unavailable', reason: cameraError(e) }));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Kiểm tra mờ/tối liên tục trên khung hình xem trước.
  useEffect(() => {
    if (camera.status !== 'ready') return;
    const t = window.setInterval(() => {
      const v = video.current;
      if (v && v.readyState >= 2) setLive(measureSource(v, v.videoWidth, v.videoHeight));
    }, 700);
    return () => window.clearInterval(t);
  }, [camera.status]);

  const shoot = useCallback(async () => {
    const v = video.current;
    if (!v || full || !v.videoWidth) return;
    setBusy(true);
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    if (blob) add(blob, measureSource(canvas, canvas.width, canvas.height));
    setBusy(false);
  }, [add, full]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    await addFiles(files);
    setBusy(false);
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <div className="theme-dark flex min-h-dvh flex-col bg-bg text-ink">
      <div className="mx-auto flex w-full max-w-content flex-1 flex-col">
        <header className="flex items-center justify-between px-gutter py-3">
          <Link to="/" aria-label="Quay lại" className="flex h-touch w-touch items-center justify-center rounded-btn text-ink hover:text-ink">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </Link>
          <h1 className="font-body text-body font-semibold">
            {full ? 'Đã đủ 4 mặt' : `Mặt ${viewIndex + 1}/4 · ${VIEW_LABELS[viewIndex]}`}
          </h1>
          <button type="button" aria-label="Hướng dẫn chụp" aria-expanded={showHelp} onClick={() => setShowHelp((s) => !s)} className="flex h-touch w-touch items-center justify-center rounded-btn text-ink">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14" /><path d="M12 17.5v.01" /></svg>
          </button>
        </header>

        <div className="flex gap-2 px-gutter" aria-hidden="true">
          {VIEW_LABELS.map((_, i) => (
            <div key={i} className={cx('h-1 flex-1 rounded-full', i < shots.length ? 'bg-primary' : 'bg-line-strong')} />
          ))}
        </div>

        {showHelp ? (
          <div className="mx-gutter mt-3 rounded-card border border-line bg-surface p-4 text-caption">
            <p className="m-0 font-semibold">Chụp sao cho AI đọc đúng phôi</p>
            <ul className="m-0 mt-2 flex flex-col gap-1 pl-5 list-disc">
              <li>Chụp 4 mặt: trước, phải, sau, trái. Ít nhất 1 mặt cũng được.</li>
              <li>Giữ máy ngang tầm gốc, cách khoảng một sải tay, thấy rõ gốc và rễ nổi.</li>
              <li>Nền trơn (tường, tấm vải) cho kết quả tốt hơn nền cây cối rối.</li>
              <li>Tránh nắng gắt buổi trưa và chụp ngược sáng.</li>
            </ul>
          </div>
        ) : null}

        <div className="relative mx-gutter mt-4 aspect-[358/470] overflow-hidden rounded-card bg-photo">
          {camera.status === 'unavailable' ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
              <Notice tone="warn">{camera.reason}</Notice>
              <Button variant="secondary" block={false} onClick={() => fileInput.current?.click()}>
                Chọn ảnh có sẵn
              </Button>
            </div>
          ) : (
            <>
              <video ref={video} playsInline muted aria-label="Khung ngắm camera" className="h-full w-full object-cover" />
              {camera.status === 'loading' ? (
                <div className="absolute inset-0 flex items-center justify-center text-caption text-ink-muted" aria-live="polite">
                  Đang mở camera…
                </div>
              ) : null}
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 358 470" preserveAspectRatio="none" aria-hidden="true">
                <g fill="none" stroke="var(--ink)" strokeOpacity="0.85" strokeWidth="1.5">
                  <line x1="179" y1="24" x2="179" y2="320" strokeDasharray="6 6" />
                  <line x1="24" y1="330" x2="334" y2="330" />
                  <path d="M24 40V24h16M318 24h16v16" />
                </g>
              </svg>
              <div className="absolute left-3 top-[58%] max-w-[calc(100%-1.5rem)] truncate rounded-[6px] scrim px-2 py-1 text-label">Mặt đất · đặt gốc trên vạch</div>
              <QualityPill q={live} />
            </>
          )}
        </div>

        {shots.length > 0 ? (
          <ul className="m-0 mt-3 flex list-none gap-2 px-gutter p-0" aria-label="Ảnh đã chụp">
            {shots.map((s, i) => (
              <li key={s.id} className="relative">
                <img src={s.url} alt={`Ảnh ${VIEW_LABELS[i]}`} className="h-16 w-16 rounded-img object-cover" />
                {s.quality?.issue ? (
                  <span className="absolute bottom-0.5 left-0.5 rounded-[4px] bg-warn px-1 text-[11px] font-semibold text-bg" title={issueText[s.quality.issue]}>
                    !
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  aria-label={`Xóa ảnh ${VIEW_LABELS[i]}`}
                  className="absolute -right-2 -top-2 flex h-touch w-touch items-center justify-center"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-ink" aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mx-gutter mt-4 text-center text-caption text-ink-muted">
            Giữ máy ngang tầm gốc cây, cách khoảng một sải tay. Nền trơn sẽ cho kết quả tốt hơn.
          </p>
        )}
        {shots.some((s) => s.quality?.issue) ? (
          <p className="mx-gutter mt-2 text-label text-warn">Ảnh có dấu ! có thể mờ hoặc tối. Bạn nên xóa và chụp lại.</p>
        ) : null}

        <div className="mt-auto flex items-center justify-between px-8 pb-8 pt-4">
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <button
            type="button"
            aria-label="Chọn ảnh có sẵn"
            disabled={full || busy}
            onClick={() => fileInput.current?.click()}
            className="flex h-cta w-cta items-center justify-center rounded-btn border border-line-strong bg-surface text-ink disabled:opacity-50"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-8 8" /></svg>
          </button>
          <button
            type="button"
            aria-label="Chụp ảnh"
            disabled={camera.status !== 'ready' || full || busy}
            onClick={shoot}
            className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-4 border-ink p-0 disabled:opacity-40"
          >
            <span className="block h-[60px] w-[60px] rounded-full bg-ink" />
          </button>
          <button
            type="button"
            disabled={shots.length === 0}
            onClick={() => navigate('/chup/thong-tin')}
            aria-label={full ? 'Tiếp tục' : 'Bỏ qua các mặt còn lại'}
            className="flex h-cta w-cta items-center justify-center rounded-btn text-caption font-semibold text-ink disabled:opacity-40"
          >
            Xong
          </button>
        </div>
      </div>
    </div>
  );
}
