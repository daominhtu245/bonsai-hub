import { useState } from 'react';
import { ChevronLeft, Send } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Notice } from '@/components/ui';
import { adminCommunityApi } from '@/lib/adminCommunity';
import { consoleApi, type Role, type UserDetail as Detail } from '@/lib/adminConsole';
import { cx } from '@/lib/cx';
import {
  Badge, DataTable, KeyValue, PageHeader, Panel, ROLE_LABEL, StatCard, StatusBadge, Tabs, TableView, dt, num, shortId, usd, useAction, useConfirm, useLoad, vnd,
} from './kit';

type Tab = 'jobs' | 'ledger' | 'payments' | 'trees' | 'listings' | 'services' | 'reports' | 'audit';
const ACTION_VI: Record<string, string> = {
  'user.credits': 'Cộng / trừ lượt', 'user.role': 'Đổi vai trò', 'user.lock': 'Khóa', 'user.unlock': 'Mở khóa', 'user.note': 'Sửa ghi chú',
  'user.message': 'Nhắn riêng', 'credits.gift': 'Tặng lượt', 'payment.confirm': 'Xác nhận chuyển khoản', 'payment.cancel': 'Hủy chuyển khoản',
};
const LISTING_VI: Record<string, string> = { active: 'Đang hiện', sold: 'Đã bán', hidden: 'Đã ẩn' };
const SERVICE_VI: Record<string, string> = {
  open: 'Chờ trả lời', answered: 'Đã trả lời', refunded: 'Đã hoàn lượt', requested: 'Chờ nhận', active: 'Đang chăm', done: 'Xong', declined: 'Từ chối',
};
const PATHS: Array<[string, string]> = [['/', 'Trang chủ'], ['/vuon', 'Vườn'], ['/tai-khoan/luot', 'Lịch sử lượt'], ['/mua-luot', 'Mua lượt'], ['/tien-ich', 'Tiện ích']];

/** Ghi chú nội bộ: chỉ quản trị thấy (khách quen, đã hứa bù lượt, cần theo dõi…). */
function NotePanel({ userId, initial }: { userId: string; initial: string | null }) {
  const [v, setV] = useState(initial ?? '');
  const [saved, setSaved] = useState(initial ?? '');
  const [run, notice, busy] = useAction();
  return (
    <Panel title="Ghi chú nội bộ">
      {notice}
      <textarea value={v} onChange={(e) => setV(e.target.value)} rows={3} maxLength={2000} aria-label="Ghi chú nội bộ"
        placeholder="Chỉ quản trị thấy · VD: khách quen, đã hứa bù 2 lượt"
        className="w-full rounded-btn border border-line-strong bg-surface p-2 text-caption text-ink" />
      {v !== saved ? (
        <div className="mt-2 flex justify-end">
          <Button size="touch" block={false} disabled={busy} onClick={() => run(async () => { const r = await adminCommunityApi.setUserNote(userId, v); setSaved(r.admin_note ?? ''); setV(r.admin_note ?? ''); }, 'Đã lưu ghi chú.')}>Lưu ghi chú</Button>
        </div>
      ) : null}
    </Panel>
  );
}

const REASON: Record<string, string> = { purchase: 'Mua', render: 'Dùng', refund: 'Hoàn', gift: 'Tặng', adjust: 'Điều chỉnh' };

