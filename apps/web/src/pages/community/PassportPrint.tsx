import { useEffect, useState } from 'react';
import { ChevronLeft, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button, Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { communityApi, type PublicPassport } from '@/lib/community';

const day = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

/** F4 — Tờ hồ sơ cây in làm quà (A4): ảnh, lịch sử tạo dáng, mã QR mở sổ cây. */
export default function PassportPrintPage() {
  const { code = '' } = useParams();
  const [p, setP] = useState<PublicPassport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { communityApi.publicPassport(code).then(setP).catch((e: ApiError) => setError(e.message)); }, [code]);
  return (
    <div className="print-page theme-light mx-auto max-w-[820px] bg-surface px-gutter py-4 text-ink">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link to={`/so-cay/${code}`} className="inline-flex min-h-touch items-center gap-1 text-caption text-ink-muted no-underline"><ChevronLeft size={16} />Quay lại</Link>
        <Button size="touch" block={false} onClick={() => window.print()} disabled={!p}><Printer size={18} aria-hidden="true" />In / Lưu PDF</Button>
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : !p ? <Skeleton className="h-96 rounded-card" /> : (
        <article className="print-block flex flex-col gap-4">
          <header className="flex items-start justify-between gap-4 border-b border-line pb-3">
            <div>
              <div className="eyebrow">Hồ sơ cây · {p.code}</div>
              <h1 className="m-0 mt-1 text-[26px] font-semibold">{p.nickname || p.species_vi || 'Cây bonsai'}</h1>
              <p className="m-0 text-ink-muted">{[p.species_vi, `vào sổ ${day(p.since)}`, p.owner].filter(Boolean).join(' · ')}</p>
            </div>
            <img src={communityApi.qrUrl(p.code)} alt={`Mã QR sổ cây ${p.code}`} className="h-28 w-28 flex-none" />
          </header>
          {p.photo_url ? <img src={p.photo_url} alt="Ảnh cây" className="max-h-[420px] w-full rounded-card object-contain" /> : null}
          {p.timeline.length ? (
            <div className="grid grid-cols-3 gap-3">
              {p.timeline.filter((t) => t.url).slice(-6).map((t, i) => (
                <figure key={i} className="m-0">
                  <img src={t.url!} alt="" className="aspect-square w-full rounded-img border border-line object-cover" />
                  <figcaption className="mt-1 text-center text-[13px] text-ink-muted">{day(t.at)}{t.kind === 'design' ? ' · Minh họa' : ''}</figcaption>
                </figure>
              ))}
            </div>
          ) : null}
          <footer className="text-[13px] text-ink-muted">Quét mã để xem lịch sử cây · Bonsai AI</footer>
        </article>
      )}
    </div>
  );
}
