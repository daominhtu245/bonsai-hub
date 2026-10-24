import { useState } from 'react';
import { EyeOff, RotateCcw, ShieldAlert, Undo2 } from 'lucide-react';
import { adminCommunityApi } from '@/lib/adminCommunity';
import { vnd as vndMarket } from '@/lib/market';
import { Badge, DataTable, PageHeader, Panel, StatCard, TableView, Tabs, dt, num, useAction, useConfirm, useLoad } from './kit';

type Tab = 'listings' | 'consults' | 'care' | 'profiles' | 'stolen';
const LISTING_STATUS = { active: ['Đang hiện', 'success'], sold: ['Đã bán', 'neutral'], hidden: ['Đã ẩn', 'warn'] } as const;
const CONSULT_STATUS = { open: ['Chờ trả lời', 'warn'], answered: ['Đã trả lời', 'success'], refunded: ['Đã hoàn lượt', 'neutral'] } as const;
const CARE_STATUS: Record<string, string> = { requested: 'Chờ nhận', active: 'Đang chăm', done: 'Xong', declined: 'Từ chối' };

function Listings() {
  const [status, setStatus] = useState('');
  const [state, reload] = useLoad(() => adminCommunityApi.listings(status || undefined), [status]);
  const [confirm, dialog] = useConfirm();
  const [run, notice] = useAction();
  const hide = async (id: string, title: string) => {
    const r = await confirm({ title: 'Ẩn tin', body: `Ẩn "${title}" khỏi chợ?`, confirmLabel: 'Ẩn tin', danger: true, note: { label: 'Lý do (ghi nhật ký)' } });
    if (r) await run(async () => { await adminCommunityApi.moderateListing(id, 'hidden', r.note); reload(); }, 'Đã ẩn tin.');
  };
  return (
    <>
      {notice}
      <div className="mb-3 flex gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Trạng thái" className="min-h-touch rounded-btn border border-line-strong bg-surface px-2 text-caption">
          <option value="">Mọi trạng thái</option><option value="active">Đang hiện</option><option value="hidden">Đã ẩn</option><option value="sold">Đã bán</option>
        </select>
      </div>
      <Panel pad={false}>
        <TableView state={state}>
          {(rows) => (
            <DataTable rows={rows} rowKey={(x) => x.id} empty="Chưa có tin."
              columns={[
                { key: 'p', header: '', render: (x) => (x.photo_url ? <img src={x.photo_url} alt="" className="h-10 w-10 rounded-img object-cover" /> : null) },
                { key: 't', header: 'Tin', render: (x) => <a href={`/tin/${x.code}`} target="_blank" rel="noreferrer" className="font-medium">{x.title}</a> },
                { key: 's', header: 'Người bán', render: (x) => x.seller?.name ?? '—' },
                { key: 'v', header: 'Giá', align: 'right', render: (x) => vndMarket(x.price_vnd) },
                { key: 'st', header: 'Trạng thái', render: (x) => <Badge tone={LISTING_STATUS[x.status][1]}>{LISTING_STATUS[x.status][0]}{x.featured ? ' · nổi bật' : ''}</Badge> },
                { key: 'w', header: 'Xem', align: 'right', render: (x) => num(x.views) },
                { key: 'd', header: 'Đăng', className: 'hidden 2xl:table-cell', render: (x) => dt(x.created_at) },
                { key: 'a', header: '', render: (x) => (x.status === 'hidden' ? (
                  <button type="button" aria-label={`Hiện lại ${x.title}`} onClick={() => run(async () => { await adminCommunityApi.moderateListing(x.id, 'active'); reload(); }, 'Đã hiện lại.')}
                    className="flex h-touch w-touch items-center justify-center text-ink-muted hover:text-ink"><Undo2 size={16} aria-hidden="true" /></button>
                ) : (
                  <button type="button" aria-label={`Ẩn ${x.title}`} onClick={() => hide(x.id, x.title)}
                    className="flex h-touch w-touch items-center justify-center text-ink-muted hover:text-danger"><EyeOff size={16} aria-hidden="true" /></button>
                )) },
              ]} />
          )}
        </TableView>
      </Panel>
      {dialog}
    </>
  );
}

