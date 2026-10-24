import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { communityApi, type PublicPassport } from '@/lib/community';

const day = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

/** F1 — Trang sổ cây công khai (mở từ mã QR): ảnh, lịch sử tạo dáng, số lần đổi chủ, cảnh báo nếu báo mất. */
export default function PassportPublicPage() {
  const { code = '' } = useParams();
  const [p, setP] = useState<PublicPassport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { communityApi.publicPassport(code).then(setP).catch((e: ApiError) => setError(e.message)); }, [code]);
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col px-gutter py-5">
      {error ? <Notice tone="danger">{error}</Notice> : !p ? <Skeleton className="aspect-[3/4] rounded-card" /> : (
        <article className="flex flex-col gap-4">
          {p.stolen ? (
            <Notice tone="danger"><span className="inline-flex items-start gap-2"><ShieldAlert size={18} className="mt-0.5 flex-none" aria-hidden="true" />
              Cây này đã được chủ báo mất ngày {day(p.stolen_at!)}. Nếu bạn đang được chào bán cây này, hãy liên hệ Bonsai AI.</span></Notice>
          ) : null}
          <header>
            <div className="eyebrow">Sổ cây · {p.code}</div>
            <h1 className="m-0 mt-1 text-[22px] font-semibold">{p.nickname || p.species_vi || 'Cây bonsai'}</h1>
            <p className="m-0 text-caption text-ink-muted">
              {[p.species_vi, `vào sổ ${day(p.since)}`, p.owner && `Vườn ${p.owner}`, p.transfers ? `đã đổi chủ ${p.transfers} lần` : null].filter(Boolean).join(' · ')}
            </p>
          </header>
          {p.photo_url ? <img src={p.photo_url} alt="Ảnh cây lúc vào sổ" className="w-full rounded-card border border-line object-contain" /> : null}
          {p.timeline.length ? (
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {p.timeline.map((t, i) => (
                <li key={i} className="flex gap-3 rounded-card border border-line bg-surface p-2 shadow-card">
                  {t.url ? <img src={t.url} alt="" className="h-20 w-20 flex-none rounded-img object-cover" loading="lazy" /> : null}
                  <span className="flex flex-col justify-center text-caption">
                    <span className="font-medium">{t.kind === 'design' ? `Thiết kế thế ${t.style_vi ?? ''}` : 'Ảnh cây thật'}</span>
                    <span className="text-ink-muted">{day(t.at)}{t.kind === 'design' ? ' · Minh họa' : ''}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
          <footer className="text-label text-ink-subtle">Bonsai AI</footer>
        </article>
      )}
    </div>
  );
}
