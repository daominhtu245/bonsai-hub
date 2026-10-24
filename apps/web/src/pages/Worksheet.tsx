import { useEffect, useState } from 'react';
import { ChevronLeft, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button, Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { mediaApi } from '@/lib/media';

const GRID = 'linear-gradient(var(--line-strong) 1px, transparent 1px), linear-gradient(90deg, var(--line-strong) 1px, transparent 1px)';

/** A3 — Phiếu tập vẽ: in phác họa phôi mờ trên lưới ô, người chơi vẽ dáng mong muốn bằng bút đậm. */
export default function Worksheet() {
  const { jobId = '' } = useParams();
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    mediaApi.art(jobId, 'pencil').then((m) => (m.S0 ? setSrc(m.S0) : setError('Chưa có ảnh phôi.'))).catch((e: ApiError) => setError(e.message));
  }, [jobId]);

  return (
    <div className="print-page theme-light mx-auto max-w-[820px] bg-surface px-gutter py-4 text-ink">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link to={`/ket-qua/${jobId}`} className="inline-flex min-h-touch items-center gap-1 text-caption text-ink-muted no-underline"><ChevronLeft size={16} />Quay lại</Link>
        <Button size="touch" block={false} onClick={() => window.print()} disabled={!src}><Printer size={18} aria-hidden="true" />In / Lưu PDF</Button>
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : !src ? <Skeleton className="aspect-[3/4] rounded-card" /> : (
        <article className="print-block">
          <div className="flex items-end justify-between gap-4 border-b border-line pb-2 text-[15px]">
            <h1 className="m-0 text-[22px] font-semibold">Phiếu tập vẽ</h1>
            <span className="text-ink-muted">Ngày ........ / ........ / ............</span>
          </div>
          <div className="relative mt-3 aspect-[3/4] overflow-hidden rounded-card border border-line-strong">
            <img src={src} alt="Phác họa phôi" className="absolute inset-0 h-full w-full object-contain opacity-40" />
            <div aria-hidden="true" className="absolute inset-0" style={{ backgroundImage: GRID, backgroundSize: '5% 3.75%' }} />
          </div>
          <p className="m-0 mt-2 text-[14px] text-ink-muted">Vẽ dáng mong muốn bằng bút đậm: gạch cành bỏ, khoanh tầng tán, chấm ngọn mới.</p>
        </article>
      )}
    </div>
  );
}
