import { useNavigate } from 'react-router-dom';
import { consoleApi } from '@/lib/adminConsole';
import { SPECIES_NAME } from '@/lib/copy';
import { ExportButton } from './ExportButton';
import { Badge, DataTable, PageHeader, Pagination, Panel, SearchBox, Select, StatusBadge, TableView, Toolbar, dt, dur, shortId, usd, useLoad, useUrlState } from './kit';

const STATUS_OPTS: Array<[string, string]> = [
  ['', 'Tất cả'], ['active', 'Đang chạy'], ['stuck', 'Bị treo'], ['failed', 'Lỗi'], ['awaiting_choice', 'Chờ chọn'], ['done', 'Xong'],
];

export default function Jobs() {
  const navigate = useNavigate();
  const [f, setF] = useUrlState({ q: '', status: '', paid: '', days: '', sort: 'created_desc', offset: '0', user_id: '' });
  const [state] = useLoad(
    () => consoleApi.jobs({ q: f.q, status: f.status, paid: f.paid, days: f.days, sort: f.sort, offset: f.offset, user_id: f.user_id, limit: 50 }),
    [f.q, f.status, f.paid, f.days, f.sort, f.offset, f.user_id],
  );
  return (
    <>
      <PageHeader title="Phiên thiết kế" sub="Tra cứu mọi phiên phân tích / tạo ảnh, chi phí và lỗi"
        actions={<ExportButton kind="jobs" params={{ q: f.q, status: f.status, paid: f.paid, days: f.days }} />} />
      <Toolbar>
        <SearchBox value={f.q} onChange={(q) => setF({ q })} placeholder="Email, tên cây, mã phiên, mã lỗi" />
        <Select label="Trạng thái" value={f.status} onChange={(status) => setF({ status })} options={STATUS_OPTS} />
        <Select label="Trả lượt" value={f.paid} onChange={(paid) => setF({ paid })} options={[['', 'Tất cả'], ['true', 'Có'], ['false', 'Không']]} />
        <Select label="Thời gian" value={f.days} onChange={(days) => setF({ days })} options={[['', 'Mọi lúc'], ['1', '24 giờ'], ['7', '7 ngày'], ['30', '30 ngày']]} />
        <Select label="Sắp xếp" value={f.sort} onChange={(sort) => setF({ sort })} options={[['created_desc', 'Mới nhất'], ['created_asc', 'Cũ nhất'], ['cost_desc', 'Tốn nhất']]} />
        {f.user_id ? <button type="button" className="min-h-touch rounded-btn px-3 text-caption text-ink-muted hover:bg-surface-2" onClick={() => setF({ user_id: '' })}>Bỏ lọc người dùng ×</button> : null}
      </Toolbar>
      <Panel pad={false}>
        <TableView state={state}>
          {(page) => (
            <>
              <DataTable rows={page.items} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/admin/phien/${r.id}`)} empty="Không có phiên nào khớp bộ lọc."
                columns={[
                  { key: 'id', header: 'Phiên', render: (r) => <span className="font-mono">{shortId(r.id)}</span> },
                  { key: 'at', header: 'Tạo lúc', render: (r) => dt(r.created_at) },
                  { key: 'user', header: 'Người dùng', render: (r) => <span className="block max-w-[220px] truncate">{r.user_email ?? '—'}</span> },
                  { key: 'tree', header: 'Cây', render: (r) => <span className="block max-w-[180px] truncate">{r.tree_nickname || '—'}{r.species_key ? <span className="text-ink-subtle"> · {SPECIES_NAME[r.species_key] ?? r.species_key}</span> : null}</span> },
                  { key: 'st', header: 'Trạng thái', render: (r) => <span className="flex flex-wrap items-center gap-1"><StatusBadge status={r.status} stuck={r.stuck} />{r.error_code ? <span className="font-mono text-label text-ink-subtle">{r.error_code}</span> : null}</span> },
                  { key: 'paid', header: 'Trả lượt', render: (r) => r.paid ? <Badge tone="success">Có</Badge> : <span className="text-ink-subtle">—</span> },
                  { key: 'mode', header: 'Chế độ', render: (r) => r.cost_mode ?? '—' },
                  { key: 'pv', header: 'Prompt', className: 'hidden 3xl:table-cell', render: (r) => <span className="font-mono text-label text-ink-muted">{r.prompt_version ?? '—'}</span> },
                  { key: 'dur', header: 'Thời gian', align: 'right', render: (r) => dur(r.duration_s) },
                  { key: 'cost', header: 'Chi phí AI', align: 'right', render: (r) => usd(r.cost_usd) },
                ]} />
              <Pagination total={page.total} limit={page.limit} offset={page.offset} onChange={(o) => setF({ offset: String(o) })} />
            </>
          )}
        </TableView>
      </Panel>
    </>
  );
}
