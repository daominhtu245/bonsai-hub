// Các trang quản trị nhỏ: chi phí AI, prompt, danh mục, phản hồi, chế độ AI, gán nhãn.
import { useEffect, useState } from 'react';
import { Button, Notice } from '@/components/ui';
import { adminApi, type Costs } from '@/lib/admin';
import { consoleApi, type CatalogSpecies, type CatalogStyle } from '@/lib/adminConsole';
import { cx } from '@/lib/cx';
import { Lines } from './charts';
import { AiModeTab, FeedbackTab, LabelsTab, PromptsTab, SpeciesTab } from './sections';
import { Badge, DataTable, PageHeader, Panel, Select, StatCard, Tabs, TableView, dt, num, pct, usd, useAction, useLoad, useUrlState, secs } from './kit';

export function CostsPage() {
  const [f, setF] = useUrlState({ days: '14' });
  const [state] = useLoad<Costs>(() => adminApi.costs(Number(f.days)), [f.days]);
  return (
    <>
      <PageHeader title="Chi phí AI" sub="Từ pipeline_steps — mọi lần gọi nhà cung cấp, kể cả lần lỗi và lần gọi lại"
        actions={<Select label="Kỳ" value={f.days} onChange={(days) => setF({ days })} options={[['7', '7 ngày'], ['14', '14 ngày'], ['30', '30 ngày'], ['90', '90 ngày']]} />} />
      <TableView state={state}>
        {(c) => {
          const rows = c.days.map((d) => ({ ...d, label: d.day.slice(5).split('-').reverse().join('/') }));
          const paid = c.days.reduce((a, d) => a + d.paid_jobs, 0);
          const jobs = c.days.reduce((a, d) => a + d.jobs, 0);
          return (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label={`Tổng ${f.days} ngày`} value={c.total_usd} format={usd} />
                <StatCard label="TB mỗi lượt trả phí" value={c.avg_cost_per_paid_job_usd ?? 0} format={usd} hint="tính cả phân tích miễn phí" />
                <StatCard label="Phiên" value={jobs} format={num} />
                <StatCard label="Lượt trả phí" value={paid} format={num} />
              </div>
              <div className="grid gap-4 3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Lines title="Chi phí theo ngày (USD)" rows={rows} series={[{ key: 'cost_usd', label: 'Chi phí', color: 'var(--chart-2)' }]}
                format={(n) => `$${n < 10 ? n.toFixed(2) : Math.round(n)}`} valueOf={(r) => r.cost_usd} />
              <Panel title="Theo bước" pad={false}>
                <DataTable rows={c.steps} rowKey={(s) => s.step_code}
                  columns={[
                    { key: 'code', header: 'Bước', render: (s) => <span className="font-mono font-semibold">{s.step_code}</span> },
                    { key: 'calls', header: 'Lần gọi', align: 'right', render: (s) => num(s.calls) },
                    { key: 'cost', header: 'Chi phí', align: 'right', render: (s) => usd(s.cost_usd) },
                    { key: 'share', header: 'Tỉ trọng', render: (s) => {
                      const share = c.total_usd ? s.cost_usd / c.total_usd : 0;
                      return <span className="flex items-center gap-2"><span className="h-1.5 rounded-full bg-[var(--chart-2)]" style={{ width: `${Math.max(2, share * 120)}px` }} />{pct(share)}</span>;
                    } },
                    { key: 'per', header: 'TB / lần', align: 'right', render: (s) => usd(s.calls ? s.cost_usd / s.calls : 0) },
                    { key: 'lat', header: 'Độ trễ TB', align: 'right', render: (s) => secs(s.avg_latency_ms) },
                    { key: 'fail', header: 'Lỗi', align: 'right', render: (s) => <span className={s.fail_rate > 0.1 ? 'font-semibold text-danger' : undefined}>{pct(s.fail_rate)}</span> },
                  ]} />
              </Panel>
              </div>
            </div>
          );
        }}
      </TableView>
    </>
  );
}

function PromptStats() {
  const [state] = useLoad(() => consoleApi.promptStats(90));
  const [prompts] = useLoad(adminApi.prompts);
  const active = new Set(prompts.status === 'ready' ? prompts.data.filter((p) => p.active).map((p) => `${p.step_code}.${p.version}`) : []);
  return (
    <Panel title="Hiệu quả theo phiên bản (90 ngày)" pad={false}>
      <TableView state={state}>
        {(rows) => (
          <DataTable rows={rows} rowKey={(r) => r.prompt_version} empty="Chưa có lần chạy nào."
            columns={[
              { key: 'v', header: 'Phiên bản', render: (r) => <span className="flex items-center gap-2"><span className="font-mono font-semibold">{r.prompt_version}</span>{active.has(r.prompt_version) ? <Badge tone="success">Đang dùng</Badge> : null}</span> },
              { key: 'n', header: 'Lần chạy', align: 'right', render: (r) => num(r.calls) },
              { key: 'fail', header: 'Lỗi', align: 'right', render: (r) => <span className={r.fail_rate > 0.1 ? 'font-semibold text-danger' : undefined}>{pct(r.fail_rate)}</span> },
              { key: 'cost', header: 'Chi phí TB', align: 'right', render: (r) => usd(r.avg_cost_usd) },
              { key: 'tok', header: 'Token ra TB', align: 'right', render: (r) => num(r.avg_tokens_out) },
              { key: 'lat', header: 'Độ trễ TB', align: 'right', render: (r) => secs(r.avg_latency_ms) },
              { key: 'range', header: 'Dùng từ – đến', render: (r) => `${dt(r.first_used)} – ${dt(r.last_used)}` },
            ]} />
        )}
      </TableView>
    </Panel>
  );
}

