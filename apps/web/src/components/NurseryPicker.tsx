import { useEffect, useState } from 'react';
import { ChevronRight, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar } from '@/components/Avatar';
import { Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { expertApi, type NurseryRow } from '@/lib/expert';

/** Danh bạ nhà vườn có trang công khai; ưu tiên cùng tỉnh. `to(slug)`: bấm vào đi đâu. */
export function NurseryPicker({ to }: { to: (slug: string) => string }) {
  const { user } = useAuth();
  const province = user.status === 'ready' ? user.data.province ?? undefined : undefined;
  const [rows, setRows] = useState<NurseryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { // cùng tỉnh lên trước
    expertApi.nurseries().then((all) => setRows(province ? [...all.filter((r) => r.province === province), ...all.filter((r) => r.province !== province)] : all))
      .catch((e: ApiError) => setError(e.message));
  }, [province]);
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (rows === null) return <Skeleton className="h-40 rounded-card" />;
  if (!rows.length) return <Notice tone="info">Chưa có nhà vườn mở trang. Quay lại sau nhé.</Notice>;
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((n) => (
        <li key={n.slug}>
          <Link to={to(n.slug)} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 text-ink no-underline shadow-card hover:bg-surface-2">
            <Avatar name={n.name} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-body font-semibold">{n.name}</span>
              <span className="text-label text-ink-muted">{[n.province_vi, n.specialties.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</span>
              {n.listings ? <span className="inline-flex items-center gap-1 text-label font-medium text-clay"><Store size={12} aria-hidden="true" />{n.listings} tin đang bán</span> : null}
            </span>
            <ChevronRight size={18} className="text-ink-subtle" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