export default function UserDetail() {
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('jobs');
  const [state, , setData] = useLoad(() => consoleApi.user(userId), [userId]);
  const [confirm, dialog] = useConfirm();
  const [run, notice, busy] = useAction();
  const [rel] = useLoad(() => adminCommunityApi.userRelated(userId), [userId]);
  const r = rel.status === 'ready' ? rel.data : null;

  const message = async (d: Detail) => {
    const res = await confirm({
      title: 'Nhắn riêng', body: `Gửi thông báo tới ${d.user.name || d.user.email} (điện thoại / trình duyệt${d.notify_zalo ? ', Zalo' : ''}).`,
      confirmLabel: 'Gửi', fields: [
        { name: 'title', label: 'Tiêu đề', required: true, placeholder: 'VD: Đã hoàn lượt cho bạn' },
        { name: 'body', label: 'Nội dung (tối đa 180 ký tự)', required: true, placeholder: 'VD: Ảnh lần trước chưa đạt, mình đã cộng lại 1 lượt.' },
        { name: 'path', label: 'Bấm vào mở trang', required: true, options: PATHS, defaultValue: '/' },
      ],
    });
    if (res) await run(() => adminCommunityApi.messageUser(d.user.id, { title: res.values.title, body: res.values.body.slice(0, 180), path: res.values.path }), 'Đã gửi thông báo.');
  };

  const adjust = async (d: Detail) => {
    const r = await confirm({
      title: 'Cộng / trừ lượt',
      body: `Hiện có ${d.user.credits} lượt. Số âm để trừ.`,
      confirmLabel: 'Ghi sổ lượt',
      fields: [{ name: 'delta', label: 'Số lượt (+/−)', type: 'number', required: true, placeholder: '3 hoặc -1' }],
      note: { label: 'Lý do (bắt buộc, lưu vào nhật ký)', required: true },
    });
    if (r) await run(async () => setData(await consoleApi.adjustCredits(d.user.id, Number(r.values.delta), r.note)), 'Đã cập nhật lượt.');
  };
  const role = async (d: Detail, next: Role) => {
    if (next === d.user.role) return;
    const r = await confirm({ title: 'Đổi vai trò', body: `${ROLE_LABEL[d.user.role]} → ${ROLE_LABEL[next]}`, confirmLabel: 'Đổi vai trò', danger: next === 'admin' });
    if (r) await run(async () => setData(await consoleApi.setRole(d.user.id, next)), 'Đã đổi vai trò.');
  };
  const lock = async (d: Detail) => {
    const locking = !d.user.deleted;
    const r = await confirm({
      title: locking ? 'Khóa tài khoản' : 'Mở khóa tài khoản',
      body: locking ? 'Không đăng nhập được, ẩn trang chia sẻ, thôi gửi thông báo. Dữ liệu giữ nguyên, mở khóa lại được.' : 'Tài khoản dùng lại bình thường.',
      confirmLabel: locking ? 'Khóa' : 'Mở khóa', danger: locking, note: { label: 'Ghi chú', required: locking },
    });
    if (r) await run(async () => setData(await consoleApi.lock(d.user.id, locking, r.note)), locking ? 'Đã khóa.' : 'Đã mở khóa.');
  };

  return (
    <>
      <Link to="/admin/nguoi-dung" className="mb-2 inline-flex items-center gap-1 text-caption text-ink-muted no-underline hover:text-ink"><ChevronLeft size={16} />Người dùng</Link>
      <TableView state={state}>
        {(d) => {
          const u = d.user;
          return (
            <>
              <PageHeader
                title={<span className="flex flex-wrap items-center gap-2">{u.name || u.email || u.phone || shortId(u.id)}<Badge tone={u.role === 'admin' ? 'info' : u.role === 'nursery' ? 'success' : 'neutral'}>{ROLE_LABEL[u.role]}</Badge>{u.deleted ? <Badge tone="danger">Đã khóa</Badge> : null}</span>}
                sub={u.email ?? u.phone ?? u.id}
                actions={<>
                  <Button size="touch" block={false} disabled={busy} onClick={() => adjust(d)}>Cộng / trừ lượt</Button>
                  <Button size="touch" block={false} variant="secondary" disabled={busy || u.deleted} onClick={() => message(d)}><Send size={16} aria-hidden="true" />Nhắn riêng</Button>
                  <label className="flex min-h-touch items-center gap-2 rounded-btn border border-line-strong bg-surface pl-3 text-caption">
                    <span className="text-ink-muted">Vai trò</span>
                    <select value={u.role} onChange={(e) => role(d, e.target.value as Role)} disabled={busy} className="min-h-[42px] bg-transparent pr-2 font-medium">
                      <option value="player">Người chơi</option><option value="nursery">Nhà vườn</option><option value="artisan">Nghệ nhân</option><option value="admin">Quản trị</option>
                    </select>
                  </label>
                  <Button size="touch" block={false} variant={u.deleted ? 'secondary' : 'danger'} disabled={busy} onClick={() => lock(d)}>{u.deleted ? 'Mở khóa' : 'Khóa'}</Button>
                </>} />
              {notice}
              <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <StatCard label="Lượt hiện có" value={u.credits} format={num} hint={d.ledger_balance !== u.credits ? `sổ: ${d.ledger_balance}` : undefined} />
                <StatCard label="Đã trả" value={u.revenue_vnd} format={vnd} />
                <StatCard label="Chi phí AI" value={d.ai_cost_usd} format={usd} />
                <StatCard label="Cây" value={u.trees} format={num} />
                <StatCard label="Phiên" value={u.jobs} format={num} />
                <StatCard label="Lượt trả phí" value={u.paid_jobs} format={num} />
              </div>
              <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)] 3xl:grid-cols-[420px_minmax(0,1fr)]">
                <div className="flex flex-col gap-4 xl:self-start">
                {r?.admin_note ? <Notice tone="warn">{r.admin_note}</Notice> : null}
                <Panel title="Hồ sơ">
                  <KeyValue items={[
                    ['Đăng nhập bằng', u.auth_provider],
                    ['Email', u.email ?? '—'],
                    ['Số điện thoại', u.phone ?? '—'],
                    ['Tên vườn', u.garden_name ?? '—'],
                    ['Đăng ký', dt(u.created_at)],
                    ['Hoạt động gần nhất', dt(u.last_active_at)],
                    ['Đồng ý dùng ảnh', u.consent_training ? `Có · ${dt(d.consent_at)}` : 'Không'],
                    ['Thông báo Zalo', d.notify_zalo ? 'Bật' : 'Tắt'],
                    ['Thiết bị nhận Web Push', String(d.push_devices)],
                    ['Khóa lúc', d.deleted_at ? dt(d.deleted_at) : '—'],
                    ['Trang công khai', r?.public_slug ? <a key="pp" href={`/nguoi/${r.public_slug}`} target="_blank" rel="noreferrer">/nguoi/{r.public_slug}</a> : '—'],
                    ['Đã báo vi phạm', r ? `${r.reports_made} lần` : '—'],
                    ['Mã', <span className="font-mono text-label">{u.id}</span>],
                  ]} />
                </Panel>
                {r ? <NotePanel key={userId} userId={userId} initial={r.admin_note} /> : null}
                </div>
                <div className="min-w-0">
                  <Tabs value={tab} onChange={setTab} tabs={[
                    ['jobs', `Phiên (${d.jobs.length})`], ['ledger', `Sổ lượt (${d.ledger.length})`], ['payments', `Thanh toán (${d.payments.length})`],
                    ['trees', `Cây (${r?.trees.length ?? '…'})`], ['listings', `Tin đăng (${r?.listings.length ?? '…'})`],
                    ['services', `Nghệ nhân & chăm hộ (${r ? r.consults.length + r.care.length : '…'})`],
                    ['reports', <span key="rp" className={r?.reports_against.length ? 'text-danger' : undefined}>Bị báo ({r?.reports_against.length ?? '…'})</span>],
                    ['audit', `Nhật ký (${d.audit.length})`],
                  ]} />
                  <Panel pad={false}>
                    {tab === 'jobs' ? (
                      <DataTable rows={d.jobs} rowKey={(j) => j.id} onRowClick={(j) => navigate(`/admin/phien/${j.id}`)} empty="Chưa có phiên."
                        columns={[
                          { key: 'id', header: 'Phiên', render: (j) => <span className="font-mono">{shortId(j.id)}</span> },
                          { key: 'tree', header: 'Cây', render: (j) => j.tree_nickname ?? '—' },
                          { key: 'st', header: 'Trạng thái', render: (j) => <StatusBadge status={j.status} /> },
                          { key: 'paid', header: 'Trả lượt', render: (j) => j.paid ? <Badge tone="success">Có</Badge> : '—' },
                          { key: 'cost', header: 'Chi phí AI', align: 'right', render: (j) => usd(j.cost_usd) },
                          { key: 'at', header: 'Lúc', align: 'right', render: (j) => dt(j.created_at) },
                        ]} />
                    ) : tab === 'ledger' ? (
                      <DataTable rows={d.ledger} rowKey={(e) => String(e.id)} empty="Sổ lượt trống."
                        columns={[
                          { key: 'at', header: 'Lúc', render: (e) => dt(e.created_at) },
                          { key: 'reason', header: 'Loại', render: (e) => REASON[e.reason] ?? e.reason },
                          { key: 'ref', header: 'Tham chiếu', render: (e) => <span className="font-mono text-label text-ink-muted">{e.ref_id ?? '—'}</span> },
                          { key: 'delta', header: 'Lượt', align: 'right', render: (e) => <span className={cx('font-semibold', e.delta > 0 ? 'text-primary-ink' : 'text-danger')}>{e.delta > 0 ? '+' : ''}{e.delta}</span> },
                        ]} />
                    ) : tab === 'payments' ? (
                      <DataTable rows={d.payments} rowKey={(p) => p.id} onRowClick={(p) => navigate(`/admin/thanh-toan?q=${p.transfer_code}`)} empty="Chưa có thanh toán."
                        columns={[
                          { key: 'at', header: 'Tạo', render: (p) => dt(p.created_at) },
                          { key: 'pkg', header: 'Gói', render: (p) => p.package_code },
                          { key: 'code', header: 'Nội dung CK', render: (p) => <span className="font-mono">{p.transfer_code}</span> },
                          { key: 'st', header: 'Trạng thái', render: (p) => <StatusBadge status={p.status} /> },
                          { key: 'amt', header: 'Số tiền', align: 'right', render: (p) => vnd(p.amount_vnd) },
                        ]} />
                    ) : tab === 'trees' ? (
                      <DataTable rows={r?.trees ?? []} rowKey={(t) => t.id} empty="Chưa có cây."
                        columns={[
                          { key: 'n', header: 'Cây', render: (t) => t.nickname || '—' },
                          { key: 's', header: 'Loài', render: (t) => t.species_key ?? '—' },
                          { key: 'p', header: 'Sổ cây', render: (t) => (t.passport_code ? <a href={`/so-cay/${t.passport_code}`} target="_blank" rel="noreferrer" className="font-mono">{t.passport_code}</a> : '—') },
                          { key: 'st', header: '', render: (t) => (t.stolen ? <Badge tone="danger">Báo mất</Badge> : null) },
                          { key: 'at', header: 'Tạo', align: 'right', render: (t) => dt(t.created_at) },
                        ]} />
                    ) : tab === 'listings' ? (
                      <DataTable rows={r?.listings ?? []} rowKey={(x) => x.id} onRowClick={(x) => navigate(`/admin/cong-dong?tab=listings&q=${x.code}`)} empty="Chưa đăng tin."
                        columns={[
                          { key: 't', header: 'Tin', render: (x) => x.title },
                          { key: 'c', header: 'Mã', render: (x) => <span className="font-mono">{x.code}</span> },
                          { key: 'st', header: 'Trạng thái', render: (x) => <Badge tone={x.status === 'hidden' ? 'warn' : x.status === 'active' ? 'success' : 'neutral'}>{LISTING_VI[x.status] ?? x.status}</Badge> },
                          { key: 'p', header: 'Giá', align: 'right', render: (x) => (x.price_vnd ? vnd(x.price_vnd) : '—') },
                          { key: 'v', header: 'Xem', align: 'right', render: (x) => num(x.views) },
                        ]} />
                    ) : tab === 'services' ? (
                      <DataTable rows={[
                        ...(r?.consults ?? []).map((c) => ({ id: c.id, what: c.role === 'asker' ? 'Hỏi nghệ nhân' : 'Trả lời (nghệ nhân)', text: c.question, status: c.status, at: c.created_at, to: `/admin/hoi-dap/${c.id}` })),
                        ...(r?.care ?? []).map((c) => ({ id: c.id, what: `${c.kind === 'care' ? 'Chăm hộ' : 'Nuôi hộ'} · ${c.role === 'owner' ? 'chủ cây' : 'nhà vườn'}`, text: '', status: c.status, at: c.created_at, to: '/admin/cong-dong?tab=care' })),
                      ].sort((a, b) => b.at.localeCompare(a.at))} rowKey={(x) => x.id} onRowClick={(x) => navigate(x.to)} empty="Chưa dùng dịch vụ."
                        columns={[
                          { key: 'w', header: 'Loại', render: (x) => x.what },
                          { key: 't', header: 'Nội dung', render: (x) => <span className="line-clamp-1 max-w-[380px] text-ink-muted">{x.text || '—'}</span> },
                          { key: 's', header: 'Trạng thái', render: (x) => <Badge>{SERVICE_VI[x.status] ?? x.status}</Badge> },
                          { key: 'at', header: 'Lúc', align: 'right', render: (x) => dt(x.at) },
                        ]} />
                    ) : tab === 'reports' ? (
                      <DataTable rows={r?.reports_against ?? []} rowKey={(x) => x.id} onRowClick={() => navigate('/admin/bao-cao?status=all')} empty="Chưa bị ai báo."
                        columns={[
                          { key: 'k', header: 'Nội dung', render: (x) => x.kind_vi },
                          { key: 'r', header: 'Lý do', render: (x) => <span className="font-medium text-danger">{x.reason_vi}</span> },
                          { key: 'n', header: 'Ghi chú', render: (x) => <span className="text-ink-muted">{x.note ?? '—'}</span> },
                          { key: 's', header: 'Trạng thái', render: (x) => <Badge tone={x.status === 'open' ? 'danger' : 'neutral'}>{x.status === 'open' ? 'Chờ xử lý' : x.status === 'actioned' ? 'Đã ẩn' : 'Không vi phạm'}</Badge> },
                          { key: 'at', header: 'Lúc', align: 'right', render: (x) => dt(x.created_at) },
                        ]} />
                    ) : (
                      <DataTable rows={d.audit} rowKey={(a) => String(a.id)} empty="Chưa có thao tác quản trị nào."
                        columns={[
                          { key: 'at', header: 'Lúc', render: (a) => dt(a.created_at) },
                          { key: 'who', header: 'Quản trị viên', render: (a) => a.admin_email ?? '—' },
                          { key: 'act', header: 'Thao tác', render: (a) => ACTION_VI[a.action] ?? <span className="font-mono text-label">{a.action}</span> },
                          { key: 'detail', header: 'Chi tiết', render: (a) => <span className="text-label text-ink-muted">{a.detail ? Object.entries(a.detail).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${String(v)}`).join(' · ') : '—'}</span> },
                        ]} />
                    )}
                  </Panel>
                </div>
              </div>
            </>
          );
        }}
      </TableView>
      {dialog}
    </>
  );
}
