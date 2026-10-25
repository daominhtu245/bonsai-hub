import { Camera, Sprout } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { GardenTree } from '@/lib/account';
import { cx } from '@/lib/cx';
import { destination, photoOverdue, treeName } from '@/lib/garden';

/** Thanh 5 giai đoạn S0→S4: đã xong tô đậm, giai đoạn đang làm tô nhạt. */
export function StageBar({ done, className }: { done: number; className?: string }) {
  return (
    <span className={cx('flex gap-0.5', className)} aria-label={`Đã xong ${done}/5 giai đoạn`} role="img">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={cx('h-1 flex-1 rounded-full', i < done ? 'bg-primary' : i === done ? 'bg-ink-subtle' : 'bg-line')} />
      ))}
    </span>
  );
}

/** Ảnh cây: ảnh tương lai (nhãn "Minh họa") kèm ảnh phôi gốc tròn nhỏ ở góc — thấy ngay "từ đâu tới đâu". */
export function TreeImage({ t, className, inset = true }: { t: GardenTree; className?: string; inset?: boolean }) {
  const main = t.future_url ?? t.photo_url ?? t.thumbnail_url;
  return (
    <div className={cx('theme-light relative overflow-hidden bg-photo', className)}>
      {main ? <img src={main} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        : <span className="absolute inset-0 flex items-center justify-center text-ink-subtle"><Sprout size={32} strokeWidth={1.5} aria-hidden="true" /></span>}
      {t.future_url ? <span className="absolute left-2 top-2 rounded-chip bg-surface px-1.5 py-0.5 text-label font-medium text-ink-muted shadow-raised">Minh họa</span> : null}
      {inset && t.future_url && t.photo_url ? (
        <img src={t.photo_url} alt="Phôi gốc" loading="lazy" className="absolute bottom-2 left-2 h-11 w-11 rounded-full border-2 border-surface object-cover shadow-raised" />
      ) : null}
    </div>
  );
}

/** Thẻ cây dạng ảnh (vườn, trang chủ): ảnh lớn, tên, giai đoạn, việc tiếp theo, nhắc chụp nhật ký. */
export function TreePhotoCard({ t, compact = false }: { t: GardenTree; compact?: boolean }) {
  const d = destination(t);
  const overdue = photoOverdue(t);
  return (
    <Link to={d.to} className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface text-ink no-underline shadow-card transition-colors duration-fast hover:border-line-strong hover:text-ink">
      <div className="relative">
        <TreeImage t={t} className={compact ? 'aspect-square' : 'aspect-[4/5]'} />
        {d.badge ? <span className="absolute right-2 top-2 rounded-chip bg-warn-soft px-1.5 py-0.5 text-label font-semibold text-warn-ink">{d.badge}</span> : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <span className="truncate font-semibold">{treeName(t)}</span>
        {!compact ? <span className="text-label text-ink-muted [overflow-wrap:anywhere]">{d.status}</span> : null}
        {t.job_status === 'done' ? <StageBar done={t.stages_done} className="mt-0.5" /> : null}
        {!compact && t.next_task_vi ? <span className="line-clamp-2 text-label [overflow-wrap:anywhere]">Tiếp theo: {t.next_task_vi}</span> : null}
        {!compact && !t.next_task_vi && d.cta ? <span className="text-label font-medium text-primary">{d.cta}</span> : null}
        {overdue !== null ? (
          <span className="mt-auto inline-flex items-center gap-1 pt-1 text-label font-medium text-warn-ink"><Camera size={13} aria-hidden="true" />{overdue} ngày chưa chụp</span>
        ) : null}
      </div>
    </Link>
  );
}
