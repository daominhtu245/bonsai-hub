import { useEffect, useState } from 'react';
import { BackHeader } from '@/components/BackHeader';
import { Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { marketApi, type PriceRow } from '@/lib/market';

const REGION_VI = { north: 'Miền Bắc', central: 'Miền Trung', south: 'Miền Nam' } as const;
const k = (n: number) => `${Math.round(n / 1000).toLocaleString('vi-VN')}k`;

/** C9 — Giá thị trường theo loài (và vùng): giá mỗi cm gốc, từ tin đang bán / đã bán, chỉ công bố khi đủ 5 tin. */
export default function PriceIndexPage() {
  const [rows, setRows] = useState<PriceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { marketApi.priceIndex().then(setRows).catch((e: ApiError) => setError(e.message)); }, []);
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/tien-ich" title="Giá thị trường" />
      <div className="flex flex-col gap-3 px-gutter py-3">
        {error ? <Notice tone="danger">{error}</Notice> : rows === null ? <Skeleton className="h-40 rounded-card" /> : rows.length === 0 ? (
          <Notice tone="info">Chưa đủ tin đăng để tính giá.</Notice>
        ) : (
          <table className="w-full rounded-card border border-line bg-surface text-left text-caption shadow-card">
            <caption className="px-1 pb-2 text-left text-label text-ink-muted">Giá mỗi cm đường kính gốc · khoảng giữa 50% số tin</caption>
            <thead><tr className="border-b border-line text-ink-muted"><th className="px-3 py-2 font-medium">Loài</th><th className="py-2 font-medium">Vùng</th><th className="py-2 text-right font-medium">Giá / cm</th><th className="px-3 py-2 text-right font-medium">Tin</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.species_key}-${r.region ?? 'all'}`} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-medium">{r.region ? '' : r.species_vi}</td>
                  <td className="py-2 text-ink-muted">{r.region ? REGION_VI[r.region] : 'Cả nước'}</td>
                  <td className="tabular py-2 text-right">{k(r.per_cm_low)} – {k(r.per_cm_high)}</td>
                  <td className="tabular px-3 py-2 text-right text-ink-muted">{r.samples}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
