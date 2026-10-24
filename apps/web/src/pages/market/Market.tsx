import { useEffect, useState } from 'react';
import { BackHeader } from '@/components/BackHeader';
import { ButtonLink, Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { jobsApi, type Species } from '@/lib/jobs';
import { KIND_VI, marketApi, type Listing, type ListingKind } from '@/lib/market';
import { toolsApi, type Province } from '@/lib/tools';
import { ListingCard } from './ListingCard';

const sel = 'min-h-touch min-w-0 flex-1 rounded-btn border border-line-strong bg-surface px-2 text-caption';

/** C1, C4 — Chợ phôi / cây: lọc theo loài, tỉnh, loại; tin nổi bật lên đầu. Không giữ tiền: liên hệ người bán. */
export default function MarketPage() {
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [species, setSpecies] = useState<Species[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [f, setF] = useState<{ species?: string; province?: string; kind?: ListingKind; q?: string }>({});
  const [q, setQ] = useState('');
  useEffect(() => {
    jobsApi.species().then(setSpecies).catch(() => null);
    toolsApi.provinces().then(setProvinces).catch(() => null);
  }, []);
  useEffect(() => {
    setRows(null);
    marketApi.browse(f).then(setRows).catch((e: ApiError) => setError(e.message));
  }, [f]);
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/tien-ich" title="Chợ phôi" />
      <div className="flex flex-col gap-3 px-gutter py-3">
        <form onSubmit={(e) => { e.preventDefault(); setF({ ...f, q: q.trim() || undefined }); }} className="flex gap-2">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm phôi, cây…" aria-label="Tìm"
            className="min-h-touch min-w-0 flex-1 rounded-btn border border-line-strong bg-surface px-3 text-body" />
        </form>
        <div className="flex gap-2">
          <select aria-label="Loài" className={sel} value={f.species ?? ''} onChange={(e) => setF({ ...f, species: e.target.value || undefined })}>
            <option value="">Mọi loài</option>{species.map((s) => <option key={s.key} value={s.key}>{s.name_vi}</option>)}
          </select>
          <select aria-label="Tỉnh, thành" className={sel} value={f.province ?? ''} onChange={(e) => setF({ ...f, province: e.target.value || undefined })}>
            <option value="">Mọi nơi</option>{provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
          <select aria-label="Loại" className={sel} value={f.kind ?? ''} onChange={(e) => setF({ ...f, kind: (e.target.value || undefined) as ListingKind | undefined })}>
            <option value="">Tất cả</option>{(Object.keys(KIND_VI) as ListingKind[]).map((k) => <option key={k} value={k}>{KIND_VI[k]}</option>)}
          </select>
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : rows === null ? <Skeleton className="h-60 rounded-card" /> : rows.length === 0 ? (
          <Notice tone="info">Chưa có tin phù hợp.</Notice>
        ) : (
          <ul className="m-0 list-none divide-y divide-line overflow-hidden rounded-card border border-line bg-surface p-0 shadow-card">
            {rows.map((x) => <li key={x.id}><ListingCard x={x} /></li>)}
          </ul>
        )}
        <ButtonLink to="/tin-cua-toi" variant="secondary">Đăng tin bán</ButtonLink>
      </div>
    </div>
  );
}
