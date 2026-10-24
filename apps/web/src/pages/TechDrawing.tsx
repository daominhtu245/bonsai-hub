import { useEffect, useState } from 'react';
import { ChevronLeft, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button, Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { mediaApi, type Drawing } from '@/lib/media';

const TONE: Record<Drawing['rows'][number]['action'], string> = { cut: 'text-seal', wire: 'text-leaf', grow: 'text-brass' };

/** A4 — Bản vẽ kỹ thuật in đem ra vườn: số trên ảnh = số dòng trong bảng; ô vuông để đánh dấu làm xong. */
export default function TechDrawing() {
  const { jobId = '' } = useParams();
  const [d, setD] = useState<Drawing | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    mediaApi.drawing(jobId).then(setD).catch((e: ApiError) => setError(e.message));
  }, [jobId]);

  return (
    <div className="print-page theme-light mx-auto max-w-[820px] bg-surface px-gutter py-4 text-[16px] leading-relaxed text-ink">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link to={`/ket-qua/${jobId}`} className="inline-flex min-h-touch items-center gap-1 text-caption text-ink-muted no-underline"><ChevronLeft size={16} />Quay lại</Link>
        <Button size="touch" block={false} onClick={() => window.print()} disabled={!d}><Printer size={18} aria-hidden="true" />In / Lưu PDF</Button>
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : !d ? <Skeleton className="aspect-[3/4] rounded-card" /> : d.rows.length === 0 ? (
        <Notice tone="warn">Phương án này chưa có việc cắt, uốn nào.</Notice>
      ) : (
        <article>
          <h1 className="m-0 text-[22px] font-semibold">Bản vẽ kỹ thuật</h1>
          <div className="print-block mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <figure className="relative m-0 overflow-hidden rounded-card border border-line bg-photo" style={{ aspectRatio: `${d.width} / ${d.height}` }}>
              <img src={d.photo_url} alt="Ảnh phôi" className="absolute inset-0 h-full w-full opacity-70" />
              <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(d.svg)}`} alt="Bản vẽ: số cành, chỗ cắt, chỗ quấn dây, hướng uốn" className="absolute inset-0 h-full w-full" />
            </figure>
            <table className="w-full self-start text-left text-[15px]">
              <thead>
                <tr className="border-b border-line text-ink-muted">
                  <th className="w-8 py-1 font-medium">Số</th><th className="py-1 font-medium">Việc</th><th className="py-1 font-medium">Dây</th><th className="w-8 py-1" aria-label="Xong" />
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.no} className="border-b border-line align-top">
                    <td className={cx('py-2 font-semibold tabular', TONE[r.action])}>{r.no}</td>
                    <td className="py-2"><span className="font-medium">{r.title_vi}</span><br /><span className="text-ink-muted">{r.detail_vi}</span></td>
                    <td className="whitespace-nowrap py-2 tabular">{r.gauge_mm ? `${r.gauge_mm} mm · ${r.length_cm} cm` : '—'}</td>
                    <td className="py-2 text-center" aria-hidden="true">☐</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[13px] text-ink-muted">
            <li><span className="text-seal">✕ nét đứt</span> cắt</li>
            <li><span className="text-leaf">nét liền</span> giữ</li>
            <li><span className="text-brass">/ / /</span> quấn dây</li>
            <li>↷ hướng uốn</li>
            <li><span className="text-brass">→</span> nuôi cành mới</li>
          </ul>
        </article>
      )}
    </div>
  );
}
