import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { EmptyState, Notice, Skeleton } from '@/components/ui';
import { accountApi, type CreditRow } from '@/lib/account';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';

/** Lịch sử lượt: mua, dùng, hoàn, tặng — mỗi dòng một thay đổi. */
export default function CreditHistory() {
  const [rows, setRows] = useState<CreditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    accountApi.credits().then(setRows).catch((e: ApiError) => setError(e.message));
  }, []);
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/tai-khoan" title="Lịch sử lượt" />
      <main className="px-gutter py-4">
        {error ? <Notice tone="danger">{error}</Notice> : rows === null ? <Skeleton className="h-48 rounded-card" /> : rows.length === 0 ? (
          <EmptyState title="Chưa có thay đổi nào" />
        ) : (
          <ul className="m-0 list-none divide-y divide-line overflow-hidden rounded-card border border-line bg-surface p-0 shadow-card">
            {rows.map((r, i) => (
              <li key={i} className="flex min-h-[60px] items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-caption font-medium">
                    {r.job_id ? <Link to={`/ket-qua/${r.job_id}`} className="text-ink">{r.label}</Link> : r.label}
                  </div>
                  <div className="text-label text-ink-subtle">{new Date(r.at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</div>
                </div>
                <span className={cx('tabular text-body font-semibold', r.delta > 0 ? 'text-primary' : 'text-ink-muted')}>{r.delta > 0 ? '+' : ''}{r.delta}</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
