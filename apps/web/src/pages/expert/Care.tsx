import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ChevronRight, Plane, Sprout } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { TreePicker } from '@/components/TreePicker';
import { Avatar } from '@/components/Avatar';
import { Button, IconBadge, Notice, Skeleton } from '@/components/ui';
import { ApiError, uploadPhoto } from '@/lib/api';
import { cx } from '@/lib/cx';
import { expertApi, type CareKind, type CareRequest, type Person } from '@/lib/expert';
import { zaloUrl } from '@/lib/market';

const day = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');
const input = 'min-h-touch w-full rounded-btn border border-line-strong bg-surface px-3 text-body font-normal';

/** C5, C6 — Chăm hộ / nuôi hộ: danh sách yêu cầu (cả phía chủ cây và phía nhà vườn). */
export function CareListPage() {
  const [rows, setRows] = useState<CareRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { expertApi.careList().then(setRows).catch((e: ApiError) => setError(e.message)); }, []);
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/tien-ich" title="Chăm hộ, nuôi hộ" />
      <div className="flex flex-col gap-3 px-gutter py-3">
        {error ? <Notice tone="danger">{error}</Notice> : rows === null ? <Skeleton className="h-40 rounded-card" /> : rows.length === 0 ? (
          <Notice tone="info">Chưa có yêu cầu. Mở trang một nhà vườn để gửi cây.</Notice>
        ) : (
          <ul className="m-0 list-none divide-y divide-line overflow-hidden rounded-card border border-line bg-surface p-0 shadow-card">
            {rows.map((r) => (
              <li key={r.id}>
                <Link to={`/cham-ho/${r.id}`} className="flex min-h-[64px] items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-surface-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body font-medium">{r.kind_vi} · {r.tree_name}</span>
                    <span className="text-caption text-ink-muted">{r.role === 'owner' ? r.nursery : r.owner} · {r.status_vi}</span>
                  </span>
                  <ChevronRight size={18} className="text-ink-subtle" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function CareNewPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const slug = params.get('vuon') ?? '';
  const [kind, setKind] = useState<CareKind>('care');
  const [tree, setTree] = useState<{ tree_id: string; job_id: string | null } | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nursery, setNursery] = useState<Person | null>(null);
  useEffect(() => { if (slug) expertApi.person(slug).then(setNursery).catch(() => null); }, [slug]);
  const submit = async () => {
    if (!tree) return;
    setBusy(true);
    setError(null);
    try {
      const r = await expertApi.createCare({ kind, nursery_slug: slug, tree_id: tree.tree_id, job_id: tree.job_id ?? undefined,
        start_date: from || undefined, end_date: to || undefined, note: note.trim() || undefined });
      navigate(`/cham-ho/${r.id}`, { replace: true });
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to={slug ? `/nguoi/${slug}` : '/cham-ho'} title="Gửi cây" />
      <div className="flex flex-col gap-4 px-gutter py-3">
        {nursery ? (
          <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-card">
            <Avatar name={nursery.name} />
            <span className="flex flex-col"><span className="text-body font-semibold">{nursery.name}</span><span className="text-label text-ink-muted">{nursery.province_vi ?? 'Nhà vườn'}</span></span>
          </div>
        ) : null}
        <div role="radiogroup" aria-label="Hình thức" className="grid grid-cols-2 gap-2">
          {([['care', 'Chăm hộ', 'Khi bạn đi xa, về quê', Plane], ['grow', 'Nuôi hộ', 'Vườn chăm theo lộ trình', Sprout]] as const).map(([k, t, sub, Icon]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={cx('flex flex-col items-start gap-2 rounded-card border p-3 text-left', kind === k ? 'border-primary bg-primary-soft' : 'border-line bg-surface')}>
              <IconBadge Icon={Icon} tone={kind === k ? 'leaf' : 'ink'} />
              <span className="text-body font-semibold">{t}</span>
              <span className="text-label text-ink-muted">{sub}</span>
            </button>
          ))}
        </div>
        <h2 className="m-0 -mb-2 text-caption font-semibold">Cây gửi</h2>
        <TreePicker value={tree?.tree_id ?? null} onChange={(t) => setTree({ tree_id: t.tree_id, job_id: t.job_id })} needJob={kind === 'grow'} />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-caption font-semibold">Từ ngày<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} /></label>
          <label className="flex flex-col gap-1 text-caption font-semibold">Đến ngày<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} /></label>
        </div>
        <label className="flex flex-col gap-1 text-caption font-semibold">Ghi chú cho nhà vườn
          <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className={`${input} py-2`} />
        </label>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button onClick={submit} loading={busy} loadingLabel="Đang gửi…" disabled={!tree || !slug || busy}>Gửi yêu cầu</Button>
        <p className="m-0 text-center text-label text-ink-subtle">Tiền công hai bên tự thỏa thuận, Bonsai AI không thu hộ.</p>
      </div>
    </div>
  );
}

export function CareDetailPage() {
  const { requestId = '' } = useParams();
  const [r, setR] = useState<CareRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const load = useCallback(() => expertApi.care(requestId).then(setR).catch((e: ApiError) => setError(e.message)), [requestId]);
  useEffect(() => { load(); }, [load]);
  const act = (a: 'accept' | 'decline' | 'done' | 'cancel') => { setError(null); expertApi.careAction(requestId, a).then(load).catch((e: ApiError) => setError(e.message)); };
  const send = async (photo?: File) => {
    setBusy(true);
    setError(null);
    try {
      await expertApi.careUpdate(requestId, { note: note.trim() || undefined, photo_key: photo ? await uploadPhoto(photo) : undefined });
      setNote('');
      await load();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  const nursery = r?.role === 'nursery';
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/cham-ho" title={r ? `${r.kind_vi} · ${r.tree_name}` : 'Chăm hộ'} />
      <div className="flex flex-col gap-3 px-gutter py-3">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {!r ? (error ? null : <Skeleton className="h-60 rounded-card" />) : (
          <>
            <section className="rounded-card border border-line bg-surface p-4 text-caption shadow-card">
              <div className="font-semibold">{r.status_vi}</div>
              <div className="text-ink-muted">{nursery ? `Chủ cây: ${r.owner}` : `Nhà vườn: ${r.nursery}`}</div>
              {r.start_date || r.end_date ? <div className="text-ink-muted">{[r.start_date && day(r.start_date), r.end_date && day(r.end_date)].filter(Boolean).join(' – ')}</div> : null}
              {r.note ? <p className="m-0 mt-2 whitespace-pre-line">{r.note}</p> : null}
              {r.contact_phone ? <a href={zaloUrl(r.contact_phone)} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-touch items-center font-medium">Nhắn Zalo {r.contact_phone}</a> : null}
              {!nursery && r.job_id ? <Link to={`/ket-qua/${r.job_id}`} className="mt-1 block">Lộ trình của cây</Link> : null}
            </section>
            <div className="flex flex-wrap gap-2">
              {nursery && r.status === 'requested' ? <><Button size="touch" block={false} onClick={() => act('accept')}>Nhận chăm</Button><Button size="touch" block={false} variant="secondary" onClick={() => act('decline')}>Từ chối</Button></> : null}
              {!nursery && r.status === 'requested' ? <Button size="touch" block={false} variant="secondary" onClick={() => act('cancel')}>Hủy yêu cầu</Button> : null}
              {r.status === 'active' ? <Button size="touch" block={false} variant="secondary" onClick={() => window.confirm('Kết thúc chăm hộ?') && act('done')}>Đã xong</Button> : null}
            </div>
            {nursery && r.status === 'active' ? (
              <section className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3 shadow-card">
                <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (tưới, bón, ra chồi…)" aria-label="Ghi chú"
                  className="rounded-btn border border-line-strong bg-surface p-2 text-body" />
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" size="touch" onClick={() => file.current?.click()} disabled={busy}><Camera size={18} aria-hidden="true" />Gửi ảnh</Button>
                  <Button size="touch" onClick={() => send()} disabled={busy || !note.trim()}>Gửi ghi chú</Button>
                </div>
                <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) send(f); }} />
              </section>
            ) : null}
            {r.updates?.length ? (
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {r.updates.map((u) => (
                  <li key={u.id} className="flex gap-3 rounded-card border border-line bg-surface p-2 shadow-card">
                    {u.photo_url ? <a href={u.photo_url} target="_blank" rel="noreferrer"><img src={u.photo_url} alt={`Ảnh ngày ${day(u.at)}`} className="h-20 w-20 flex-none rounded-img object-cover" /></a> : null}
                    <span className="flex flex-col justify-center text-caption">
                      <span className="text-ink-muted">{day(u.at)}</span>
                      {u.note ? <span>{u.note}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
