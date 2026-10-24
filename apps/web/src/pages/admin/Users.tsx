import { Gift } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { consoleApi } from '@/lib/adminConsole';
import { ExportButton } from './ExportButton';
import { Badge, DataTable, PageHeader, Pagination, Panel, ROLE_LABEL, SearchBox, Select, TableView, Toolbar, dt, num, useAction, useConfirm, useLoad, useUrlState, vnd } from './kit';

export default function Users() {
  const navigate = useNavigate();
  const [f, setF] = useUrlState({ q: '', role: '', state: 'active', consent: '', paying: '', sort: 'created_desc', offset: '0' });
  const [state, reload] = useLoad(
    () => consoleApi.users({ q: f.q, role: f.role, state: f.state, consent: f.consent, paying: f.paying, sort: f.sort, offset: f.offset, limit: 50 }),
    [f.q, f.role, f.state, f.consent, f.paying, f.sort, f.offset],
  );
  const [confirm, dialog] = useConfirm();
  const [run, notice, busy] = useAction();

  const gift = async () => {
    const r = await confirm({
      title: 'Tặng lượt dùng thử',
      body: 'Mỗi email một dòng (hoặc cách nhau dấu phẩy). Người nhận cần đăng nhập ít nhất 1 lần. Mỗi người nhận 1 lần mỗi đợt.',
      confirmLabel: 'Tặng lượt',
      fields: [{ name: 'credits', label: 'Số lượt mỗi người', type: 'number', required: true, defaultValue: '3' },
        { name: 'batch', label: 'Mã đợt', required: true, defaultValue: 'beta-1', placeholder: 'beta-1' }],
      note: { label: 'Danh sách email', required: true, placeholder: 'a@gmail.com\nb@gmail.com' },
    });
    if (!r) return;
    const emails = r.note.split(/[\s,;]+/).filter(Boolean);
    await run(async () => {
      const out = await consoleApi.bulkGift(emails, Number(r.values.credits), r.values.batch);
      reload();
      if (out.not_found.length || out.already.length) {
        throw new Error(`Đã tặng ${out.credited.length}. Đã nhận đợt này: ${out.already.join(', ') || '—'}. Chưa có tài khoản: ${out.not_found.join(', ') || '—'}.`);
      }
    }, `Đã tặng lượt cho ${emails.length} người.`);
  };

  return (
    <>
      <PageHeader title="Người dùng" sub="Tìm theo email, tên, số điện thoại, tên vườn"
        actions={<>
          <ExportButton kind="users" params={{ q: f.q, role: f.role, state: f.state }} />
          <Button size="touch" block={false} variant="secondary" onClick={gift} disabled={busy}><Gift size={16} aria-hidden="true" />Tặng lượt</Button>
        </>} />
      {notice}
      <Toolbar>
        <SearchBox value={f.q} onChange={(q) => setF({ q })} placeholder="Email, tên, SĐT, tên vườn" />
        <Select label="Vai trò" value={f.role} onChange={(role) => setF({ role })} options={[['', 'Tất cả'], ['player', 'Người chơi'], ['nursery', 'Nhà vườn'], ['admin', 'Quản trị']]} />
        <Select label="Tài khoản" value={f.state} onChange={(s) => setF({ state: s })} options={[['active', 'Đang dùng'], ['deleted', 'Đã khóa / xóa'], ['all', 'Tất cả']]} />
        <Select label="Đã trả tiền" value={f.paying} onChange={(paying) => setF({ paying })} options={[['', 'Tất cả'], ['true', 'Có'], ['false', 'Chưa']]} />
        <Select label="Đồng ý ảnh" value={f.consent} onChange={(consent) => setF({ consent })} options={[['', 'Tất cả'], ['true', 'Có'], ['false', 'Không']]} />
        <Select label="Sắp xếp" value={f.sort} onChange={(sort) => setF({ sort })} options={[['created_desc', 'Mới đăng ký'], ['active_desc', 'Hoạt động gần'], ['revenue_desc', 'Chi tiêu nhiều'], ['credits_desc', 'Nhiều lượt']]} />
      </Toolbar>
      <Panel pad={false}>
        <TableView state={state}>
          {(page) => (
            <>
              <DataTable rows={page.items} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/admin/nguoi-dung/${r.id}`)} empty="Không có người dùng nào khớp."
                columns={[
                  { key: 'who', header: 'Người dùng', render: (r) => (
                    <span className="flex min-w-[200px] flex-col">
                      <span className="font-medium">{r.name || r.email || r.phone || '—'}</span>
                      <span className="text-label text-ink-subtle">{r.email ?? r.phone ?? r.auth_provider}</span>
                    </span>
                  ) },
                  { key: 'role', header: 'Vai trò', render: (r) => <span className="flex flex-wrap gap-1"><Badge tone={r.role === 'admin' ? 'info' : r.role === 'nursery' ? 'success' : 'neutral'}>{ROLE_LABEL[r.role]}</Badge>{r.deleted ? <Badge tone="danger">Đã khóa</Badge> : null}</span> },
                  { key: 'garden', header: 'Vườn', render: (r) => r.garden_name ?? '—' },
                  { key: 'phone', header: 'SĐT', className: 'hidden 3xl:table-cell', render: (r) => r.phone ?? '—' },
                  { key: 'login', header: 'Đăng nhập', className: 'hidden 3xl:table-cell', render: (r) => r.auth_provider },
                  { key: 'consent', header: 'Đồng ý ảnh', className: 'hidden 3xl:table-cell', render: (r) => r.consent_training ? 'Có' : '—' },
                  { key: 'credits', header: 'Lượt', align: 'right', render: (r) => num(r.credits) },
                  { key: 'jobs', header: 'Phiên / trả', align: 'right', render: (r) => `${num(r.jobs)} / ${num(r.paid_jobs)}` },
                  { key: 'rev', header: 'Đã trả', align: 'right', render: (r) => r.revenue_vnd ? vnd(r.revenue_vnd) : '—' },
                  { key: 'last', header: 'Hoạt động', render: (r) => dt(r.last_active_at) },
                  { key: 'created', header: 'Đăng ký', render: (r) => dt(r.created_at) },
                ]} />
              <Pagination total={page.total} limit={page.limit} offset={page.offset} onChange={(o) => setF({ offset: String(o) })} />
            </>
          )}
        </TableView>
      </Panel>
      {dialog}
    </>
  );
}
