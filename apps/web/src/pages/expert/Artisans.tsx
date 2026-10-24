import { useEffect, useState } from 'react';
import { ChevronRight, MessageSquareText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar, Stars } from '@/components/Avatar';
import { BackHeader } from '@/components/BackHeader';
import { ButtonLink, Notice, PhotoHero, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { expertApi, type Person } from '@/lib/expert';
import { useFeature } from '@/lib/features';

/** D1, D2 — Hỏi nghệ nhân: lời mời + 3 bước, danh sách nghệ nhân (đã xác minh = vai trò do quản trị gán). */
export default function ArtisansPage() {
  const consults = useFeature('consults');
  const [rows, setRows] = useState<Person[] | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    expertApi.artisans().then(setRows).catch((e: ApiError) => setError(e.message));
    if (consults) expertApi.price().then((p) => setPrice(p.credits)).catch(() => null);
  }, [consults]);
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/tien-ich" title="Hỏi nghệ nhân" />
      <div className="flex flex-col gap-4 px-gutter py-3">
        {consults ? (
          <PhotoHero src="/images/pedestal.webp" title="Nhờ nghệ nhân xem dáng cây" ratio="4 / 3">
            <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0 text-label font-medium text-surface">
              {['Chọn cây', 'Đặt câu hỏi', 'Nhận góp ý trong 3 ngày'].map((s, i) => (
                <li key={s} className="flex items-center gap-1 rounded-full border border-surface px-2.5 py-1"><span className="tabular">{i + 1}</span>{s}</li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLink to="/hoi-nghe-nhan/moi" block={false}>Đặt câu hỏi{price ? ` · ${price} lượt` : ''}</ButtonLink>
              <Link to="/hoi-nghe-nhan" className="inline-flex min-h-touch items-center gap-1 text-caption font-medium text-surface"><MessageSquareText size={16} aria-hidden="true" />Câu hỏi của tôi</Link>
            </div>
          </PhotoHero>
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : rows === null ? <Skeleton className="h-40 rounded-card" /> : rows.length === 0 ? (
          <Notice tone="info">Nghệ nhân đang được mời. Bạn vẫn đặt câu hỏi được — nghệ nhân đầu tiên rảnh sẽ trả lời.</Notice>
        ) : (
          <section aria-labelledby="art-h">
            <h2 id="art-h" className="eyebrow mb-2 px-1">Nghệ nhân</h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {rows.map((p) => (
                <li key={p.slug}>
                  <Link to={`/nguoi/${p.slug}`} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 text-ink no-underline shadow-card hover:bg-surface-2">
                    <Avatar name={p.name} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-center gap-2"><span className="truncate text-body font-semibold">{p.name}</span>{p.rating ? <Stars value={p.rating} /> : null}</span>
                      {p.specialties.length ? (
                        <span className="flex flex-wrap gap-1">{p.specialties.slice(0, 3).map((t) => <span key={t} className="rounded-chip bg-surface-2 px-2 py-0.5 text-label">{t}</span>)}</span>
                      ) : null}
                      <span className="text-label text-ink-muted">{[p.province_vi, p.answered ? `${p.answered} lần góp ý` : 'Mới tham gia'].filter(Boolean).join(' · ')}</span>
                    </span>
                    <ChevronRight size={18} className="text-ink-subtle" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
