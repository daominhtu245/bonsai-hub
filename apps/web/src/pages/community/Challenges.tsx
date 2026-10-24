import { useEffect, useState } from 'react';
import { Clock, Gift, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Notice, PhotoHero, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { communityApi, type ChallengeSummary } from '@/lib/community';
import { cx } from '@/lib/cx';

export const dmy = (iso: string) => new Date(iso).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });
export const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));

/** B4 — Thử thách phôi hằng tháng: thẻ ảnh lớn, đếm ngược, giải. */
export default function ChallengesPage() {
  const [rows, setRows] = useState<ChallengeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { communityApi.challenges().then(setRows).catch((e: ApiError) => setError(e.message)); }, []);
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/tien-ich" title="Thử thách phôi" />
      <div className="flex flex-col gap-3 px-gutter py-3">
        {error ? <Notice tone="danger">{error}</Notice> : rows === null ? <Skeleton className="aspect-[4/3] rounded-card" /> : rows.length === 0 ? (
          <PhotoHero src="/images/juniper.webp" title="Thử thách tháng tới sắp mở" sub="Cùng một phôi, mỗi người một dáng — cộng đồng bình chọn bài đẹp nhất." ratio="4 / 5" />
        ) : rows.map((c) => {
          const open = c.state === 'open';
          return (
            <Link key={c.id} to={`/thu-thach/${c.id}`} className="overflow-hidden rounded-card border border-line bg-surface text-ink no-underline shadow-card">
              <span className="relative block aspect-[16/10] bg-photo">
                {c.photo_url ? <img src={c.photo_url} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" /> : null}
                <span className="theme-light absolute left-2.5 top-2.5 flex gap-1.5">
                  <span className={cx('inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-label font-semibold shadow-raised', open ? 'bg-primary text-primary-on' : 'bg-surface text-ink')}>
                    <Clock size={12} aria-hidden="true" />{open ? `Còn ${daysLeft(c.ends_at)} ngày` : 'Đã có kết quả'}
                  </span>
                </span>
              </span>
              <span className="flex flex-col gap-1 p-3">
                <span className="text-h2">{c.title}</span>
                <span className="flex flex-wrap gap-3 text-label text-ink-muted">
                  <span className="inline-flex items-center gap-1"><Users size={14} aria-hidden="true" />{c.entries} bài</span>
                  <span>{dmy(c.starts_at)} – {dmy(c.ends_at)}</span>
                  {c.prize ? <span className="inline-flex items-center gap-1 font-medium text-clay"><Gift size={14} aria-hidden="true" />{c.prize}</span> : null}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
