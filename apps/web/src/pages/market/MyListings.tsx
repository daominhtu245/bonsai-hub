import { useCallback, useEffect, useState } from 'react';
import { ImagePlus, Sparkles, Trash2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Button, ButtonLink, ChoiceChips, Notice, Skeleton } from '@/components/ui';
import { ApiError, uploadPhoto } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cx } from '@/lib/cx';
import { jobsApi, type Species } from '@/lib/jobs';
import { KIND_VI, marketApi, type Listing, type ListingInput, type ListingKind, type MyListings, type PriceRow } from '@/lib/market';
import { toolsApi, type Province } from '@/lib/tools';
import { ListingCard, ListingTile } from './ListingCard';

const input = 'min-h-touch w-full rounded-btn border border-line-strong bg-surface px-3 text-body';
const STATUS_VI = { active: 'Đang hiện', sold: 'Đã bán', hidden: 'Đã ẩn' } as const;

function NewListing({ onCreated }: { onCreated: (x: Listing) => void }) {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const me = user.status === 'ready' ? user.data : null;
  const [species, setSpecies] = useState<Species[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [v, setV] = useState({ title: params.get('title') ?? '', kind: 'phoi' as ListingKind, species_key: params.get('species') ?? '', price: '', trunk: '', height: '',
    province: '', phone: '', description: '' });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [ref, setRef] = useState<PriceRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jobId = params.get('job') ?? undefined;
  const treeId = params.get('tree') ?? undefined;
  useEffect(() => {
    jobsApi.species().then(setSpecies).catch(() => null);
    toolsApi.provinces().then(setProvinces).catch(() => null);
  }, []);
  useEffect(() => { if (me) setV((s) => ({ ...s, phone: s.phone || me.phone || '', province: s.province || me.province || '' })); }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // giá tham khảo theo loài (chỉ số giá thị trường)
    setRef(null);
    if (v.species_key) marketApi.priceIndex(v.species_key).then((rows) => setRef(rows.find((r) => r.region === null) ?? null)).catch(() => null);
  }, [v.species_key]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  // giá: "3.000.000" / "3,000,000" → bỏ mọi dấu; số đo: "10,5" → 10.5
  const money = (s: string) => (s.replace(/\D/g, '') ? Number(s.replace(/\D/g, '')) : undefined);
  const size = (s: string) => { const n = Number(s.replace(',', '.').replace(/[^\d.]/g, '')); return s.trim() && Number.isFinite(n) && n > 0 ? n : undefined; };
  const price = money(v.price);
  const trunk = size(v.trunk);
  const sp = species.find((x) => x.key === v.species_key);
  const draft: Listing = {
    id: 'draft', code: '', url: '', title: v.title || 'Tên tin', description: null, species_key: v.species_key || null, species_vi: sp?.name_vi ?? null,
    kind: v.kind, price_vnd: price ?? null, height_cm: size(v.height) ?? null, trunk_cm: trunk ?? null, province: v.province || null,
    province_vi: provinces.find((p) => p.code === v.province)?.name ?? null, contact_phone: null, status: 'active', featured: false,
    photo_url: preview, views: 0, seller: '', seller_slug: null, created_at: '',
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: ListingInput = {
        title: v.title.trim(), kind: v.kind, species_key: v.species_key || undefined, price_vnd: price, trunk_cm: trunk, height_cm: size(v.height),
        province: v.province || undefined, contact_phone: v.phone.trim() || undefined, description: v.description.trim() || undefined,
        job_id: jobId, tree_id: treeId, photo_key: file ? await uploadPhoto(file) : undefined,
      };
      onCreated(await marketApi.create(body));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-card">
      <label className="relative flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-card border border-dashed border-line-strong bg-surface-2 text-caption font-medium text-ink-muted">
        {preview ? <img src={preview} alt="Ảnh tin đăng" className="absolute inset-0 h-full w-full object-cover" /> : (
          <><ImagePlus size={30} aria-hidden="true" />{treeId || jobId ? 'Dùng ảnh phôi · chạm để đổi' : 'Thêm ảnh cây'}</>
        )}
        <input type="file" accept="image/*" className="sr-only" aria-label="Ảnh tin đăng"
          onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f) setPreview(URL.createObjectURL(f)); }} />
      </label>
      {jobId ? <span className="-mt-2 inline-flex items-center gap-1 text-label font-medium text-primary"><Sparkles size={14} aria-hidden="true" />Tin kèm dáng tương lai của cây này</span> : null}
      <label className="flex flex-col gap-1 text-caption font-medium">Tiêu đề<input required minLength={3} maxLength={160} value={v.title} onChange={set('title')} placeholder="Vd. Phôi si chân to, rễ đẹp" className={input} /></label>
      <ChoiceChips<ListingKind> label="Loại" value={v.kind} onChange={(k) => setV({ ...v, kind: k })} options={Object.entries(KIND_VI) as Array<[ListingKind, string]>} />
      {species.length ? (
        <ChoiceChips<string> label="Loài" value={v.species_key} onChange={(k) => setV({ ...v, species_key: k })} options={species.map((s) => [s.key, s.name_vi] as [string, string])} />
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 flex flex-col gap-1 text-caption font-medium">Giá
          <span className="flex items-center rounded-btn border border-line-strong bg-surface pr-3">
            <input inputMode="numeric" value={v.price} onChange={(e) => { const n = money(e.target.value); setV({ ...v, price: n ? n.toLocaleString('vi-VN') : '' }); }}
              placeholder="Để trống = liên hệ" aria-label="Giá (đ)" className="min-h-touch min-w-0 flex-1 bg-transparent px-3 text-body tabular" />
            <span className="text-ink-muted">đ</span>
          </span>
          {ref && trunk ? (
            <span className="text-label font-normal text-ink-muted">Thị trường: {Math.round(ref.per_cm_low * trunk / 1000).toLocaleString('vi-VN')}k – {Math.round(ref.per_cm_high * trunk / 1000).toLocaleString('vi-VN')}k cho gốc {trunk} cm</span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium">Gốc (cm)<input inputMode="decimal" value={v.trunk} onChange={set('trunk')} className={input} /></label>
        <label className="flex flex-col gap-1 text-caption font-medium">Cao (cm)<input inputMode="decimal" value={v.height} onChange={set('height')} className={input} /></label>
        <label className="flex flex-col gap-1 text-caption font-medium">Tỉnh, thành
          <select value={v.province} onChange={set('province')} className={input}><option value="">—</option>{provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium">Điện thoại / Zalo<input inputMode="tel" value={v.phone} onChange={set('phone')} className={input} /></label>
      </div>
      <label className="flex flex-col gap-1 text-caption font-medium">Mô tả<textarea rows={3} maxLength={3000} value={v.description} onChange={set('description')} placeholder="Tuổi phôi, rễ, tình trạng…" className={cx(input, 'py-2')} /></label>
      <section aria-label="Xem trước" className="flex flex-col gap-2">
        <span className="eyebrow">Xem trước trên chợ</span>
        <div className="pointer-events-none w-1/2"><ListingTile x={draft} /></div>
      </section>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button type="submit" loading={busy} loadingLabel="Đang đăng…">Đăng tin</Button>
    </form>
  );
}

/** C1, C3 — Tin của tôi: đăng, ẩn / đã bán, nổi bật (gói Nhà vườn tháng), xóa. */
export default function MyListingsPage() {
  const [params] = useSearchParams();
  const [data, setData] = useState<MyListings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(params.has('job') || params.has('tree') || params.has('moi'));
  const load = useCallback(() => marketApi.mine().then(setData).catch((e: ApiError) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const act = (p: Promise<unknown>) => { setError(null); p.then(load).catch((e: ApiError) => setError(e.message)); };
  const active = data?.items.filter((x) => x.status === 'active').length ?? 0;
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/cho" title="Tin của tôi" />
      <div className="flex flex-col gap-3 px-gutter py-3">
        {data ? (
          <div className="flex items-center justify-between gap-2 text-caption">
            <span className="text-ink-muted">{data.plan_until ? `Gói Nhà vườn tháng đến ${new Date(data.plan_until).toLocaleDateString('vi-VN')}` : `Đang hiện ${active}/${data.free_active} tin miễn phí`}</span>
            {data.plan_until ? null : <Link to="/mua-luot" className="font-medium">Gói tháng</Link>}
          </div>
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {creating ? <NewListing onCreated={() => { setCreating(false); load(); }} /> : <Button onClick={() => setCreating(true)}>Đăng tin mới</Button>}
        {!data ? <Skeleton className="h-40 rounded-card" /> : data.items.length === 0 ? null : (
          <ul className="m-0 list-none divide-y divide-line overflow-hidden rounded-card border border-line bg-surface p-0 shadow-card">
            {data.items.map((x) => (
              <li key={x.id}>
                <ListingCard x={x} />
                <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
                  <select aria-label={`Trạng thái tin ${x.title}`} value={x.status} onChange={(e) => act(marketApi.patch(x.id, { status: e.target.value as Listing['status'] }))}
                    className="min-h-touch rounded-btn border border-line-strong bg-surface px-2 text-caption">
                    {Object.entries(STATUS_VI).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                  {data.plan_until && x.status === 'active' ? (
                    <label className="flex min-h-touch items-center gap-2 text-caption">
                      <input type="checkbox" role="switch" className="switch" checked={x.featured} onChange={(e) => act(marketApi.patch(x.id, { featured: e.target.checked }))} />Nổi bật
                    </label>
                  ) : null}
                  <ButtonLink to={`/tin/${x.code}/the`} variant="secondary" size="touch" block={false}>Thẻ QR</ButtonLink>
                  <button type="button" aria-label={`Xóa tin ${x.title}`} onClick={() => window.confirm('Xóa tin này?') && act(marketApi.remove(x.id))}
                    className="ml-auto flex h-touch w-touch items-center justify-center text-ink-muted hover:text-danger"><Trash2 size={18} aria-hidden="true" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
