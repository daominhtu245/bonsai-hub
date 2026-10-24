import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { marketApi, type PartnerPot } from '@/lib/market';
import { toolsApi, type GraftSpot, type Price, type WirePlan } from '@/lib/tools';

const vnd = (n: number) => `${n.toLocaleString('vi-VN')} đ`;

function Fold({ title, onOpen, children }: { title: string; onOpen: () => void; children: React.ReactNode }) {
  return (
    <details className="group rounded-card border border-line bg-surface shadow-card" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && onOpen()}>
      <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between px-4 text-body font-medium">
        {title}<ChevronDown size={18} className="text-ink-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="px-4 pb-4 text-caption">{children}</div>
    </details>
  );
}

/** Công cụ cho cây này (màn Kết quả): tính dây uốn, gợi ý ghép cành, định giá — tải khi mở. */
export function TreeTools({ jobId }: { jobId: string }) {
  const [wire, setWire] = useState<WirePlan | null | undefined>(undefined);
  const [graft, setGraft] = useState<{ spots: GraftSpot[]; season_vi: string | null } | null | undefined>(undefined);
  const [price, setPrice] = useState<Price | null | undefined>(undefined);
  const [pots, setPots] = useState<PartnerPot[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: ApiError) => setError(e.message);
  return (
    <section aria-label="Công cụ cho cây này" className="mx-gutter mt-4 flex flex-col gap-2">
      {error ? <p className="m-0 text-label text-danger">{error}</p> : null}
      <Fold title="Tính dây uốn" onOpen={() => wire === undefined && toolsApi.wire(jobId).then(setWire).catch(fail)}>
        {wire === undefined ? <Skeleton className="h-24" /> : wire ? (
          <div className="flex flex-col gap-3">
            <div>
              <div className="mb-1 font-semibold">Cần mua (dây nhôm)</div>
              <ul className="m-0 flex flex-wrap gap-2 p-0">
                {wire.shopping.map(([g, m]) => <li key={g} className="list-none rounded-chip bg-surface-2 px-3 py-1 tabular">{g} mm · {m} m</li>)}
              </ul>
            </div>
            <table className="w-full text-left tabular">
              <thead><tr className="text-ink-muted"><th className="font-medium">Cành</th><th className="font-medium">Cỡ dây</th><th className="font-medium">Dài</th></tr></thead>
              <tbody>{wire.lines.map((l) => <tr key={l.branch}><td>{l.label_vi}</td><td>{l.gauge_mm} mm</td><td>{l.length_cm} cm</td></tr>)}</tbody>
            </table>
            <p className="m-0 text-ink-subtle">{wire.copper_note}{wire.scale_known ? '' : ' Chưa có chiều cao thật nên ước theo gốc 3 cm.'}</p>
          </div>
        ) : null}
      </Fold>
      <Fold title="Gợi ý ghép cành" onOpen={() => graft === undefined && toolsApi.graft(jobId).then(setGraft).catch(fail)}>
        {graft === undefined ? <Skeleton className="h-16" /> : graft && graft.spots.length ? (
          <div className="flex flex-col gap-2">
            <ul className="m-0 flex flex-col gap-1 pl-5">{graft.spots.map((s, i) => <li key={i}>{s.reason_vi}</li>)}</ul>
            {graft.season_vi ? <span className="text-ink-muted">Thời điểm ghép: {graft.season_vi}</span> : null}
          </div>
        ) : <span className="text-ink-muted">Thân đủ cành, chưa cần ghép.</span>}
      </Fold>
      <Fold title="Định giá phôi" onOpen={() => price === undefined && toolsApi.price(jobId).then(setPrice).catch(fail)}>
        {price === undefined ? <Skeleton className="h-12" /> : price ? (
          <div className="flex flex-col gap-1">
            <span className="text-[20px] font-semibold tabular">{vnd(price.low)} – {vnd(price.high)}</span>
            <span className="text-ink-muted">Gốc ~{price.trunk_cm} cm · {price.basis === 'listings' ? `so ${price.comparables} tin đăng` : 'theo bảng giá tham khảo'}</span>
            <span className="text-ink-subtle">{price.note_vi}</span>
          </div>
        ) : <span className="text-ink-muted">Nhập chiều cao thật của cây để định giá.</span>}
      </Fold>
      <Fold title="Chậu hợp dáng" onOpen={() => pots === undefined && marketApi.pots(jobId).then(setPots).catch(fail)}>
        {pots === undefined ? <Skeleton className="h-16" /> : pots.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {pots.map((p) => (
              <li key={p.id}>
                <a href={p.url ?? undefined} target="_blank" rel="noreferrer sponsored" className="flex min-h-touch items-center gap-3 text-ink no-underline">
                  {p.image_url ? <img src={p.image_url} alt="" className="h-14 w-14 flex-none rounded-img object-cover" loading="lazy" /> : null}
                  <span className="flex flex-col">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-ink-muted">{[p.maker, p.length_cm && `dài ${p.length_cm} cm`, p.price_vnd && vnd(p.price_vnd)].filter(Boolean).join(' · ')}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : <span className="text-ink-muted">Chưa có chậu phù hợp.</span>}
      </Fold>
    </section>
  );
}
