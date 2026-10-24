import { useEffect, useState } from 'react';
import { ChevronLeft, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button, Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { marketApi, vnd, type Listing } from '@/lib/market';

/** C2 — Thẻ QR treo chậu: 4 thẻ / trang A4, cắt rời. Quét ra trang tin (dáng tương lai, giá, liên hệ). */
export default function ListingTagPage() {
  const { code = '' } = useParams();
  const [x, setX] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { marketApi.get(code).then(setX).catch((e: ApiError) => setError(e.message)); }, [code]);
  return (
    <div className="print-page theme-light mx-auto max-w-[820px] bg-surface px-gutter py-4 text-ink">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link to={`/tin/${code}`} className="inline-flex min-h-touch items-center gap-1 text-caption text-ink-muted no-underline"><ChevronLeft size={16} />Quay lại</Link>
        <Button size="touch" block={false} onClick={() => window.print()} disabled={!x}><Printer size={18} aria-hidden="true" />In thẻ</Button>
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : !x ? <Skeleton className="h-96 rounded-card" /> : (
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="print-block flex flex-col items-center gap-2 rounded-card border border-dashed border-line-strong p-4 text-center">
              <img src={marketApi.qrUrl(x.code)} alt={i === 0 ? `Mã QR tin ${x.code}` : ''} className="h-36 w-36" />
              <div className="text-[17px] font-semibold leading-tight">{x.title}</div>
              <div className="tabular text-[17px] font-semibold">{vnd(x.price_vnd)}</div>
              <div className="text-[13px] text-ink-muted">{[x.seller, x.contact_phone].filter(Boolean).join(' · ')}</div>
              <div className="text-[12px] text-ink-subtle">Quét để xem dáng tương lai</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
