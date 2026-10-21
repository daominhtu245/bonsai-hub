import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { measureSource, type Quality } from './imageQuality';

export const VIEW_LABELS = ['Mặt trước', 'Mặt phải', 'Mặt sau', 'Mặt trái'] as const;
export const MAX_SHOTS = 4;
const MAX_EDGE = 2560; // ảnh gửi lên; server chuẩn hóa tiếp về 1536

export interface Shot {
  id: string;
  blob: Blob;
  url: string;
  quality: Quality | null;
}

interface CaptureValue {
  shots: Shot[];
  frontId: string | null;
  add: (blob: Blob, quality: Quality | null) => void;
  addFiles: (files: FileList | File[]) => Promise<void>;
  remove: (id: string) => void;
  setFront: (id: string) => void;
  reset: () => void;
}

const Ctx = createContext<CaptureValue | null>(null);

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Đọc ảnh từ thư viện: xoay theo EXIF, thu nhỏ, đổi sang JPEG (bỏ metadata). Ảnh trình duyệt không đọc được (vd. HEIC trên Chrome) giữ nguyên. */
async function normalizeFile(file: File): Promise<{ blob: Blob; quality: Quality | null }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const quality = measureSource(bmp, bmp.width, bmp.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    if (blob) return { blob, quality };
  } catch {
    /* rơi xuống dưới */
  }
  const type = file.type || (/\.hei[cf]$/i.test(file.name) ? 'image/heic' : 'image/jpeg');
  return { blob: file.type ? file : new Blob([file], { type }), quality: null };
}

export function CaptureProvider({ children }: { children: ReactNode }) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [frontId, setFrontId] = useState<string | null>(null);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  useEffect(() => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url)), []);

  const add = useCallback((blob: Blob, quality: Quality | null) => {
    setShots((prev) => (prev.length >= MAX_SHOTS ? prev : [...prev, { id: newId(), blob, url: URL.createObjectURL(blob), quality }]));
  }, []);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const room = MAX_SHOTS - shotsRef.current.length;
      for (const f of Array.from(files).slice(0, Math.max(0, room))) {
        const { blob, quality } = await normalizeFile(f);
        add(blob, quality);
      }
    },
    [add],
  );

  const remove = useCallback((id: string) => {
    setShots((prev) => {
      const s = prev.find((x) => x.id === id);
      if (s) URL.revokeObjectURL(s.url);
      return prev.filter((x) => x.id !== id);
    });
    setFrontId((f) => (f === id ? null : f));
  }, []);

  const reset = useCallback(() => {
    shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url));
    setShots([]);
    setFrontId(null);
  }, []);

  const value = useMemo<CaptureValue>(
    () => ({ shots, frontId: frontId ?? shots[0]?.id ?? null, add, addFiles, remove, setFront: setFrontId, reset }),
    [shots, frontId, add, addFiles, remove, reset],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCapture(): CaptureValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCapture must be used inside CaptureProvider');
  return v;
}
