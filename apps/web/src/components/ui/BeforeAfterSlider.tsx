import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

interface Props {
  before: ReactNode;
  after: ReactNode;
  beforeLabel: string;
  afterLabel: string;
  /** 0–100, vị trí vạch chia ban đầu. */
  initial?: number;
}

/** So sánh trước/sau bằng vạch kéo. Kéo bằng ngón tay/chuột, hoặc phím mũi tên khi focus. */
export function BeforeAfterSlider({ before, after, beforeLabel, afterLabel, initial = 50 }: Props) {
  const [pos, setPos] = useState(initial);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const moveTo = useCallback((clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPos(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    moveTo(e.clientX);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveTo(e.clientX);
  };
  const stop = () => {
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2;
    const next = { ArrowLeft: pos - step, ArrowRight: pos + step, Home: 0, End: 100 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setPos(Math.min(100, Math.max(0, next)));
  };

  return (
    <figure className="m-0 overflow-hidden rounded-card border border-line bg-surface">
      <div
        ref={box}
        className="relative touch-pan-y select-none bg-photo"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <div className="[&>*]:block [&>*]:h-auto [&>*]:w-full">{after}</div>
        <div className="absolute inset-0 [&>*]:block [&>*]:h-full [&>*]:w-full [&>*]:object-cover" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          {before}
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-surface" style={{ left: `${pos}%` }} />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Kéo để so sánh trước và sau"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          aria-valuetext={`${Math.round(pos)}% ảnh hiện tại`}
          onKeyDown={onKeyDown}
          className="absolute top-1/2 flex h-touch w-touch -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-line bg-surface text-ink-muted"
          style={{ left: `${pos}%` }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="m9 6-6 6 6 6M15 6l6 6-6 6" />
          </svg>
        </div>
      </div>
      <figcaption className="flex justify-between border-t border-line px-3 py-2.5 text-caption text-ink-muted">
        <span>{beforeLabel}</span>
        <span>{afterLabel}</span>
      </figcaption>
    </figure>
  );
}
