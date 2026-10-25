import { useEffect, useState } from 'react';
import { MessageCircle, Phone, QrCode } from 'lucide-react';
import { ReportButton } from '@/components/ReportButton';
import { Link, useParams } from 'react-router-dom';
import { Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { KIND_VI, marketApi, vnd, zaloUrl, type Listing } from '@/lib/market';

/** C1, C2, C4 — Trang tin công khai (mở từ link hoặc quét thẻ QR treo chậu): ảnh, giá, dáng tương lai, liên hệ. */
export default function ListingPublicPage() {
  const { code = '' } = useParams();
  const [x, setX] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { marketApi.get(code).then(setX).catch((e: ApiError) => setError(e.message)); }, [code]);
  if (error) return <div className="mx-auto max-w-content px-gutter py-6"><Notice tone="danger">{error}</Notice></div>;
  if (!x) return <div className="mx-auto max-w-content px-gutter py-6"><Skeleton className="aspect-[3/4] rounded-card" /></div>;
  const specs: [string, string | null][] = [
    ['Loại', KIND_VI[x.kind]], ['Loài', x.species_vi], ['Gốc', x.trunk_cm ? `${x.trunk_cm} cm` : null],
    ['Cao', x.height_cm ? `${x.height_cm} cm` : null], ['Nơi', x.province_vi],
  ];
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col gap-4 px-gutter py-5">
      {x.status === 'sold' ? <Notice tone="warn">Cây này đã bán.</Notice> : null}
      {x.photo_url ? <img src={x.photo_url} alt={x.title} className="w-full rounded-card border border-line object-contain" /> : null}
      <header>
        <h1 className="m-0 text-[22px] font-semibold">{x.title}</h1>
        <div className="tabular mt-1 text-[22px] font-semibold text-primary">{vnd(x.price_vnd)}</div>
        <div className="text-caption text-ink-muted">{x.seller}</div>
      </header>
      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-1 text-caption">
        {specs.filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex gap-2"><dt className="text-ink-muted">{k}</dt><dd className="m-0 font-medium">{v}</dd></div>)}
      </dl>
      {x.description ? <p className="m-0 whitespace-pre-line text-body">{x.description}</p> : null}
      {x.previews?.length ? (
        <section aria-labelledby="pv">
          <h2 id="pv" className="eyebrow mb-2">Dáng có thể tạo</h2>
          <ul className="-mx-gutter m-0 flex list-none gap-2 overflow-x-auto px-gutter p-0">
            {x.previews.map((p, i) => (
              <li key={i} className="relative w-[58%] flex-none">
                <img src={p.url} alt={`Minh họa dáng ${p.style_vi ?? ''}`} className="aspect-[3/4] w-full rounded-card border border-line bg-photo object-contain" />
                <span className="theme-light absolute left-2 top-2 rounded-chip bg-surface px-2 py-0.5 text-label text-ink-muted shadow-raised">Minh họa</span>
                <span className="mt-1 block text-center text-label text-ink-muted">{p.style_vi}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {x.contact_phone && x.status === 'active' ? (
        <div className="grid grid-cols-2 gap-2">
          <a href={zaloUrl(x.contact_phone)} target="_blank" rel="noreferrer"
            className="flex min-h-cta items-center justify-center gap-2 rounded-btn bg-primary font-semibold text-primary-on no-underline">
            <MessageCircle size={18} aria-hidden="true" />Nhắn Zalo
          </a>
          <a href={`tel:${x.contact_phone}`} className="flex min-h-cta items-center justify-center gap-2 rounded-btn border border-line-strong font-semibold text-ink no-underline">
            <Phone size={18} aria-hidden="true" />Gọi
          </a>
        </div>
      ) : null}
      <p className="m-0 text-label text-ink-subtle">Bonsai AI chỉ kết nối, không nhận tiền thay. Xem cây tận nơi trước khi trả tiền.</p>
      <Link to={`/tin/${x.code}/the`} className="inline-flex min-h-touch items-center gap-1 text-caption text-ink-muted"><QrCode size={16} aria-hidden="true" />In thẻ QR treo chậu</Link>
      <ReportButton kind="listing" target={x.code} />
    </div>
  );
}
