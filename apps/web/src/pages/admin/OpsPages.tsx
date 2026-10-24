// Quản trị vận hành: cấu hình chạy + gói bán, mã quà tặng, gửi thông báo hàng loạt.
import { useEffect, useState, type FormEvent } from 'react';
import { Bell, Plus } from 'lucide-react';
import { Button, Notice } from '@/components/ui';
import { consoleApi, type GiftCodeRow, type Ops, type PackageAdmin } from '@/lib/adminConsole';
import { cx } from '@/lib/cx';
import { Badge, DataTable, PageHeader, Panel, TableView, dt, num, useAction, useConfirm, useLoad, vnd } from './kit';

const input = 'min-h-touch w-full rounded-btn border border-line-strong bg-surface px-3 text-body text-ink';

function Switch({ label, hint, checked, onChange, danger }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <label className={cx('flex min-h-[56px] items-center gap-3 rounded-btn border px-3', checked && danger ? 'border-danger bg-danger-soft' : 'border-line')}>
      <span className="flex-1">
        <span className="block text-caption font-medium">{label}</span>
        {hint ? <span className="block text-label text-ink-muted">{hint}</span> : null}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="switch" />
    </label>
  );
}

function OpsForm({ ops, onSaved }: { ops: Ops; onSaved: (o: Ops) => void }) {
  const [f, setF] = useState(ops);
  const [run, notice, busy] = useAction();
  const [confirm, dialog] = useConfirm();
  useEffect(() => setF(ops), [ops]);
  const dirty = JSON.stringify(f) !== JSON.stringify(ops);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const pausing = (f.pause_analysis && !ops.pause_analysis) || (f.pause_render && !ops.pause_render);
    if (pausing && !(await confirm({ title: 'Tạm dừng dịch vụ?', body: 'Người dùng sẽ thấy thông báo bảo trì khi bấm phân tích / tạo ảnh. Phiên đang chạy vẫn chạy tiếp.', confirmLabel: 'Tạm dừng', danger: true }))) return;
    await run(async () => onSaved(await consoleApi.saveOps(f)), 'Đã lưu. Áp dụng ngay.');
  };
  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      {notice}
      <div className="grid gap-3 md:grid-cols-2">
        <Switch label="Tạm dừng phân tích phôi" hint="Chặn tạo phiên mới" checked={f.pause_analysis} danger onChange={(v) => setF({ ...f, pause_analysis: v })} />
        <Switch label="Tạm dừng tạo ảnh" hint="Chặn trả lượt tạo ảnh tương lai" checked={f.pause_render} danger onChange={(v) => setF({ ...f, pause_render: v })} />
      </div>
      <label className="flex flex-col gap-1 text-caption font-medium">Câu thông báo khi tạm dừng
        <input className={input} value={f.pause_message} onChange={(e) => setF({ ...f, pause_message: e.target.value })} maxLength={200} />
      </label>

      <fieldset className="m-0 flex flex-col gap-3 rounded-card border border-line p-4">
        <legend className="px-1 text-caption font-semibold">Thông báo chung (trang chủ người dùng)</legend>
        <Switch label="Hiện thông báo" checked={f.announcement.active} onChange={(v) => setF({ ...f, announcement: { ...f.announcement, active: v } })} />
        <label className="flex flex-col gap-1 text-caption font-medium">Nội dung
          <textarea rows={2} maxLength={300} className="rounded-btn border border-line-strong bg-surface p-2 text-body"
            value={f.announcement.text} onChange={(e) => setF({ ...f, announcement: { ...f.announcement, text: e.target.value } })}
            placeholder="VD: Tặng 1 lượt khi nhập mã TET2027 đến hết 15/2." />
        </label>
        <div className="flex flex-wrap items-center gap-2 text-caption">
          <span className="text-ink-muted">Kiểu</span>
          {(['info', 'success', 'warn'] as const).map((t) => (
            <button key={t} type="button" aria-pressed={f.announcement.tone === t} onClick={() => setF({ ...f, announcement: { ...f.announcement, tone: t } })}
              className={cx('min-h-[36px] rounded-btn border px-3', f.announcement.tone === t ? 'border-ink font-semibold' : 'border-line text-ink-muted')}>
              {{ info: 'Thông tin', success: 'Tin vui', warn: 'Lưu ý' }[t]}
            </button>
          ))}
        </div>
        {f.announcement.text ? <div><div className="mb-1 text-label text-ink-subtle">Xem trước</div><Notice tone={f.announcement.tone}>{f.announcement.text}</Notice></div> : null}
      </fieldset>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-caption font-medium">Lượt tặng khi đăng ký
          <input type="number" min={0} max={20} className={input} value={f.trial_credits} onChange={(e) => setF({ ...f, trial_credits: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium">Phân tích tối đa / người / ngày
          <input type="number" min={1} max={200} className={input} value={f.phase_a_daily_limit} onChange={(e) => setF({ ...f, phase_a_daily_limit: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium">Tỉ giá quy đổi (đ / USD)
          <input type="number" min={10000} max={50000} step={100} className={input} value={f.usd_vnd_rate} onChange={(e) => setF({ ...f, usd_vnd_rate: Number(e.target.value) })} />
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="touch" block={false} loading={busy} disabled={!dirty}>Lưu thay đổi</Button>
        {dirty ? <Button variant="ghost" size="touch" block={false} onClick={() => setF(ops)}>Hủy</Button> : null}
      </div>
      {dialog}
    </form>
  );
}

function PackagesTable() {
  const [state, , setData] = useLoad(() => consoleApi.packages());
  const [confirm, dialog] = useConfirm();
  const [run, notice] = useAction();
  const edit = async (p: PackageAdmin) => {
    const r = await confirm({
      title: `Sửa gói ${p.name_vi}`, confirmLabel: 'Lưu gói', body: 'Đơn đã tạo giữ giá và số lượt cũ.',
      fields: [
        { name: 'name_vi', label: 'Tên gói', required: true, defaultValue: p.name_vi },
        { name: 'credits', label: 'Số lượt', type: 'number', required: true, defaultValue: String(p.credits) },
        { name: 'amount_vnd', label: 'Giá (đ)', type: 'number', required: true, defaultValue: String(p.amount_vnd) },
        { name: 'note_vi', label: 'Mô tả ngắn', defaultValue: p.note_vi },
      ],
    });
    if (r) await run(async () => setData(await consoleApi.savePackage(p.code, {
      name_vi: r.values.name_vi, credits: Number(r.values.credits), amount_vnd: Number(r.values.amount_vnd), note_vi: r.values.note_vi,
    })), 'Đã lưu gói.');
  };
  return (
    <Panel title="Gói bán" pad={false}>
      {notice ? <div className="px-4 pt-3">{notice}</div> : null}
      <TableView state={state}>
        {(rows) => (
          <DataTable rows={rows} rowKey={(p) => p.code}
            columns={[
              { key: 'name', header: 'Gói', render: (p) => <span className="flex items-center gap-2 font-medium">{p.name_vi}{p.popular ? <Badge tone="success">Nổi bật</Badge> : null}</span> },
              { key: 'credits', header: 'Lượt', align: 'right', render: (p) => num(p.credits) },
              { key: 'price', header: 'Giá', align: 'right', render: (p) => vnd(p.amount_vnd) },
              { key: 'per', header: 'Mỗi lượt', align: 'right', render: (p) => vnd(Math.round(p.amount_vnd / p.credits)) },
              { key: 'sold', header: 'Bán 30 ngày', align: 'right', render: (p) => num(p.sold_30d) },
              { key: 'note', header: 'Mô tả', render: (p) => <span className="text-ink-muted">{p.note_vi}</span> },
              { key: 'active', header: 'Đang bán', render: (p) => (
                <input type="checkbox" role="switch" className="switch" checked={p.active} aria-label={`Bán gói ${p.name_vi}`}
                  onChange={(e) => run(async () => setData(await consoleApi.savePackage(p.code, { active: e.target.checked })), e.target.checked ? 'Đã mở bán.' : 'Đã ngừng bán.')} />
              ) },
              { key: 'edit', header: '', align: 'right', render: (p) => <Button variant="ghost" size="touch" block={false} onClick={() => edit(p)}>Sửa</Button> },
            ]} />
        )}
      </TableView>
      {dialog}
    </Panel>
  );
}

export function OpsPage() {
  const [state, , setData] = useLoad(() => consoleApi.ops());
  return (
    <>
      <PageHeader title="Cấu hình vận hành" sub="Áp dụng ngay, không cần khởi động lại; mọi thay đổi ghi nhật ký" />
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Dịch vụ">
          <TableView state={state}>{(ops) => <OpsForm ops={ops} onSaved={setData} />}</TableView>
        </Panel>
        <PackagesTable />
      </div>
    </>
  );
}

// ---------- mã quà tặng ----------

const GC_STATUS: Record<GiftCodeRow['status'], [string, 'success' | 'neutral' | 'warn' | 'danger']> = {
  active: ['Đang dùng', 'success'], expired: ['Hết hạn', 'neutral'], used_up: ['Hết lượt', 'warn'], disabled: ['Đã tắt', 'danger'],
};

function Redemptions({ code }: { code: string }) {
  const [state] = useLoad(() => consoleApi.redemptions(code), [code]);
  return (
    <Panel title={<>Người đã dùng <span className="font-mono">{code}</span></>} pad={false} className="xl:sticky xl:top-[76px] xl:self-start">
      <TableView state={state}>
        {(rows) => <DataTable rows={rows} rowKey={(r) => r.user_id} empty="Chưa ai dùng." dense
          columns={[{ key: 'e', header: 'Email', render: (r) => r.email ?? r.user_id }, { key: 'at', header: 'Lúc', align: 'right', render: (r) => dt(r.at) }]} />}
      </TableView>
    </Panel>
  );
}

export function GiftCodesPage() {
  const [state, reload] = useLoad(() => consoleApi.giftCodes());
  const [sel, setSel] = useState<string | null>(null);
  const [confirm, dialog] = useConfirm();
  const [run, notice, busy] = useAction();
  const create = async () => {
    const r = await confirm({
      title: 'Tạo mã quà tặng', confirmLabel: 'Tạo mã', body: 'Để trống mã thì hệ thống tự sinh. Mỗi người dùng một mã chỉ nhận một lần.',
      fields: [
        { name: 'code', label: 'Mã (chữ không dấu, số, gạch ngang)', placeholder: 'TET2027' },
        { name: 'credits', label: 'Số lượt mỗi người', type: 'number', required: true, defaultValue: '1' },
        { name: 'max_uses', label: 'Tổng số người được dùng (trống = không giới hạn)', type: 'number' },
        { name: 'days', label: 'Hết hạn sau (ngày, trống = không hạn)', type: 'number' },
      ],
      note: { label: 'Ghi chú (vd. đợt khuyến mãi)' },
    });
    if (!r) return;
    const days = Number(r.values.days);
    await run(async () => {
      const g = await consoleApi.createGiftCode({
        code: r.values.code.trim() || undefined, credits: Number(r.values.credits),
        max_uses: r.values.max_uses ? Number(r.values.max_uses) : null,
        expires_at: days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null, note: r.note || undefined,
      });
      setSel(g.code);
      reload();
    }, 'Đã tạo mã.');
  };
  return (
    <>
      <PageHeader title="Mã quà tặng" sub="Người dùng nhập mã ở Tài khoản hoặc Mua lượt để nhận lượt"
        actions={<Button size="touch" block={false} onClick={create} disabled={busy}><Plus size={16} aria-hidden="true" />Tạo mã</Button>} />
      {notice}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 3xl:grid-cols-[minmax(0,1fr)_480px]">
        <Panel pad={false}>
          <TableView state={state}>
            {(rows) => (
              <DataTable rows={rows} rowKey={(g) => g.code} onRowClick={(g) => setSel(g.code)} empty="Chưa có mã nào."
                columns={[
                  { key: 'code', header: 'Mã', render: (g) => <span className={cx('font-mono font-semibold', sel === g.code && 'underline')}>{g.code}</span> },
                  { key: 'st', header: 'Trạng thái', render: (g) => <Badge tone={GC_STATUS[g.status][1]}>{GC_STATUS[g.status][0]}</Badge> },
                  { key: 'cr', header: 'Lượt / người', align: 'right', render: (g) => num(g.credits) },
                  { key: 'used', header: 'Đã dùng', align: 'right', render: (g) => `${num(g.used)}${g.max_uses ? ` / ${num(g.max_uses)}` : ''}` },
                  { key: 'exp', header: 'Hết hạn', render: (g) => dt(g.expires_at) },
                  { key: 'note', header: 'Ghi chú', className: 'hidden 2xl:table-cell', render: (g) => <span className="text-ink-muted">{g.note ?? '—'}</span> },
                  { key: 'on', header: 'Bật', render: (g) => (
                    <input type="checkbox" role="switch" className="switch" checked={g.active} aria-label={`Bật mã ${g.code}`}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => run(async () => { await consoleApi.updateGiftCode(g.code, { active: e.target.checked }); reload(); }, e.target.checked ? 'Đã bật mã.' : 'Đã tắt mã.')} />
                  ) },
                ]} />
            )}
          </TableView>
        </Panel>
        {sel ? <Redemptions code={sel} /> : <Panel className="xl:self-start"><span className="text-caption text-ink-muted">Chọn một mã để xem ai đã dùng.</span></Panel>}
      </div>
      {dialog}
    </>
  );
}

// ---------- gửi thông báo ----------

export function BroadcastPage() {
  const [segs] = useLoad(() => consoleApi.segments());
  const [form, setForm] = useState({ segment: 'all', title: '', body: '', path: '/' });
  const [confirm, dialog] = useConfirm();
  const [run, notice, busy] = useAction();
  const [sent, setSent] = useState(0);
  const [history] = useLoad(() => consoleApi.audit({ action: 'broadcast', limit: 20 }), [sent]);
  const count = segs.status === 'ready' ? segs.data.find((s) => s.key === form.segment)?.recipients ?? 0 : 0;
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await confirm({ title: 'Gửi thông báo?', body: `Gửi tới ${num(count)} người (mọi thiết bị đã bật nhận thông báo). Không thu hồi được.`, confirmLabel: 'Gửi ngay' });
    if (ok && (await run(() => consoleApi.broadcast(form), `Đã xếp lịch gửi tới ${num(count)} người.`))) {
      setForm({ ...form, title: '', body: '' });
      setSent((n) => n + 1);
    }
  };
  return (
    <>
      <PageHeader title="Gửi thông báo" sub="Thông báo trên điện thoại / trình duyệt (Web Push) cho người dùng đã bật nhận" />
      {notice}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel title="Soạn thông báo">
          <form onSubmit={send} className="flex flex-col gap-4">
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 text-caption font-medium">Gửi tới</legend>
              <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                {segs.status === 'ready' ? segs.data.map((s) => (
                  <label key={s.key} className={cx('flex min-h-[52px] cursor-pointer items-center gap-2 rounded-btn border px-3 text-caption', form.segment === s.key ? 'border-ink' : 'border-line')}>
                    <input type="radio" name="seg" checked={form.segment === s.key} onChange={() => setForm({ ...form, segment: s.key })} className="accent-[var(--primary)]" />
                    <span className="flex-1 font-medium">{s.label}</span>
                    <span className="tabular text-ink-muted">{num(s.recipients)}</span>
                  </label>
                )) : null}
              </div>
            </fieldset>
            <label className="flex flex-col gap-1 text-caption font-medium">Tiêu đề ({form.title.length}/60)
              <input className={input} maxLength={60} required minLength={3} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Mùa cắt tỉa đã đến" />
            </label>
            <label className="flex flex-col gap-1 text-caption font-medium">Nội dung ({form.body.length}/180)
              <textarea rows={3} maxLength={180} required minLength={3} className="rounded-btn border border-line-strong bg-surface p-2 text-body" value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Đầu mùa mưa là lúc tốt để cắt tỉa si, sanh. Mở app xem việc cần làm." />
            </label>
            <label className="flex flex-col gap-1 text-caption font-medium">Bấm vào mở trang
              <select className={input} value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })}>
                <option value="/">Trang chủ</option><option value="/vuon">Vườn của tôi</option><option value="/chup">Phân tích phôi mới</option><option value="/mua-luot">Mua lượt</option>
              </select>
            </label>
            <Button type="submit" size="touch" block={false} loading={busy} disabled={!count}><Bell size={16} aria-hidden="true" />Gửi tới {num(count)} người</Button>
          </form>
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title="Xem trước">
            <div className="flex gap-3 rounded-card border border-line bg-surface-2 p-3">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-btn bg-primary text-primary-on"><Bell size={18} aria-hidden="true" /></span>
              <span className="min-w-0">
                <span className="block text-caption font-semibold">{form.title || 'Tiêu đề thông báo'}</span>
                <span className="block text-label text-ink-muted">{form.body || 'Nội dung ngắn gọn, một ý.'}</span>
              </span>
            </div>
          </Panel>
          <Panel title="Đã gửi gần đây" pad={false}>
            <TableView state={history}>
              {(page) => <DataTable rows={page.items} rowKey={(a) => String(a.id)} dense empty="Chưa gửi lần nào."
                columns={[
                  { key: 'at', header: 'Lúc', render: (a) => dt(a.created_at) },
                  { key: 't', header: 'Tiêu đề', render: (a) => String(a.detail?.title ?? '') },
                  { key: 'n', header: 'Người', align: 'right', render: (a) => num(Number(a.detail?.recipients ?? 0)) },
                ]} />}
            </TableView>
          </Panel>
        </div>
      </div>
      {dialog}
    </>
  );
}
