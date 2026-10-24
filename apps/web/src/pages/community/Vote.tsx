import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHeader } from '@/components/BackHeader';
import { ButtonLink, Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { communityApi, type VotePair, type VoteSide } from '@/lib/community';

/** B6 — Chọn dáng đẹp: hai phương án của cùng một phôi (chủ đã chia sẻ công khai), chạm hoặc quẹt về bên đẹp hơn. */
export default function VotePage() {
  const [pair, setPair] = useState<VotePair | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [dx, setDx] = useState(0);
  const start = useRef<number | null>(null);

  const next = useCallback(() => {
    setPair(undefined);
    setDx(0);
    communityApi.nextPair().then(setPair).catch((e: ApiError) => setError(e.message));
  }, []);
  useEffect(next, [next]);

  const pick = (winner: VoteSide, loser: VoteSide) => {
    if (!pair) return;
    communityApi.vote(pair, winner, loser).then(() => { setCount((n) => n + 1); next(); }).catch((e: ApiError) => setError(e.message));
  };
  const onUp = () => {
    if (pair && Math.abs(dx) > 80) { if (dx < 0) pick(pair.a, pair.b); else pick(pair.b, pair.a); } // quẹt về phía ảnh đẹp hơn
    start.current = null;
    setDx(0);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/tien-ich" title="Chọn dáng đẹp" />
      <div className="flex flex-1 flex-col gap-3 px-gutter py-3">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {pair === undefined ? <Skeleton className="aspect-[4/3] rounded-card" /> : pair === null ? (
          <>
            <Notice tone="info">{count ? `Cảm ơn bạn đã chọn ${count} cặp. ` : ''}Đã hết cặp để chọn, quay lại sau nhé.</Notice>
            <ButtonLink to="/tien-ich" variant="secondary">Về Tiện ích</ButtonLink>
          </>
        ) : (
          <>
            <p className="m-0 text-center text-caption text-ink-muted">Dáng nào đẹp hơn?</p>
            <div className="grid touch-pan-y grid-cols-2 gap-2" style={{ transform: `translateX(${dx / 6}px)` }}
              onPointerDown={(e) => { start.current = e.clientX; }} onPointerMove={(e) => start.current !== null && setDx(e.clientX - start.current)}
              onPointerUp={onUp} onPointerCancel={() => { start.current = null; setDx(0); }}>
              {([[pair.a, pair.b], [pair.b, pair.a]] as const).map(([w, l], i) => (
                <button key={w.id} type="button" onClick={() => pick(w, l)} aria-label={`Chọn ${i === 0 ? 'bên trái' : 'bên phải'}: ${w.style_vi}`}
                  className="flex flex-col overflow-hidden rounded-card border border-line bg-surface text-left shadow-card hover:border-ink">
                  <span className="relative block aspect-[3/4] bg-photo">
                    <img src={w.image_url} alt={`Bản vẽ thế ${w.style_vi}`} className="absolute inset-0 h-full w-full object-contain" draggable={false} />
                  </span>
                  <span className="flex min-h-touch items-center justify-center px-2 text-caption font-medium">{w.style_vi}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={next} className="min-h-touch text-caption text-ink-muted">Bỏ qua</button>
          </>
        )}
      </div>
    </div>
  );
}
