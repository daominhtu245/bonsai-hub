import { Link } from 'react-router-dom';
import { KIND_VI, vnd, type Listing } from '@/lib/market';

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
