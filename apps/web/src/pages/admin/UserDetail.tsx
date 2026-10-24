import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui';
import { consoleApi, type Role, type UserDetail as Detail } from '@/lib/adminConsole';
import { cx } from '@/lib/cx';
import {
  Badge, DataTable, KeyValue, PageHeader, Panel, ROLE_LABEL, StatCard, StatusBadge, Tabs, TableView, dt, num, shortId, usd, useAction, useConfirm, useLoad, vnd,
} from './kit';

type Tab = 'jobs' | 'ledger' | 'payments' | 'audit';
const REASON: Record<string, string> = { purchase: 'Mua', render: 'Dùng', refund: 'Hoàn', gift: 'Tặng', adjust: 'Điều chỉnh' };

export default function UserDetail() {
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('jobs');
  const [state, , setData] = useLoad(() => consoleApi.user(userId), [userId]);
  const [confirm, dialog] = useConfirm();
  const [run, notice, busy] = useAction();

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
                <Panel title="Hồ sơ" className="xl:self-start">
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
                    ['Mã', <span className="font-mono text-label">{u.id}</span>],
                  ]} />
                </Panel>
                <div className="min-w-0">
                  <Tabs value={tab} onChange={setTab} tabs={[['jobs', `Phiên (${d.jobs.length})`], ['ledger', `Sổ lượt (${d.ledger.length})`], ['payments', `Thanh toán (${d.payments.length})`], ['audit', `Nhật ký (${d.audit.length})`]]} />
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
                    ) : (
                      <DataTable rows={d.audit} rowKey={(a) => String(a.id)} empty="Chưa có thao tác quản trị nào."
                        columns={[
                          { key: 'at', header: 'Lúc', render: (a) => dt(a.created_at) },
                          { key: 'who', header: 'Quản trị viên', render: (a) => a.admin_email ?? '—' },
                          { key: 'act', header: 'Thao tác', render: (a) => <span className="font-mono text-label">{a.action}</span> },
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
