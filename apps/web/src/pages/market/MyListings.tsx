import { useCallback, useEffect, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Button, ButtonLink, Notice, Skeleton } from '@/components/ui';
import { ApiError, uploadPhoto } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cx } from '@/lib/cx';
import { jobsApi, type Species } from '@/lib/jobs';
import { KIND_VI, marketApi, type Listing, type ListingInput, type ListingKind, type MyListings } from '@/lib/market';
import { toolsApi, type Province } from '@/lib/tools';
import { ListingCard } from './ListingCard';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jobId = params.get('job') ?? undefined;
  const treeId = params.get('tree') ?? undefined;
  useEffect(() => {
    jobsApi.species().then(setSpecies).catch(() => null);
    toolsApi.provinces().then(setProvinces).catch(() => null);
  }, []);
  useEffect(() => { if (me) setV((s) => ({ ...s, phone: s.phone || me.phone || '', province: s.province || me.province || '' })); }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  // giá: "3.000.000" / "3,000,000" → bỏ mọi dấu; số đo: "10,5" → 10.5
  const money = (s: string) => (s.replace(/\D/g, '') ? Number(s.replace(/\D/g, '')) : undefined);
  const size = (s: string) => { const n = Number(s.replace(',', '.').replace(/[^\d.]/g, '')); return s.trim() && Number.isFinite(n) && n > 0 ? n : undefined; };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: ListingInput = {
        title: v.title.trim(), kind: v.kind, species_key: v.species_key || undefined, price_vnd: money(v.price), trunk_cm: size(v.trunk), height_cm: size(v.height),
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
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 className="m-0 text-body font-semibold">Tin mới</h2>
      {jobId ? <span className="text-label text-ink-muted">Kèm dáng tương lai của cây này</span> : null}
      <label className="flex flex-col gap-1 text-caption font-medium">Tiêu đề<input required minLength={3} maxLength={160} value={v.title} onChange={set('title')} className={input} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-caption font-medium">Loại
          <select value={v.kind} onChange={set('kind')} className={input}>{(Object.keys(KIND_VI) as ListingKind[]).map((k) => <option key={k} value={k}>{KIND_VI[k]}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium">Loài
          <select value={v.species_key} onChange={set('species_key')} className={input}><option value="">—</option>{species.map((s) => <option key={s.key} value={s.key}>{s.name_vi}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium">Giá (đ)<input inputMode="numeric" value={v.price} onChange={set('price')} placeholder="Trống = liên hệ" className={input} /></label>
        <label className="flex flex-col gap-1 text-caption font-medium">Gốc (cm)<input inputMode="decimal" value={v.trunk} onChange={set('trunk')} className={input} /></label>
        <label className="flex flex-col gap-1 text-caption font-medium">Cao (cm)<input inputMode="decimal" value={v.height} onChange={set('height')} className={input} /></label>
        <label className="flex flex-col gap-1 text-caption font-medium">Tỉnh, thành
          <select value={v.province} onChange={set('province')} className={input}><option value="">—</option>{provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-caption font-medium">Điện thoại / Zalo<input inputMode="tel" value={v.phone} onChange={set('phone')} className={input} /></label>
      <label className="flex flex-col gap-1 text-caption font-medium">Mô tả<textarea rows={3} maxLength={3000} value={v.description} onChange={set('description')} className={cx(input, 'py-2')} /></label>
      <label className="flex min-h-touch cursor-pointer items-center gap-2 text-caption font-medium">
        <ImagePlus size={18} aria-hidden="true" />{file ? file.name : treeId || jobId ? 'Đổi ảnh (mặc định: ảnh phôi)' : 'Chọn ảnh'}
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
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
