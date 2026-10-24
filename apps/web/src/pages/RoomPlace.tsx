import { useEffect, useRef, useState } from 'react';
import { Camera, Download, ImagePlus } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Button, Notice, Segmented, Skeleton } from '@/components/ui';
import { blobUrl, mediaApi, pollMedia, type MediaState } from '@/lib/media';

type Mode = 'photo' | 'camera';
type Stand = 'none' | 'don' | 'ke';
interface Place { x: number; y: number; h: number } // tâm-đáy cây theo tỉ lệ khung; h = chiều cao cây / chiều cao khung

const STAND: Record<Exclude<Stand, 'none'>, { w: number; h: number; color: string }> = {
  don: { w: 0.55, h: 0.22, color: 'var(--bark)' }, // đôn gỗ: hẹp, cao (tỉ lệ theo chiều cao cây)
  ke: { w: 1.1, h: 0.07, color: 'var(--ink-subtle)' }, // kệ đá: dài, mỏng
};

function cssColor(v: string): string {
  const name = v.match(/var\((--[\w-]+)\)/)?.[1];
  return name ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#6B5544' : v;
}

/** F6 + F3 — đặt cây tương lai (đã tách nền) vào ảnh phòng, hoặc xem qua camera. Ghép trên máy, không tốn lượt. */
export default function RoomPlace() {
  const { jobId = '' } = useParams();
  const [cut, setCut] = useState<MediaState | null>(null);
  const [cutSrc, setCutSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [mode, setMode] = useState<Mode>('photo');
  const [room, setRoom] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [stand, setStand] = useState<Stand>('none');
  const [place, setPlace] = useState<Place>({ x: 0.5, y: 0.85, h: 0.5 });
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; h: number } | null>(null);

  useEffect(() => {
    setError(null);
    return pollMedia(() => mediaApi.makeCutout(jobId), () => mediaApi.cutout(jobId), setCut, (e) => setError(e.message));
  }, [jobId, retry]);

  useEffect(() => {
    if (cut?.state !== 'done' || !cut.url) return;
    let src = '';
    blobUrl(cut.url).then((u) => { src = u; setCutSrc(u); }).catch((e: Error) => setError(e.message));
    return () => { if (src) URL.revokeObjectURL(src); };
  }, [cut]);

  useEffect(() => () => { if (room) URL.revokeObjectURL(room); }, [room]);

  useEffect(() => {
    if (mode !== 'camera') return;
    let stream: MediaStream | null = null;
    setCamError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError('Máy này chưa mở được camera trong trình duyệt.');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then((s) => {
      stream = s;
      if (video.current) {
        video.current.srcObject = s;
        void video.current.play().catch(() => {});
      }
    }).catch(() => setCamError('Chưa được phép dùng camera. Mở quyền camera cho trang này rồi thử lại.'));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [mode]);

  const ratio = cut?.width && cut?.height ? cut.width / cut.height : 0.8;

  const frac = (e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, frac(e));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), h: place.h };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId)!;
    const now = frac(e);
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      setPlace((p) => ({ ...p, h: Math.min(1.2, Math.max(0.12, pinch.current!.h * (d / Math.max(0.01, pinch.current!.dist)))) }));
    } else {
      setPlace((p) => ({ ...p, x: Math.min(1, Math.max(0, p.x + now.x - prev.x)), y: Math.min(1.1, Math.max(0.1, p.y + now.y - prev.y)) }));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const save = async () => {
    const el = stage.current;
    if (!el || !cutSrc) return;
    const W = 1080;
    const H = Math.round((W * el.clientHeight) / el.clientWidth);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    g.fillStyle = cssColor('var(--photo-bg)');
    g.fillRect(0, 0, W, H);
    const cover = (src: CanvasImageSource, sw: number, sh: number) => {
      const s = Math.max(W / sw, H / sh);
      g.drawImage(src, (W - sw * s) / 2, (H - sh * s) / 2, sw * s, sh * s);
    };
    if (mode === 'camera' && video.current?.videoWidth) cover(video.current, video.current.videoWidth, video.current.videoHeight);
    else if (mode === 'photo' && room) {
      const img = await loadImg(room);
      cover(img, img.naturalWidth, img.naturalHeight);
    }
    const th = place.h * H;
    const tw = th * ratio;
    const bx = place.x * W;
    const by = place.y * H;
    if (stand !== 'none') {
      const st = STAND[stand];
      g.fillStyle = cssColor(st.color);
      g.fillRect(bx - (th * st.w) / 2, by, th * st.w, th * st.h);
    }
    g.drawImage(await loadImg(cutSrc), bx - tw / 2, by - th, tw, th);
    g.font = '600 26px "Be Vietnam Pro", system-ui, sans-serif';
    const label = 'Minh họa';
    const lw = g.measureText(label).width + 24;
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(20, 20, lw, 42);
    g.fillStyle = '#fff';
    g.fillText(label, 32, 50);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.9));
    if (!blob) return;
    const file = new File([blob], 'bonsai-dat-vao-phong.jpg', { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] }).catch(() => {});
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const th = `${place.h * 100}%`;
  const ready = Boolean(cutSrc);
  const bgEmpty = mode === 'photo' ? !room : Boolean(camError);

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to={`/ket-qua/${jobId}`} title="Đặt vào phòng" />
      <div className="px-gutter pt-3">
        <Segmented<Mode> label="Nền" value={mode} onChange={setMode} options={[['photo', 'Ảnh phòng'], ['camera', 'Camera']]} />
      </div>

      {error || cut?.state === 'failed' ? (
        <div className="px-gutter pt-4">
          <Notice tone="danger" action={<Button variant="secondary" size="touch" block={false} onClick={() => setRetry((n) => n + 1)}>Thử lại</Button>}>
            {error ?? 'Chưa tách được cây khỏi nền.'}
          </Notice>
        </div>
      ) : null}

      <div
        ref={stage}
        className="relative mx-gutter mt-3 aspect-[3/4] touch-none select-none overflow-hidden rounded-card border border-line bg-photo shadow-card"
        onPointerDown={ready ? onDown : undefined} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        aria-label="Khung đặt cây: kéo để di chuyển, chụm hai ngón để đổi cỡ"
      >
        {mode === 'photo' && room ? <img src={room} alt="Ảnh phòng của bạn" className="absolute inset-0 h-full w-full object-cover" /> : null}
        {mode === 'camera' ? <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" /> : null}
        {bgEmpty ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            {mode === 'photo' ? (
              <label className="inline-flex min-h-cta cursor-pointer items-center gap-2 rounded-btn border border-line-strong bg-surface px-4 text-caption font-medium shadow-card">
                <ImagePlus size={18} strokeWidth={1.75} aria-hidden="true" />
                Chọn ảnh phòng, sân
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setRoom(URL.createObjectURL(f)); }} />
              </label>
            ) : <Notice tone="warn">{camError}</Notice>}
          </div>
        ) : null}
        {ready ? (
          <div className="pointer-events-none absolute" style={{ left: `${place.x * 100}%`, top: `${place.y * 100}%`, height: th, aspectRatio: String(ratio), transform: 'translate(-50%, -100%)' }}>
            <img src={cutSrc!} alt="Cây tương lai" className="h-full w-full" draggable={false} />
            {stand !== 'none' ? (
              <div className="absolute left-1/2 -translate-x-1/2" style={{ top: '100%', width: `${STAND[stand].w * 100 / ratio}%`, height: `${STAND[stand].h * 100}%`, background: STAND[stand].color }} />
            ) : null}
          </div>
        ) : !error && cut?.state !== 'failed' ? (
          <div className="absolute inset-x-6 bottom-6"><Skeleton className="h-10 rounded-btn" /><p className="m-0 mt-2 text-center text-label text-ink-muted" aria-live="polite">Đang tách cây khỏi nền…</p></div>
        ) : null}
        <span className="theme-light absolute left-2.5 top-2.5 rounded-chip bg-surface px-2 py-0.5 text-label font-medium text-ink-muted shadow-raised">Minh họa</span>
      </div>

      <div className="mx-gutter mt-4 flex flex-col gap-3">
        <label className="flex min-h-touch items-center gap-3 text-caption">
          <span className="w-16 flex-none text-ink-muted">Cỡ cây</span>
          <input type="range" min={12} max={120} value={Math.round(place.h * 100)} onChange={(e) => setPlace((p) => ({ ...p, h: Number(e.target.value) / 100 }))} className="h-touch flex-1" aria-label="Cỡ cây" />
        </label>
        <Segmented<Stand> label="Đế" value={stand} onChange={setStand} options={[['none', 'Không đế'], ['don', 'Đôn gỗ'], ['ke', 'Kệ đá']]} />
        {mode === 'photo' && room ? (
          <label className="inline-flex min-h-touch cursor-pointer items-center justify-center gap-2 text-caption text-ink-muted">
            <Camera size={16} strokeWidth={1.75} aria-hidden="true" />
            Đổi ảnh
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setRoom(URL.createObjectURL(f)); }} />
          </label>
        ) : null}
        <Button onClick={() => void save()} disabled={!ready}>
          <Download size={18} strokeWidth={1.75} aria-hidden="true" />
          Lưu ảnh
        </Button>
      </div>
      <div className="h-8" />
    </div>
  );
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không tải được ảnh.'));
    img.src = src;
  });
}
