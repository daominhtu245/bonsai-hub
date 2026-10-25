import { useEffect, useState } from 'react';
import { EyeOff, ExternalLink, Flag, RotateCcw, ShieldAlert, ShieldOff, Undo2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { adminCommunityApi, type ListingAdmin, type Who } from '@/lib/adminCommunity';
import { SPECIES_NAME } from '@/lib/copy';
import { cx } from '@/lib/cx';
import { vnd as vndMarket } from '@/lib/market';
import { useInbox } from './inbox';
import { Badge, DataTable, KeyValue, PageHeader, Panel, SearchBox, Select, StatCard, TableView, Tabs, Toolbar, dt, num, useAction, useConfirm, useLoad, useUrlState } from './kit';

type Tab = 'listings' | 'consults' | 'care' | 'profiles' | 'stolen';
const LISTING_STATUS = { active: ['Đang hiện', 'success'], sold: ['Đã bán', 'neutral'], hidden: ['Đã ẩn', 'warn'] } as const;
const CONSULT_STATUS = { open: ['Chờ trả lời', 'warn'], answered: ['Đã trả lời', 'success'], refunded: ['Đã hoàn lượt', 'neutral'] } as const;
const CARE_STATUS: Record<string, string> = { requested: 'Chờ nhận', active: 'Đang chăm', done: 'Xong', declined: 'Từ chối' };
const KIND_VI: Record<string, string> = { phoi: 'Phôi', cay: 'Cây thành phẩm', nuoi_ho: 'Bán kèm nuôi hộ' };
const HIDE_REASONS: Array<[string, string]> = [['Nghi lừa đảo', 'Nghi lừa đảo'], ['Ảnh không phải cây thật / lấy ảnh mạng', 'Ảnh không phải cây thật'], ['Sai giá, sai thông tin', 'Sai giá, sai thông tin'], ['Nghi cây bị trộm', 'Nghi cây bị trộm'], ['Spam, đăng trùng', 'Spam, đăng trùng'], ['Khác', 'Khác']];

/** Tên người dẫn tới hồ sơ quản trị. */
function Person({ who, empty = '—' }: { who: Who | null | undefined; empty?: string }) {
  if (!who) return <span className="text-ink-subtle">{empty}</span>;
  return <Link to={`/admin/nguoi-dung/${who.id}`} onClick={(e) => e.stopPropagation()}>{who.name}</Link>;
}

function ListingDetail({ x, onClose, onChanged }: { x: ListingAdmin; onClose: () => void; onChanged: () => void }) {
  const [confirm, dialog] = useConfirm();
  const [run, notice, busy] = useAction();
  const hide = async () => {
    const r = await confirm({ title: 'Ẩn tin', body: `Ẩn “${x.title}” khỏi chợ. Ghi vào nhật ký quản trị.`, confirmLabel: 'Ẩn tin', danger: true,
      fields: [{ name: 'reason', label: 'Lý do', required: true, options: HIDE_REASONS, defaultValue: HIDE_REASONS[0][0] }], note: { label: 'Ghi chú thêm' } });
    if (r) await run(async () => { await adminCommunityApi.moderateListing(x.id, 'hidden', [r.values.reason, r.note].filter(Boolean).join(' · ')); onChanged(); }, 'Đã ẩn tin.');
  };
  return (
    <Panel title={<span className="flex items-center gap-2">Tin {x.code}</span>} className="lg:sticky lg:top-[76px]"
      actions={<button type="button" aria-label="Đóng" onClick={onClose} className="flex h-touch w-touch items-center justify-center text-ink-muted hover:text-ink"><X size={18} /></button>}>
      {dialog}
      {notice}
      <div className="flex flex-col gap-3 text-caption">
        {x.photo_url ? <img src={x.photo_url} alt="" className="aspect-[4/3] w-full rounded-btn bg-photo object-cover" /> : null}
        <div className="flex items-start justify-between gap-2">
          <span className="text-body font-semibold [overflow-wrap:anywhere]">{x.title}</span>
          <Badge tone={LISTING_STATUS[x.status][1]}>{LISTING_STATUS[x.status][0]}</Badge>
        </div>
        {x.reports ? <span className="inline-flex items-center gap-1 font-semibold text-danger"><Flag size={14} aria-hidden="true" />Bị báo {x.reports} lần · <Link to="/admin/bao-cao">xem báo cáo</Link></span> : null}
        {x.description ? <p className="m-0 max-h-40 overflow-y-auto whitespace-pre-line rounded-btn bg-surface-2 p-3">{x.description}</p> : null}
        <KeyValue items={[
          ['Giá', vndMarket(x.price_vnd)],
          ['Loại', `${KIND_VI[x.kind ?? ''] ?? x.kind ?? '—'}${x.species_key ? ` · ${SPECIES_NAME[x.species_key] ?? x.species_key}` : ''}`],
          ['Kích thước', [x.trunk_cm ? `gốc ${x.trunk_cm} cm` : null, x.height_cm ? `cao ${x.height_cm} cm` : null].filter(Boolean).join(' · ') || '—'],
          ['Người bán', <Person key="s" who={x.seller} />],
          ['Liên hệ', x.contact_phone ?? '—'],
          ['Lượt xem', num(x.views)],
          ['Đăng lúc', dt(x.created_at)],
        ]} />
        <div className="flex flex-wrap gap-2">
          <a href={`/tin/${x.code}`} target="_blank" rel="noreferrer" className="inline-flex min-h-touch items-center gap-1 rounded-btn border border-line px-3 font-medium no-underline">
            Xem như khách <ExternalLink size={14} aria-hidden="true" />
          </a>
          {x.status === 'hidden' ? (
            <Button size="touch" block={false} variant="secondary" disabled={busy} onClick={() => run(async () => { await adminCommunityApi.moderateListing(x.id, 'active'); onChanged(); }, 'Đã hiện lại.')}>
              <Undo2 size={16} aria-hidden="true" />Hiện lại
            </Button>
          ) : (
            <Button size="touch" block={false} variant="danger" className="border border-danger" disabled={busy} onClick={hide}><EyeOff size={16} aria-hidden="true" />Ẩn tin</Button>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Listings({ q, status, setF }: { q: string; status: string; setF: (p: Record<string, string>) => void }) {
  const [state, reload] = useLoad(() => adminCommunityApi.listings(status || undefined, q || undefined), [status, q]);
  const [sel, setSel] = useState<string | null>(null);
  const rows = state.status === 'ready' ? state.data : [];
  useEffect(() => { if (q && rows.length === 1) setSel(rows[0].id); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = rows.find((x) => x.id === sel) ?? null;
  return (
    <>
      <Toolbar>
        <SearchBox value={q} onChange={(v) => setF({ q: v })} placeholder="Mã tin hoặc tiêu đề" />
        <Select label="Trạng thái" value={status} onChange={(v) => setF({ status: v })} options={[['', 'Mọi trạng thái'], ['active', 'Đang hiện'], ['hidden', 'Đã ẩn'], ['sold', 'Đã bán']]} />
      </Toolbar>
      <div className={cx('grid items-start gap-4', current && 'lg:grid-cols-[minmax(0,1fr)_400px]')}>
        <Panel pad={false}>
          <TableView state={state}>
            {(list) => (
              <DataTable rows={list} rowKey={(x) => x.id} empty="Không có tin phù hợp." onRowClick={(x) => setSel(x.id === sel ? null : x.id)}
                columns={[
                  { key: 'p', header: '', className: 'w-[56px]', render: (x) => (x.photo_url ? <img src={x.photo_url} alt="" className="h-10 w-10 min-w-[40px] rounded-img object-cover" /> : null) },
                  { key: 't', header: 'Tin', render: (x) => (
                    <span className="flex flex-col">
                      <span className={cx('font-medium', x.id === sel && 'text-primary')}>{x.title}</span>
                      <span className="font-mono text-label text-ink-subtle">{x.code}</span>
                    </span>
                  ) },
                  { key: 's', header: 'Người bán', render: (x) => <Person who={x.seller} /> },
                  { key: 'v', header: 'Giá', align: 'right', className: 'whitespace-nowrap', render: (x) => vndMarket(x.price_vnd) },
                  { key: 'st', header: 'Trạng thái', render: (x) => (
                    <span className="flex flex-wrap gap-1">
                      <Badge tone={LISTING_STATUS[x.status][1]}>{LISTING_STATUS[x.status][0]}{x.featured ? ' · nổi bật' : ''}</Badge>
                      {x.reports ? <Badge tone="danger">{x.reports} báo cáo</Badge> : null}
                    </span>
                  ) },
                  { key: 'w', header: 'Xem', align: 'right', className: 'hidden md:table-cell', render: (x) => num(x.views) },
                  { key: 'd', header: 'Đăng', className: 'hidden 2xl:table-cell', render: (x) => dt(x.created_at) },
                ]} />
            )}
          </TableView>
        </Panel>
        {current ? <ListingDetail key={current.id} x={current} onClose={() => setSel(null)} onChanged={reload} /> : null}
      </div>
    </>
  );
}

function Consults() {
  const [status, setStatus] = useState('open');
  const [state, reload] = useLoad(() => adminCommunityApi.consults(status || undefined), [status]);
  const [confirm, dialog] = useConfirm();
  const [run, notice] = useAction();
  const { refresh } = useInbox();
  const act = async (id: string, action: 'refund' | 'release') => {
    const r = await confirm({ title: action === 'refund' ? 'Hoàn lượt ngay' : 'Gỡ nghệ nhân', confirmLabel: action === 'refund' ? 'Hoàn lượt' : 'Gỡ',
      body: action === 'refund' ? 'Đóng câu hỏi và trả lượt cho người hỏi.' : 'Để nghệ nhân khác nhận câu hỏi này.', note: { label: 'Lý do' } });
    if (r) await run(async () => { await adminCommunityApi.consultAction(id, action, r.note); reload(); refresh(); }, 'Đã xử lý.');
  };
  return (
    <>
      {notice}
      <TableView state={state}>
        {(d) => (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Đang chờ" value={d.summary.open} format={num} goodWhen="down" />
              <StatCard label="Sắp quá 72 giờ" value={d.summary.overdue_soon} format={num} goodWhen="down" />
              {d.artisans.slice(0, 2).map((a) => <StatCard key={a.artisan?.id} label={a.artisan?.name ?? '—'} value={a.answered} format={(n) => `${num(n)} trả lời${a.rating ? ` · ${a.rating}★` : ''}`} />)}
            </div>
            <Toolbar>
              <Select label="Trạng thái" value={status} onChange={setStatus} options={[['open', 'Chờ trả lời'], ['answered', 'Đã trả lời'], ['refunded', 'Đã hoàn lượt'], ['', 'Tất cả']]} />
            </Toolbar>
            <Panel pad={false}>
              <DataTable rows={d.items} rowKey={(c) => c.id} empty="Không có câu hỏi."
                columns={[
                  { key: 'q', header: 'Câu hỏi', render: (c) => <Link to={`/admin/hoi-dap/${c.id}`} className="line-clamp-2 max-w-[360px]">{c.question}</Link> },
                  { key: 'u', header: 'Người hỏi', render: (c) => <Person who={c.asker} /> },
                  { key: 'n', header: 'Nghệ nhân', render: (c) => <Person who={c.artisan} empty="chưa ai nhận" /> },
                  { key: 'h', header: 'Đã chờ', align: 'right', render: (c) => <span className={c.status === 'open' && c.hours_open >= 60 ? 'font-semibold text-danger' : ''}>{c.hours_open} giờ</span> },
                  { key: 's', header: 'Trạng thái', render: (c) => <Badge tone={CONSULT_STATUS[c.status][1]}>{CONSULT_STATUS[c.status][0]}{c.rating ? ` · ${c.rating}★` : ''}</Badge> },
                  { key: 'a', header: '', render: (c) => (c.status === 'open' ? (
                    <span className="flex">
                      {c.artisan ? <button type="button" aria-label="Gỡ nghệ nhân" title="Gỡ nghệ nhân" onClick={() => act(c.id, 'release')} className="flex h-touch w-touch items-center justify-center text-ink-muted hover:text-ink"><Undo2 size={16} aria-hidden="true" /></button> : null}
                      <button type="button" aria-label="Hoàn lượt ngay" title="Hoàn lượt ngay" onClick={() => act(c.id, 'refund')} className="flex h-touch w-touch items-center justify-center text-ink-muted hover:text-ink"><RotateCcw size={16} aria-hidden="true" /></button>
                    </span>
                  ) : null) },
                ]} />
            </Panel>
          </div>
        )}
      </TableView>
      {dialog}
    </>
  );
}

function Care() {
  const [status, setStatus] = useState('');
  const [state] = useLoad(() => adminCommunityApi.care());
  const waitH = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  return (
    <>
      <Toolbar>
        <Select label="Trạng thái" value={status} onChange={setStatus} options={[['', 'Tất cả'], ['requested', 'Chờ nhận'], ['active', 'Đang chăm'], ['done', 'Xong'], ['declined', 'Từ chối']]} />
      </Toolbar>
      <Panel pad={false}>
        <TableView state={state}>
          {(rows) => (
            <DataTable rows={rows.filter((r) => !status || r.status === status)} rowKey={(r) => r.id} empty="Không có yêu cầu."
              columns={[
                { key: 'k', header: 'Loại', render: (r) => (r.kind === 'care' ? 'Chăm hộ' : 'Nuôi hộ') },
                { key: 'o', header: 'Chủ cây', render: (r) => <Person who={r.owner} /> },
                { key: 'n', header: 'Nhà vườn', render: (r) => <Person who={r.nursery} /> },
                { key: 'd', header: 'Thời gian', render: (r) => [r.start_date, r.end_date].filter(Boolean).join(' → ') || '—' },
                { key: 's', header: 'Trạng thái', render: (r) => (
                  <span className="flex flex-wrap gap-1">
                    <Badge tone={r.status === 'active' ? 'success' : r.status === 'requested' ? 'warn' : 'neutral'}>{CARE_STATUS[r.status] ?? r.status}</Badge>
                    {r.status === 'requested' && waitH(r.created_at) >= 48 ? <Badge tone="danger">chờ {waitH(r.created_at)} giờ</Badge> : null}
                  </span>
                ) },
                { key: 'c', header: 'Tạo', render: (r) => dt(r.created_at) },
              ]} />
          )}
        </TableView>
      </Panel>
    </>
  );
}

function Profiles() {
  const [state, reload] = useLoad(() => adminCommunityApi.profiles());
  const [confirm, dialog] = useConfirm();
  const [run, notice] = useAction();
  const hide = async (id: string, slug: string) => {
    const r = await confirm({ title: 'Gỡ trang công khai', body: `Gỡ /nguoi/${slug}? Người dùng có thể tạo lại với tên khác.`, confirmLabel: 'Gỡ trang', danger: true, note: { label: 'Lý do', required: true } });
    if (r) await run(async () => { await adminCommunityApi.hideProfile(id, r.note); reload(); }, 'Đã gỡ trang.');
  };
  return (
    <>
      {notice}
      <Panel pad={false}>
        <TableView state={state}>
          {(rows) => (
            <DataTable rows={rows} rowKey={(p) => p.id} empty="Chưa có trang công khai."
              columns={[
                { key: 's', header: 'Trang', render: (p) => <a href={`/nguoi/${p.slug}`} target="_blank" rel="noreferrer" className="font-mono">/nguoi/{p.slug}</a> },
                { key: 'n', header: 'Tên', render: (p) => <Link to={`/admin/nguoi-dung/${p.id}`}>{p.name ?? p.email ?? '—'}</Link> },
                { key: 'r', header: 'Vai trò', render: (p) => <Badge tone={p.role === 'artisan' ? 'info' : 'success'}>{p.role === 'artisan' ? 'Nghệ nhân' : p.role === 'nursery' ? 'Nhà vườn' : p.role}</Badge> },
                { key: 't', header: 'Chuyên môn', className: 'hidden lg:table-cell', render: (p) => <span className="flex flex-wrap gap-1">{p.specialties.slice(0, 4).map((t) => <Badge key={t}>{t}</Badge>)}</span> },
                { key: 'b', header: 'Giới thiệu', className: 'hidden xl:table-cell', render: (p) => <span className="line-clamp-2 max-w-[360px] text-ink-muted">{p.bio ?? '—'}</span> },
                { key: 'a', header: '', render: (p) => <button type="button" aria-label={`Gỡ trang ${p.slug}`} title="Gỡ trang" onClick={() => hide(p.id, p.slug)} className="flex h-touch w-touch items-center justify-center text-ink-muted hover:text-danger"><EyeOff size={16} aria-hidden="true" /></button> },
              ]} />
          )}
        </TableView>
      </Panel>
      {dialog}
    </>
  );
}

function Stolen() {
  const [state, reload] = useLoad(() => adminCommunityApi.stolen());
  const [confirm, dialog] = useConfirm();
  const [run, notice] = useAction();
  const clear = async (id: string, name: string) => {
    const r = await confirm({ title: 'Gỡ báo mất', body: `“${name}” không còn bị đánh dấu mất (chủ đã tìm lại, hoặc báo nhầm).`, confirmLabel: 'Gỡ báo mất' });
    if (r) await run(async () => { await adminCommunityApi.clearStolen(id); reload(); }, 'Đã gỡ báo mất.');
  };
  return (
    <>
      {notice}
      <Panel pad={false}>
        <TableView state={state}>
          {(rows) => (
            <DataTable rows={rows} rowKey={(t) => t.tree_id} empty="Không có cây nào đang báo mất."
              columns={[
                { key: 'i', header: '', render: () => <ShieldAlert size={16} className="text-danger" aria-hidden="true" /> },
                { key: 'n', header: 'Cây', render: (t) => (t.passport_code ? <a href={`/so-cay/${t.passport_code}`} target="_blank" rel="noreferrer">{t.nickname || t.passport_code}</a> : t.nickname || '—') },
                { key: 'o', header: 'Chủ', render: (t) => <Person who={t.owner} /> },
                { key: 'e', header: 'Liên hệ', render: (t) => t.owner?.email ?? '—' },
                { key: 'd', header: 'Báo mất', render: (t) => dt(t.stolen_at) },
                { key: 'a', header: '', render: (t) => <button type="button" aria-label={`Gỡ báo mất ${t.nickname ?? ''}`} title="Gỡ báo mất" onClick={() => clear(t.tree_id, t.nickname || t.passport_code || 'Cây')} className="flex h-touch w-touch items-center justify-center text-ink-muted hover:text-ink"><ShieldOff size={16} aria-hidden="true" /></button> },
              ]} />
          )}
        </TableView>
      </Panel>
      {dialog}
    </>
  );
}

/** Kiểm duyệt nội dung công khai + theo dõi dịch vụ có tính lượt (hỏi nghệ nhân, chăm hộ). Tab, tìm kiếm nằm trên URL. */
export default function CommunityAdmin() {
  const [f, setF] = useUrlState({ tab: 'listings', q: '', status: '' });
  const [counts] = useLoad(() => adminCommunityApi.communityCounts(), [f.tab]);
  const c = counts.status === 'ready' ? counts.data : null;
  const label = (text: string, n?: number, urgent = false) => (
    <span className="inline-flex items-center gap-1.5">{text}{n ? <span className={cx('tabular rounded-full px-1.5 text-label', urgent ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-ink-muted')}>{num(n)}</span> : null}</span>
  );
  const tab = f.tab as Tab;
  return (
    <>
      <PageHeader title="Kiểm duyệt & dịch vụ" sub="Tin đăng, hỏi nghệ nhân, chăm hộ, trang công khai, cây báo mất"
        actions={<Link to="/admin/bao-cao" className="inline-flex min-h-touch items-center gap-1.5 rounded-btn border border-line px-3 text-caption font-medium no-underline"><Flag size={15} aria-hidden="true" />Báo vi phạm</Link>} />
      <Tabs<Tab> value={tab} onChange={(t) => setF({ tab: t, q: '', status: '' })} tabs={[
        ['listings', label('Tin đăng', c?.listings)], ['consults', label('Hỏi nghệ nhân', c?.consults, true)], ['care', label('Chăm hộ', c?.care)],
        ['profiles', label('Trang công khai', c?.profiles)], ['stolen', label('Cây báo mất', c?.stolen, true)],
      ]} />
      {tab === 'listings' ? <Listings q={f.q} status={f.status} setF={setF} /> : tab === 'consults' ? <Consults /> : tab === 'care' ? <Care /> : tab === 'profiles' ? <Profiles /> : <Stolen />}
    </>
  );
}