export function PromptsPage() {
  const [f, setF] = useUrlState({ tab: 'versions' });
  return (
    <>
      <PageHeader title="Prompt" sub="Mỗi lần sửa là một phiên bản mới; kết quả cũ luôn truy được đúng prompt đã dùng" />
      <Tabs value={f.tab} onChange={(tab) => setF({ tab })} tabs={[['versions', 'Phiên bản'], ['stats', 'Hiệu quả']]} />
      {f.tab === 'stats' ? <PromptStats /> : <Panel><PromptsTab /></Panel>}
    </>
  );
}

function SpeciesEditor({ sp, onSaved }: { sp: CatalogSpecies; onSaved: () => void }) {
  const [form, setForm] = useState({ name_vi: sp.name_vi, growth_speed: sp.growth_speed, prompt_desc_en: sp.prompt_desc_en });
  const [run, notice, busy] = useAction();
  useEffect(() => setForm({ name_vi: sp.name_vi, growth_speed: sp.growth_speed, prompt_desc_en: sp.prompt_desc_en }), [sp]);
  const input = 'min-h-touch w-full rounded-btn border border-line-strong bg-surface px-3 text-body text-ink';
  return (
    <Panel title={<>Sửa loài <span className="font-mono">{sp.key}</span></>} className="xl:sticky xl:top-[76px] xl:self-start">
      {notice}
      <form className="flex flex-col gap-3 text-caption" onSubmit={(e) => { e.preventDefault(); run(async () => { await consoleApi.saveSpecies(sp.key, form); onSaved(); }, 'Đã lưu. Áp dụng cho phiên mới.'); }}>
        <label className="flex flex-col gap-1 font-medium">Tên tiếng Việt<input className={input} value={form.name_vi} onChange={(e) => setForm({ ...form, name_vi: e.target.value })} required /></label>
        <label className="flex flex-col gap-1 font-medium">Tốc độ lớn (quyết định số năm và độ dày thân)
          <select className={input} value={form.growth_speed} onChange={(e) => setForm({ ...form, growth_speed: e.target.value as CatalogSpecies['growth_speed'] })}>
            <option value="slow">Chậm</option><option value="medium">Vừa</option><option value="fast">Nhanh</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 font-medium">Mô tả cho model ảnh (tiếng Anh)
          <textarea rows={5} className="rounded-btn border border-line-strong bg-surface p-2 font-mono text-label" value={form.prompt_desc_en} onChange={(e) => setForm({ ...form, prompt_desc_en: e.target.value })} required minLength={10} />
        </label>
        <Button type="submit" size="touch" block={false} loading={busy}>Lưu</Button>
      </form>
    </Panel>
  );
}

function StyleEditor({ st, onSaved }: { st: CatalogStyle; onSaved: () => void }) {
  const [form, setForm] = useState({ name_vi: st.name_vi, name_jp: st.name_jp ?? '', prompt_desc_en: st.prompt_desc_en });
  const [run, notice, busy] = useAction();
  useEffect(() => setForm({ name_vi: st.name_vi, name_jp: st.name_jp ?? '', prompt_desc_en: st.prompt_desc_en }), [st]);
  const input = 'min-h-touch w-full rounded-btn border border-line-strong bg-surface px-3 text-body text-ink';
  return (
    <Panel title={<>Sửa thế <span className="font-mono">{st.key}</span></>} className="xl:sticky xl:top-[76px] xl:self-start">
      {notice}
      <form className="flex flex-col gap-3 text-caption" onSubmit={(e) => { e.preventDefault(); run(async () => { await consoleApi.saveStyle(st.key, { ...form, name_jp: form.name_jp || null }); onSaved(); }, 'Đã lưu. Áp dụng cho phiên mới.'); }}>
        <label className="flex flex-col gap-1 font-medium">Tên tiếng Việt<input className={input} value={form.name_vi} onChange={(e) => setForm({ ...form, name_vi: e.target.value })} required /></label>
        <label className="flex flex-col gap-1 font-medium">Tên tiếng Nhật<input className={input} value={form.name_jp} onChange={(e) => setForm({ ...form, name_jp: e.target.value })} /></label>
        <label className="flex flex-col gap-1 font-medium">Mô tả cho model (tiếng Anh)
          <textarea rows={5} className="rounded-btn border border-line-strong bg-surface p-2 font-mono text-label" value={form.prompt_desc_en} onChange={(e) => setForm({ ...form, prompt_desc_en: e.target.value })} required minLength={10} />
        </label>
        <Button type="submit" size="touch" block={false} loading={busy}>Lưu</Button>
      </form>
    </Panel>
  );
}

