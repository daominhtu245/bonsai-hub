import { useEffect, useState } from 'react';
import { MessageCircle, Phone, Star } from 'lucide-react';
import { ReportButton } from '@/components/ReportButton';
import { Link, useParams } from 'react-router-dom';
import { ButtonLink, Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { expertApi, type Person } from '@/lib/expert';
import { vnd, zaloUrl } from '@/lib/market';
import { useFeatures } from '@/lib/features';

const ROLE_VI = { nursery: 'Nhà vườn', artisan: 'Nghệ nhân', admin: 'Bonsai AI', player: '' } as const;

/** C3, D2 — Trang công khai nhà vườn / nghệ nhân: giới thiệu, tin đang bán, liên hệ, hỏi / gửi chăm hộ. */
export default function PersonPage() {
  const { slug = '' } = useParams();
  const [p, setP] = useState<Person | null>(null);
  const [error, setError] = useState<string | null>(null);
  const on = useFeatures();
  useEffect(() => { expertApi.person(slug).then(setP).catch((e: ApiError) => setError(e.message)); }, [slug]);
  if (error) return <div className="mx-auto max-w-content px-gutter py-6"><Notice tone="danger">{error}</Notice></div>;
  if (!p) return <div className="mx-auto max-w-content px-gutter py-6"><Skeleton className="h-60 rounded-card" /></div>;
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col gap-4 px-gutter py-5">
      <header>
        <div className="eyebrow">{ROLE_VI[p.role]}</div>
        <h1 className="m-0 mt-1 text-[22px] font-semibold">{p.name}</h1>
        <p className="m-0 text-caption text-ink-muted">
          {[p.province_vi, p.answered ? `${p.answered} lần góp ý` : null].filter(Boolean).join(' · ')}
          {p.rating ? <span className="ml-1 inline-flex items-center gap-0.5"><Star size={12} aria-hidden="true" />{p.rating}</span> : null}
        </p>
      </header>
      {p.specialties.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">{p.specialties.map((t) => <li key={t} className="rounded-chip bg-surface-2 px-2.5 py-1 text-label">{t}</li>)}</ul>
      ) : null}
      {p.bio ? <p className="m-0 whitespace-pre-line text-body">{p.bio}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        {p.role === 'artisan' && on('consults') ? <ButtonLink to={`/hoi-nghe-nhan/moi?nghe-nhan=${p.slug}`}>Hỏi nghệ nhân</ButtonLink> : null}
        {p.role === 'nursery' && on('care') ? <ButtonLink to={`/cham-ho/moi?vuon=${p.slug}`}>Gửi chăm hộ</ButtonLink> : null}
        {p.contact_phone ? (
          <a href={zaloUrl(p.contact_phone)} target="_blank" rel="noreferrer"
            className="flex min-h-cta items-center justify-center gap-2 rounded-btn border border-line-strong font-semibold text-ink no-underline">
            <MessageCircle size={18} aria-hidden="true" />Zalo
          </a>
        ) : null}
        {p.contact_phone ? (
          <a href={`tel:${p.contact_phone}`} className="flex min-h-cta items-center justify-center gap-2 rounded-btn border border-line-strong font-semibold text-ink no-underline">
            <Phone size={18} aria-hidden="true" />Gọi
          </a>
        ) : null}
      </div>
      {p.listings?.length ? (
        <section aria-labelledby="ls">
          <h2 id="ls" className="eyebrow mb-2">Đang bán</h2>
          <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
            {p.listings.map((x) => (
              <li key={x.code}>
                <Link to={`/tin/${x.code}`} className="flex flex-col overflow-hidden rounded-card border border-line bg-surface text-ink no-underline shadow-card">
                  {x.photo_url ? <img src={x.photo_url} alt="" className="aspect-square w-full object-cover" loading="lazy" /> : <span className="aspect-square bg-surface-2" />}
                  <span className="truncate px-2 pt-1.5 text-caption font-medium">{x.title}</span>
                  <span className="tabular px-2 pb-2 text-caption">{vnd(x.price_vnd)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="px-gutter pb-6"><ReportButton kind="profile" target={p.slug} /></div>
    </div>
  );
}
