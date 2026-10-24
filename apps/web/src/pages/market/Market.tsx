import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { ButtonLink, ChoiceChips, Notice, PhotoHero, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { jobsApi, type Species } from '@/lib/jobs';
import { KIND_VI, marketApi, type Listing, type ListingKind } from '@/lib/market';
import { toolsApi, type Province } from '@/lib/tools';
import { ListingTile } from './ListingCard';

const pill = 'min-h-touch min-w-0 flex-1 rounded-full border border-line bg-surface px-3 text-caption text-ink';

/** C1, C4 — Chợ phôi: lưới ảnh, lọc nhanh theo loại / loài / nơi; tin nổi bật lên đầu. Không giữ tiền: liên hệ người bán. */
export default function MarketPage() {
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [species, setSpecies] = useState<Species[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [params] = useSearchParams();
  const [f, setF] = useState<{ species?: string; province?: string; kind?: ListingKind; q?: string }>(() => ({ species: params.get('species') ?? undefined }));
  const [q, setQ] = useState('');
  useEffect(() => {
    jobsApi.species().then(setSpecies).catch(() => null);
    toolsApi.provinces().then(setProvinces).catch(() => null);
  }, []);
  useEffect(() => {
    setRows(null);
    marketApi.browse(f).then(setRows).catch((e: ApiError) => setError(e.message));
  }, [f]);
  const filtered = Boolean(f.species || f.province || f.kind || f.q);
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/tien-ich" title="Chợ phôi" />
      <div className="flex flex-col gap-3 px-gutter pb-28 pt-3">
        <form onSubmit={(e) => { e.preventDefault(); setF({ ...f, q: q.trim() || undefined }); }}
          className="flex min-h-cta items-center gap-2 rounded-full border border-line-strong bg-surface px-4 shadow-card">
          <Search size={18} className="text-ink-subtle" aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm phôi, cây…" aria-label="Tìm"
            className="min-h-touch min-w-0 flex-1 bg-transparent text-body outline-none" />
        </form>
        <ChoiceChips<'' | ListingKind> label="Loại" value={f.kind ?? ''} onChange={(k) => setF({ ...f, kind: k || undefined })}
          options={[['', 'Tất cả'], ...(Object.entries(KIND_VI) as Array<[ListingKind, string]>)]} />
        <div className="flex gap-2">
          <select aria-label="Loài" className={pill} value={f.species ?? ''} onChange={(e) => setF({ ...f, species: e.target.value || undefined })}>
            <option value="">Mọi loài</option>{species.map((s) => <option key={s.key} value={s.key}>{s.name_vi}</option>)}
          </select>
          <select aria-label="Tỉnh, thành" className={pill} value={f.province ?? ''} onChange={(e) => setF({ ...f, province: e.target.value || undefined })}>
            <option value="">Mọi nơi</option>{provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : rows === null ? (
          <div className="grid grid-cols-2 gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[3/4] rounded-card" />)}</div>
        ) : rows.length === 0 ? (
          filtered ? <Notice tone="info">Chưa có tin phù hợp. Thử bỏ bớt bộ lọc.</Notice> : (
            <PhotoHero src="/images/pine.webp" title="Chợ phôi đang chờ tin đầu tiên" sub="Đăng phôi kèm dáng tương lai do AI vẽ — người mua thấy ngay cây sẽ đẹp thế nào." ratio="4 / 5">
              <ButtonLink to="/tin-cua-toi?moi=1" block={false}>Đăng tin đầu tiên</ButtonLink>
            </PhotoHero>
          )
        ) : (
          <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
            {rows.map((x) => <li key={x.id}><ListingTile x={x} /></li>)}
          </ul>
        )}
      </div>
      <Link to="/tin-cua-toi?moi=1" className="fixed bottom-6 right-1/2 z-10 flex min-h-cta translate-x-1/2 items-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-on no-underline shadow-raised">
        <Plus size={20} aria-hidden="true" />Đăng tin bán
      </Link>
    </div>
  );
}
