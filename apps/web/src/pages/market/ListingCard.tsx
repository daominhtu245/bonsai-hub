import { MapPin, Sprout } from 'lucide-react';
import { Link } from 'react-router-dom';
import { KIND_VI, vnd, type Listing } from '@/lib/market';

/** Dòng tin (danh sách của tôi). */
export function ListingCard({ x, to }: { x: Listing; to?: string }) {
  return (
    <Link to={to ?? `/tin/${x.code}`} className="flex gap-3 p-3 text-ink no-underline hover:bg-surface-2">
      {x.photo_url ? <img src={x.photo_url} alt="" className="h-20 w-20 flex-none rounded-img object-cover" loading="lazy" /> : <span className="h-20 w-20 flex-none rounded-img bg-surface-2" />}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          {x.featured ? <span className="rounded-chip bg-primary-soft px-1.5 text-label font-semibold text-primary-ink">Nổi bật</span> : null}
          <span className="truncate text-body font-medium">{x.title}</span>
        </span>
        <span className="tabular text-body font-semibold">{vnd(x.price_vnd)}</span>
        <span className="truncate text-label text-ink-muted">{[KIND_VI[x.kind], x.species_vi, x.trunk_cm && `gốc ${x.trunk_cm} cm`, x.province_vi].filter(Boolean).join(' · ')}</span>
      </span>
    </Link>
  );
}

/** Thẻ ảnh lớn cho lưới Chợ phôi. */
export function ListingTile({ x }: { x: Listing }) {
  return (
    <Link to={`/tin/${x.code}`} className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface text-ink no-underline shadow-card">
      <span className="relative block aspect-square bg-photo">
        {x.photo_url ? <img src={x.photo_url} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
          : <span className="absolute inset-0 flex items-center justify-center text-ink-subtle"><Sprout size={32} aria-hidden="true" /></span>}
        <span className="theme-light absolute left-2 top-2 flex gap-1">
          {x.featured ? <span className="rounded-chip bg-primary px-1.5 py-0.5 text-label font-semibold text-primary-on">Nổi bật</span> : null}
          <span className="rounded-chip bg-surface px-1.5 py-0.5 text-label font-medium text-ink shadow-raised">{KIND_VI[x.kind]}</span>
        </span>
      </span>
      <span className="flex flex-1 flex-col gap-0.5 p-2.5">
        <span className="tabular text-body font-semibold text-primary">{vnd(x.price_vnd)}</span>
        <span className="line-clamp-2 text-caption font-medium leading-snug">{x.title}</span>
        <span className="mt-auto flex items-center gap-1 pt-1 text-label text-ink-muted">
          {x.province_vi ? <><MapPin size={12} aria-hidden="true" /><span className="truncate">{x.province_vi}</span></> : x.species_vi}
        </span>
      </span>
    </Link>
  );
}
