import { useEffect, useState } from 'react';
import { ChevronRight, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { ButtonLink, Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { expertApi, type Person } from '@/lib/expert';

/** D1, D2 — Danh sách nghệ nhân (đã xác minh = vai trò nghệ nhân do quản trị gán). */
export default function ArtisansPage() {
  const [rows, setRows] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { expertApi.artisans().then(setRows).catch((e: ApiError) => setError(e.message)); }, []);
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/tien-ich" title="Hỏi nghệ nhân" />
      <div className="flex flex-col gap-3 px-gutter py-3">
        <ButtonLink to="/hoi-nghe-nhan" variant="secondary">Câu hỏi của tôi</ButtonLink>
        {error ? <Notice tone="danger">{error}</Notice> : rows === null ? <Skeleton className="h-40 rounded-card" /> : rows.length === 0 ? (
          <Notice tone="info">Chưa có nghệ nhân mở trang.</Notice>
        ) : (
          <ul className="m-0 list-none divide-y divide-line overflow-hidden rounded-card border border-line bg-surface p-0 shadow-card">
            {rows.map((p) => (
              <li key={p.slug}>
                <Link to={`/nguoi/${p.slug}`} className="flex min-h-[64px] items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-surface-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body font-medium">{p.name}</span>
                    <span className="truncate text-caption text-ink-muted">{[p.specialties.join(', '), p.province_vi].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="flex flex-col items-end text-label text-ink-muted">
                    {p.rating ? <span className="inline-flex items-center gap-0.5"><Star size={12} aria-hidden="true" />{p.rating}</span> : null}
                    <span>{p.answered} trả lời</span>
                  </span>
                  <ChevronRight size={18} className="text-ink-subtle" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
