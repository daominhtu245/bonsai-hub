import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { communityApi, type ChallengeSummary } from '@/lib/community';
import { cx } from '@/lib/cx';

export const dmy = (iso: string) => new Date(iso).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });

/** B4 — Thử thách phôi hằng tháng: danh sách. */
export default function ChallengesPage() {
  const [rows, setRows] = useState<ChallengeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { communityApi.challenges().then(setRows).catch((e: ApiError) => setError(e.message)); }, []);
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/tien-ich" title="Thử thách phôi" />
      <div className="flex flex-col gap-3 px-gutter py-4">
        {error ? <Notice tone="danger">{error}</Notice> : rows === null ? <Skeleton className="h-40 rounded-card" /> : rows.length === 0 ? (
          <Notice tone="info">Chưa có thử thách nào. Quay lại vào đầu tháng nhé.</Notice>
        ) : rows.map((c) => (
          <Link key={c.id} to={`/thu-thach/${c.id}`} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 text-ink no-underline shadow-card hover:bg-surface-2">
            {c.photo_url ? <img src={c.photo_url} alt="" className="h-20 w-20 flex-none rounded-img object-cover" /> : <span className="h-20 w-20 flex-none rounded-img bg-surface-2" />}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-body font-medium">{c.title}</span>
              <span className="text-caption text-ink-muted">{c.entries} bài · {c.state === 'open' ? `đến ${dmy(c.ends_at)}` : 'đã kết thúc'}</span>
              {c.prize ? <span className="text-label text-ink-subtle">Giải: {c.prize}</span> : null}
            </span>
            <span className={cx('rounded-chip px-2 py-0.5 text-label font-semibold', c.state === 'open' ? 'bg-primary-soft text-primary-ink' : 'bg-surface-2 text-ink-muted')}>
              {c.state === 'open' ? 'Đang mở' : 'Kết quả'}
            </span>
            <ChevronRight size={18} className="text-ink-subtle" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}
