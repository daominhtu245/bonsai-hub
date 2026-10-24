import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { consoleApi, type PaymentRow } from '@/lib/adminConsole';
import { ExportButton } from './ExportButton';
import { DataTable, JsonBlock, KeyValue, PageHeader, Pagination, Panel, SearchBox, Select, StatCard, StatusBadge, TableView, Toolbar, dt, num, useAction, useConfirm, useLoad, useUrlState, vnd } from './kit';

function Detail({ p, onChanged }: { p: PaymentRow; onChanged: () => void }) {
  const [state, , setData] = useLoad(() => consoleApi.payment(p.id), [p.id]);
  const [confirm, dialog] = useConfirm();
  const [run, notice, busy] = useAction();
  const open = p.status === 'pending' || p.status === 'expired';

  const confirmPaid = async () => {
    const r = await confirm({
      title: 'Xác nhận đã nhận tiền',
      body: <>Chỉ xác nhận sau khi đối chiếu sao kê: {vnd(p.amount_vnd)}, nội dung gần đúng <b className="font-mono">{p.transfer_code}</b>. Người dùng được cộng {p.credits} lượt.</>,
      confirmLabel: 'Xác nhận và cộng lượt',
      fields: [{ name: 'bank_ref', label: 'Mã giao dịch trên sao kê', required: true, placeholder: 'FT24…' }],
      note: { label: 'Ghi chú' },
    });
    if (r) await run(async () => { setData(await consoleApi.confirmPayment(p.id, r.values.bank_ref, r.note)); onChanged(); }, 'Đã ghi nhận thanh toán.');
  };
  const cancel = async () => {
    const r = await confirm({ title: 'Hủy đơn', confirmLabel: 'Hủy đơn', danger: true, note: { label: 'Lý do' } });
    if (r) await run(async () => { setData(await consoleApi.cancelPayment(p.id, r.note)); onChanged(); }, 'Đã hủy đơn.');
  };

  return (
    <Panel title={<span className="font-mono">{p.transfer_code}</span>} className="xl:sticky xl:top-[76px] xl:self-start">
      {notice}
      <TableView state={state}>
        {(d) => (
          <div className="flex flex-col gap-3">
            <KeyValue items={[
              ['Trạng thái', <StatusBadge status={d.payment.status} />],
              ['Người dùng', <Link to={`/admin/nguoi-dung/${d.payment.user_id}`}>{d.payment.user_email ?? d.payment.user_id}</Link>],
              ['Gói', `${d.payment.package_name} · ${d.payment.credits} lượt`],
              ['Số tiền', vnd(d.payment.amount_vnd)],
              ['Nhận thiếu', d.payment.underpaid_vnd != null ? vnd(d.payment.underpaid_vnd) : '—'],
              ['Tạo lúc', dt(d.payment.created_at)],
              ['Thanh toán lúc', dt(d.payment.paid_at)],
              ['Nguồn', d.payment.provider ?? '—'],
              ['Mã giao dịch', d.payment.provider_txn_id ? <span className="font-mono text-label">{d.payment.provider_txn_id}</span> : '—'],
            ]} />
            <JsonBlock data={d.raw} label="Dữ liệu webhook / ghi chú" />
            {open ? (
              <div className="flex flex-wrap gap-2">
                <Button size="touch" block={false} disabled={busy} onClick={confirmPaid}>Xác nhận đã nhận tiền</Button>
                <Button size="touch" block={false} variant="danger" disabled={busy} onClick={cancel}>Hủy đơn</Button>
              </div>
            ) : null}
          </div>
        )}
      </TableView>
      {dialog}
    </Panel>
  );
}

export default function Payments() {
  const [f, setF] = useUrlState({ q: '', status: '', provider: '', days: '30', offset: '0' });
  const [state, reload] = useLoad(
    () => consoleApi.payments({ q: f.q, status: f.status, provider: f.provider, days: f.days, offset: f.offset, limit: 50 }),
    [f.q, f.status, f.provider, f.days, f.offset],
  );
  const [sel, setSel] = useState<PaymentRow | null>(null);
  return (
    <>
      <PageHeader title="Thanh toán" sub="Đối soát chuyển khoản VietQR (SePay / Casso) và xác nhận tay"
        actions={<ExportButton kind="payments" params={{ q: f.q, status: f.status, provider: f.provider, days: f.days }} />} />
      {state.status === 'ready' ? (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 3xl:grid-cols-6">
          <StatCard label={`Doanh thu ${f.days} ngày`} value={state.data.revenue_vnd} format={vnd} />
          <StatCard label="Đơn chờ thanh toán" value={state.data.pending} format={num} />
          {state.data.by_package.map((p) => <StatCard key={p.package_code} label={`Gói ${p.package_name}`} value={p.revenue_vnd} format={vnd} hint={`${num(p.orders)} đơn`} />)}
        </div>
      ) : null}
      <Toolbar>
        <SearchBox value={f.q} onChange={(q) => setF({ q })} placeholder="Nội dung CK, email, mã giao dịch" />
        <Select label="Trạng thái" value={f.status} onChange={(status) => setF({ status })} options={[['', 'Tất cả'], ['pending', 'Chờ'], ['paid', 'Đã thanh toán'], ['expired', 'Hết hạn'], ['cancelled', 'Đã hủy']]} />
        <Select label="Nguồn" value={f.provider} onChange={(provider) => setF({ provider })} options={[['', 'Tất cả'], ['sepay', 'SePay'], ['casso', 'Casso'], ['manual', 'Xác nhận tay']]} />
        <Select label="Thời gian" value={f.days} onChange={(days) => setF({ days })} options={[['7', '7 ngày'], ['30', '30 ngày'], ['90', '90 ngày'], ['365', '1 năm']]} />
      </Toolbar>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 3xl:grid-cols-[minmax(0,1fr)_480px]">
        <Panel pad={false}>
          <TableView state={state}>
            {(page) => (
              <>
                <DataTable rows={page.items} rowKey={(r) => r.id} onRowClick={setSel} empty="Không có thanh toán nào."
                  columns={[
                    { key: 'at', header: 'Tạo', render: (r) => dt(r.created_at) },
                    { key: 'code', header: 'Nội dung CK', render: (r) => <span className="font-mono">{r.transfer_code}</span> },
                    { key: 'user', header: 'Người dùng', render: (r) => <span className="block max-w-[200px] truncate">{r.user_email ?? '—'}</span> },
                    { key: 'pkg', header: 'Gói', render: (r) => r.package_name },
                    { key: 'st', header: 'Trạng thái', render: (r) => <StatusBadge status={r.status} /> },
                    { key: 'src', header: 'Nguồn', render: (r) => r.provider ?? '—' },
                    { key: 'paid', header: 'Thanh toán lúc', className: 'hidden 3xl:table-cell', render: (r) => dt(r.paid_at) },
                    { key: 'txn', header: 'Mã giao dịch', className: 'hidden 3xl:table-cell', render: (r) => <span className="font-mono text-label text-ink-muted">{r.provider_txn_id ?? '—'}</span> },
                    { key: 'amt', header: 'Số tiền', align: 'right', render: (r) => vnd(r.amount_vnd) },
                  ]} />
                <Pagination total={page.total} limit={page.limit} offset={page.offset} onChange={(o) => setF({ offset: String(o) })} />
              </>
            )}
          </TableView>
        </Panel>
        {sel ? <Detail key={sel.id} p={sel} onChanged={reload} /> : (
          <Panel className="xl:self-start"><span className="text-caption text-ink-muted">Chọn một thanh toán để xem chi tiết và xác nhận tay.</span></Panel>
        )}
      </div>
    </>
  );
}