const SPEED: Record<string, string> = { slow: 'Chậm', medium: 'Vừa', fast: 'Nhanh' };

export function CatalogPage() {
  const [f, setF] = useUrlState({ tab: 'species' });
  const [state, reload] = useLoad(() => consoleApi.catalog());
  const [selSp, setSelSp] = useState<string | null>(null);
  const [selSt, setSelSt] = useState<string | null>(null);
  const edited = (at: string | null) => (at ? <Badge tone="warn">Đã sửa {dt(at)}</Badge> : <span className="text-ink-subtle">Mặc định</span>);
  return (
    <>
      <PageHeader title="Danh mục loài & thế" sub="Sửa ở đây được giữ lại khi cập nhật phần mềm (không bị bộ mặc định ghi đè)" />
      <Tabs value={f.tab} onChange={(tab) => setF({ tab })} tabs={[['species', 'Loài'], ['styles', 'Thế'], ['refs', 'Ảnh tham chiếu loài']]} />
      {f.tab === 'refs' ? <Panel><SpeciesTab /></Panel> : (
        <TableView state={state}>
          {(c) => f.tab === 'species' ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px] 3xl:grid-cols-[minmax(0,1fr)_520px]">
              <Panel pad={false}>
                <DataTable rows={c.species} rowKey={(s) => s.key} onRowClick={(s) => setSelSp(s.key)}
                  columns={[
                    { key: 'name', header: 'Loài', render: (s) => <span className={cx('font-medium', selSp === s.key && 'underline')}>{s.name_vi}</span> },
                    { key: 'key', header: 'Mã', render: (s) => <span className="font-mono text-label">{s.key}</span> },
                    { key: 'speed', header: 'Tốc độ lớn', render: (s) => SPEED[s.growth_speed] },
                    { key: 'trees', header: 'Số cây', align: 'right', render: (s) => num(s.trees) },
                    { key: 'refs', header: 'Ảnh mẫu', align: 'right', render: (s) => `${s.refs}/5` },
                    { key: 'ed', header: 'Nguồn', render: (s) => edited(s.admin_edited_at) },
                  ]} />
              </Panel>
              {selSp ? <SpeciesEditor sp={c.species.find((s) => s.key === selSp)!} onSaved={reload} /> : <Panel className="xl:self-start"><span className="text-caption text-ink-muted">Chọn một loài để sửa.</span></Panel>}
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px] 3xl:grid-cols-[minmax(0,1fr)_520px]">
              <Panel pad={false}>
                <DataTable rows={c.styles} rowKey={(s) => s.key} onRowClick={(s) => setSelSt(s.key)}
                  columns={[
                    { key: 'name', header: 'Thế', render: (s) => <span className={cx('font-medium', selSt === s.key && 'underline')}>{s.name_vi}</span> },
                    { key: 'jp', header: 'Tên Nhật', render: (s) => s.name_jp ?? '—' },
                    { key: 'key', header: 'Mã', render: (s) => <span className="font-mono text-label">{s.key}</span> },
                    { key: 'n', header: 'Được chọn', align: 'right', render: (s) => num(s.chosen) },
                    { key: 'ed', header: 'Nguồn', render: (s) => edited(s.admin_edited_at) },
                  ]} />
              </Panel>
              {selSt ? <StyleEditor st={c.styles.find((s) => s.key === selSt)!} onSaved={reload} /> : <Panel className="xl:self-start"><span className="text-caption text-ink-muted">Chọn một thế để sửa.</span></Panel>}
            </div>
          )}
        </TableView>
      )}
    </>
  );
}

export function FeedbackPage() {
  return (
    <>
      <PageHeader title="Phản hồi" sub="Đánh giá “Hợp lý / Chưa đúng” của người dùng trên kết quả" />
      <Panel><FeedbackTab /></Panel>
    </>
  );
}

export function AiModePage() {
  return (
    <>
      <PageHeader title="Chế độ AI" sub="Áp dụng cho phiên bắt đầu sau khi đổi; mọi thay đổi được ghi nhật ký" />
      <div className="max-w-[720px]"><Panel><AiModeTab /></Panel></div>
      <div className="mt-4 max-w-[720px]"><Notice tone="info">Chi phí thực tế theo chế độ: xem <a href="/admin/chi-phi">Chi phí AI</a>.</Notice></div>
    </>
  );
}

export function LabelsPage() {
  return (
    <>
      <PageHeader title="Gán nhãn" sub="Bộ dữ liệu huấn luyện model riêng (YOLO-seg 3 lớp: thân, cành, rễ)" />
      <LabelsTab />
    </>
  );
}