function Consults() {
  const [status, setStatus] = useState('open');
  const [state, reload] = useLoad(() => adminCommunityApi.consults(status || undefined), [status]);
  const [confirm, dialog] = useConfirm();
  const [run, notice] = useAction();
  const act = async (id: string, action: 'refund' | 'release') => {
    const r = await confirm({ title: action === 'refund' ? 'Hoàn lượt ngay' : 'Gỡ nghệ nhân', confirmLabel: action === 'refund' ? 'Hoàn lượt' : 'Gỡ',
      body: action === 'refund' ? 'Đóng câu hỏi và trả lượt cho người hỏi.' : 'Để nghệ nhân khác nhận câu hỏi này.', note: { label: 'Lý do' } });
    if (r) await run(async () => { await adminCommunityApi.consultAction(id, action, r.note); reload(); }, 'Đã xử lý.');
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
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Trạng thái" className="min-h-touch self-start rounded-btn border border-line-strong bg-surface px-2 text-caption">
              <option value="open">Chờ trả lời</option><option value="answered">Đã trả lời</option><option value="refunded">Đã hoàn lượt</option><option value="">Tất cả</option>
            </select>
            <Panel pad={false}>
              <DataTable rows={d.items} rowKey={(c) => c.id} empty="Không có câu hỏi."
                columns={[
                  { key: 'q', header: 'Câu hỏi', render: (c) => <span className="line-clamp-2 max-w-[360px]">{c.question}</span> },
                  { key: 'u', header: 'Người hỏi', render: (c) => c.asker?.name ?? '—' },
                  { key: 'n', header: 'Nghệ nhân', render: (c) => c.artisan?.name ?? <span className="text-ink-subtle">chưa ai nhận</span> },
                  { key: 'h', header: 'Đã chờ', align: 'right', render: (c) => <span className={c.status === 'open' && c.hours_open >= 60 ? 'font-semibold text-danger' : ''}>{c.hours_open} giờ</span> },
                  { key: 's', header: 'Trạng thái', render: (c) => <Badge tone={CONSULT_STATUS[c.status][1]}>{CONSULT_STATUS[c.status][0]}{c.rating ? ` · ${c.rating}★` : ''}</Badge> },
                  { key: 'a', header: '', render: (c) => (c.status === 'open' ? (
                    <span className="flex">
                      {c.artisan ? <button type="button" aria-label="Gỡ nghệ nhân" onClick={() => act(c.id, 'release')} className="flex h-touch w-touch items-center justify-center text-ink-muted hover:text-ink"><Undo2 size={16} aria-hidden="true" /></button> : null}
                      <button type="button" aria-label="Hoàn lượt ngay" onClick={() => act(c.id, 'refund')} className="flex h-touch w-touch items-center justify-center text-ink-muted hover:text-ink"><RotateCcw size={16} aria-hidden="true" /></button>
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
  const [state] = useLoad(() => adminCommunityApi.care());
  return (
    <Panel pad={false}>
      <TableView state={state}>
        {(rows) => (
          <DataTable rows={rows} rowKey={(r) => r.id} empty="Chưa có yêu cầu."
            columns={[
              { key: 'k', header: 'Loại', render: (r) => (r.kind === 'care' ? 'Chăm hộ' : 'Nuôi hộ') },
              { key: 'o', header: 'Chủ cây', render: (r) => r.owner?.name ?? '—' },
              { key: 'n', header: 'Nhà vườn', render: (r) => r.nursery?.name ?? '—' },
              { key: 'd', header: 'Thời gian', render: (r) => [r.start_date, r.end_date].filter(Boolean).join(' → ') || '—' },
              { key: 's', header: 'Trạng thái', render: (r) => <Badge tone={r.status === 'active' ? 'success' : r.status === 'requested' ? 'warn' : 'neutral'}>{CARE_STATUS[r.status] ?? r.status}</Badge> },
              { key: 'c', header: 'Tạo', render: (r) => dt(r.created_at) },
            ]} />
        )}
      </TableView>
    </Panel>
  );
}

function Profiles() {
  const [state, reload] = useLoad(() => adminCommunityApi.profiles());
  const [confirm, dialog] = useConfirm();
  const [run, notice] = useAction();
  const hide = async (id: string, slug: string) => {
    const r = await confirm({ title: 'Gỡ trang công khai', body: `Gỡ /nguoi/${slug}? Người dùng có thể tạo lại với tên khác.`, confirmLabel: 'Gỡ trang', danger: true, note: { label: 'Lý do' } });
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
                { key: 'n', header: 'Tên', render: (p) => p.name ?? '—' },
                { key: 'r', header: 'Vai trò', render: (p) => <Badge tone={p.role === 'artisan' ? 'info' : 'success'}>{p.role === 'artisan' ? 'Nghệ nhân' : p.role === 'nursery' ? 'Nhà vườn' : p.role}</Badge> },
                { key: 'b', header: 'Giới thiệu', className: 'hidden xl:table-cell', render: (p) => <span className="line-clamp-2 max-w-[360px] text-ink-muted">{p.bio ?? '—'}</span> },
                { key: 'a', header: '', render: (p) => <button type="button" aria-label={`Gỡ trang ${p.slug}`} onClick={() => hide(p.id, p.slug)} className="flex h-touch w-touch items-center justify-center text-ink-muted hover:text-danger"><EyeOff size={16} aria-hidden="true" /></button> },
              ]} />
          )}
        </TableView>
      </Panel>
      {dialog}
    </>
  );
}

function Stolen() {
  const [state] = useLoad(() => adminCommunityApi.stolen());
  return (
    <Panel pad={false}>
      <TableView state={state}>
        {(rows) => (
          <DataTable rows={rows} rowKey={(t) => t.tree_id} empty="Không có cây nào đang báo mất."
            columns={[
              { key: 'i', header: '', render: () => <ShieldAlert size={16} className="text-danger" aria-hidden="true" /> },
              { key: 'n', header: 'Cây', render: (t) => (t.passport_code ? <a href={`/so-cay/${t.passport_code}`} target="_blank" rel="noreferrer">{t.nickname || t.passport_code}</a> : t.nickname || '—') },
              { key: 'o', header: 'Chủ', render: (t) => t.owner?.name ?? '—' },
              { key: 'e', header: 'Liên hệ', render: (t) => t.owner?.email ?? '—' },
              { key: 'd', header: 'Báo mất', render: (t) => dt(t.stolen_at) },
            ]} />
        )}
      </TableView>
    </Panel>
  );
}

/** Kiểm duyệt nội dung công khai + theo dõi dịch vụ có tính lượt (hỏi nghệ nhân, chăm hộ). */
export default function CommunityAdmin() {
  const [tab, setTab] = useState<Tab>('listings');
  return (
    <>
      <PageHeader title="Cộng đồng & chợ" sub="Tin đăng, hỏi nghệ nhân, chăm hộ, trang công khai, cây báo mất" />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[['listings', 'Tin đăng'], ['consults', 'Hỏi nghệ nhân'], ['care', 'Chăm hộ'], ['profiles', 'Trang công khai'], ['stolen', 'Cây báo mất']]} />
      {tab === 'listings' ? <Listings /> : tab === 'consults' ? <Consults /> : tab === 'care' ? <Care /> : tab === 'profiles' ? <Profiles /> : <Stolen />}
    </>
  );
}
