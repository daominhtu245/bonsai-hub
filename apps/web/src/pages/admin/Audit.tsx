import { Link } from 'react-router-dom';
import { consoleApi, type AuditRow } from '@/lib/adminConsole';
import { DataTable, PageHeader, Pagination, Panel, SearchBox, Select, TableView, Toolbar, dt, useLoad, useUrlState } from './kit';

const ACTIONS: Array<[string, string]> = [
  ['', 'Tất cả'], ['user', 'Người dùng'], ['credits', 'Tặng lượt'], ['job', 'Phiên'], ['payment', 'Thanh toán'],
  ['settings', 'Cấu hình'], ['prompt', 'Prompt'], ['catalog', 'Danh mục'],
];
const ACTION_VI: Record<string, string> = {
  'user.role': 'Đổi vai trò', 'user.credits': 'Cộng/trừ lượt', 'user.lock': 'Khóa tài khoản', 'user.unlock': 'Mở khóa',
  'credits.gift': 'Tặng lượt', 'credits.bulk_gift': 'Tặng lượt hàng loạt', 'job.retry': 'Chạy lại phiên', 'job.refund': 'Hoàn lượt',
  'job.fail': 'Dừng phiên', 'payment.confirm': 'Xác nhận thanh toán', 'payment.cancel': 'Hủy đơn', 'settings.update': 'Đổi cấu hình',
  'prompt.create': 'Tạo prompt', 'prompt.activate': 'Kích hoạt prompt', 'catalog.species': 'Sửa loài', 'catalog.style': 'Sửa thế',
};

function target(a: AuditRow) {
  if (!a.target_id) return '—';
  if (a.target_type === 'user') return <Link to={`/admin/nguoi-dung/${a.target_id}`} className="font-mono">{a.target_id.slice(0, 8)}</Link>;
  if (a.target_type === 'job') return <Link to={`/admin/phien/${a.target_id}`} className="font-mono">{a.target_id.slice(0, 8)}</Link>;
  return <span className="font-mono">{a.target_id.length > 24 ? `${a.target_id.slice(0, 8)}…` : a.target_id}</span>;
}

function detail(a: AuditRow) {
  if (!a.detail) return '—';
  return Object.entries(a.detail).filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ');
}

export default function Audit() {
  const [f, setF] = useUrlState({ action: '', admin: '', target_id: '', offset: '0' });
  const [state] = useLoad(() => consoleApi.audit({ action: f.action, admin: f.admin, target_id: f.target_id, offset: f.offset, limit: 50 }), [f.action, f.admin, f.target_id, f.offset]);
  return (
    <>
      <PageHeader title="Nhật ký quản trị" sub="Mọi thao tác thay đổi dữ liệu của quản trị viên, không sửa / xóa được" />
      <Toolbar>
        <Select label="Loại" value={f.action} onChange={(action) => setF({ action })} options={ACTIONS} />
        <SearchBox value={f.admin} onChange={(admin) => setF({ admin })} placeholder="Email quản trị viên" />
        <SearchBox value={f.target_id} onChange={(target_id) => setF({ target_id })} placeholder="Mã đối tượng (người dùng, phiên…)" />
      </Toolbar>
      <Panel pad={false}>
        <TableView state={state}>
          {(page) => (
            <>
              <DataTable rows={page.items} rowKey={(a) => String(a.id)} empty="Chưa có thao tác nào."
                columns={[
                  { key: 'at', header: 'Lúc', render: (a) => <span className="whitespace-nowrap">{dt(a.created_at)}</span> },
                  { key: 'who', header: 'Quản trị viên', render: (a) => a.admin_email ?? '—' },
                  { key: 'act', header: 'Thao tác', render: (a) => ACTION_VI[a.action] ?? a.action },
                  { key: 'target', header: 'Đối tượng', render: target },
                  { key: 'detail', header: 'Chi tiết', render: (a) => <span className="block max-w-[520px] break-words text-label text-ink-muted">{detail(a)}</span> },
                ]} />
              <Pagination total={page.total} limit={page.limit} offset={page.offset} onChange={(o) => setF({ offset: String(o) })} />
            </>
          )}
        </TableView>
      </Panel>
    </>
  );
}
