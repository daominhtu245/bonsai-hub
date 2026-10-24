import { useState } from 'react';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui';
import { consoleApi, type JobDetail as Detail, type RenderRow, type StepRow } from '@/lib/adminConsole';
import { SPECIES_NAME } from '@/lib/copy';
import { cx } from '@/lib/cx';
import {
  Badge, DataTable, JsonBlock, KeyValue, PageHeader, Panel, StatusBadge, Tabs, TableView, dt, dur, secs, shortId, usd, useAction, useConfirm, useLoad,
} from './kit';

type Tab = 'overview' | 'options' | 'images' | 'pipeline' | 'result';

function Overview({ d }: { d: Detail }) {
  const a = d.analysis as { summary_vi?: string; trunk?: Record<string, unknown>; branches?: unknown[]; species?: { guess: string; confidence: number }; nebari?: Record<string, unknown> } | null;
  const t = d.targets as Record<string, unknown> | null;
  const p = d.progress as { cost_mode_a?: string; analysis_mode?: string; design_mode?: string; result?: Record<string, unknown> };
  return (
    <div className="grid gap-4 xl:grid-cols-2 3xl:grid-cols-3 4xl:grid-cols-4">
      <Panel title="Ảnh phôi">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {d.photos.map((ph) => (
            <a key={ph.id} href={ph.url} target="_blank" rel="noreferrer" className="relative block">
              <img src={ph.url} alt="Ảnh phôi" className="aspect-square w-full rounded-img border border-line object-cover" />
              {ph.is_front ? <span className="absolute left-1.5 top-1.5"><Badge tone="info">Mặt tiền</Badge></span> : null}
            </a>
          ))}
          {[...(d.cutout ? [[d.cutout.image_url, 'Đã tách nền'], [d.cutout.sketch_url, 'Phác họa nét']] : []),
            ...(d.s4_prep ? [[d.s4_prep.collage_url, 'Ảnh ghép S4'], [d.s4_prep.editable_url, `Vùng được vẽ · thân: ${d.s4_prep.trunk_source}`]] : [])].map(([url, label]) => (
            <a key={label} href={url} target="_blank" rel="noreferrer" className="relative block">
              <img src={url} alt={label} className="aspect-square w-full rounded-img border border-line bg-surface object-contain" />
              <span className="absolute left-1.5 top-1.5"><Badge tone="neutral">{label}</Badge></span>
            </a>
          ))}
        </div>
      </Panel>
      <Panel title="Thông tin">
        <KeyValue items={[
          ['Người dùng', <Link to={`/admin/nguoi-dung/${d.job.user_id}`}>{d.job.user_email ?? d.job.user_id}</Link>],
          ['Cây', `${d.job.tree_nickname || '—'}${d.job.species_key ? ` · ${SPECIES_NAME[d.job.species_key] ?? d.job.species_key}` : ''}`],
          ['Tạo lúc', dt(d.job.created_at)],
          ['Thời gian chạy', dur(d.job.duration_s)],
          ['Chi phí AI', usd(d.job.cost_usd)],
          ['Chế độ', [p.cost_mode_a && `chi phí: ${p.cost_mode_a}`, p.analysis_mode && `phân tích: ${p.analysis_mode}`, p.design_mode && `thiết kế: ${p.design_mode}`].filter(Boolean).join(' · ') || '—'],
          ['Prompt', <span className="font-mono">{d.job.prompt_version ?? '—'}</span>],
          ['Mã trừ lượt', d.charge_ref ? <span className="font-mono">{d.charge_ref}</span> : '—'],
          ['Chia sẻ', d.share_code ? <a href={`/s/${d.share_code}`} target="_blank" rel="noreferrer">/s/{d.share_code}</a> : '—'],
          ['Yêu cầu', d.inputs ? Object.entries(d.inputs).map(([k, v]) => `${k}: ${String(v)}`).join(' · ') : '—'],
        ]} />
        {d.error ? <pre className="mt-3 whitespace-pre-wrap break-words rounded-btn bg-danger-soft p-3 font-mono text-label text-danger">{d.error}</pre> : null}
      </Panel>
      <Panel title="Phân tích phôi">
        {a ? (
          <div className="flex flex-col gap-3">
            {a.summary_vi ? <p className="m-0 text-caption">{a.summary_vi}</p> : null}
            <KeyValue items={[
              ['Loài (AI)', a.species ? `${SPECIES_NAME[a.species.guess] ?? a.species.guess} · ${Math.round(a.species.confidence * 100)}%` : '—'],
              ['Thân', a.trunk ? `${String(a.trunk.movement)} · thuôn ${String(a.trunk.taper)} · nghiêng ${String(a.trunk.lean_angle_deg)}°` : '—'],
              ['Rễ', a.nebari ? `${String(a.nebari.quality)} · ${String(a.nebari.spread_side)}` : '—'],
              ['Số cành', String(a.branches?.length ?? 0)],
              ['Cao / Ø gốc', t ? `${t.real_height_cm ?? '—'} cm / ${t.base_diameter_cm ?? '—'} cm` : '—'],
              ['Hạ ngọn', t?.lower_apex_by_px ? `${String(t.lower_apex_by_px)} px` : 'không'],
            ]} />
            <JsonBlock data={d.analysis} label="Phân tích (JSON)" />
            <JsonBlock data={d.targets} label="Rule engine (JSON)" />
          </div>
        ) : <span className="text-ink-muted">Chưa có.</span>}
      </Panel>
      <Panel title="Sổ lượt & phản hồi">
        <div className="flex flex-col gap-3 text-caption">
          {d.ledger.length ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {d.ledger.map((e, i) => (
                <li key={i} className="flex justify-between gap-2"><span>{e.reason} <span className="font-mono text-ink-subtle">{e.ref_id}</span></span>
                  <span className={cx('tabular font-semibold', e.delta > 0 ? 'text-primary-ink' : 'text-danger')}>{e.delta > 0 ? '+' : ''}{e.delta}</span></li>
              ))}
            </ul>
          ) : <span className="text-ink-muted">Không trừ lượt.</span>}
          {d.feedback.map((f, i) => (
            <div key={i} className="rounded-btn border border-line p-2">
              <Badge tone={f.rating === 1 ? 'success' : 'danger'}>{f.rating === 1 ? 'Hợp lý' : 'Chưa đúng'}</Badge>
              {f.reason_tags.length ? <span className="ml-2 text-ink-muted">{f.reason_tags.join(', ')}</span> : null}
              {f.comment ? <p className="m-0 mt-1">{f.comment}</p> : null}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Options({ d }: { d: Detail }) {
  const front = d.photos.find((p) => p.is_front) ?? d.photos[0];
  return (
    <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3 4xl:grid-cols-4">
      {d.options.map((o) => {
        const design = o.design as { why_vi?: string; remove_branches?: Array<{ id: string; reason_vi: string }>; keep_branches?: Array<{ id: string; role: string }>; new_branches_needed?: unknown[] };
        return (
          <Panel key={o.id} title={<span className="flex items-center gap-2">#{o.rank} {o.style_key} {o.chosen ? <Badge tone="success">Đã chọn</Badge> : null}</span>}
            actions={<span className="tabular text-label text-ink-muted">phù hợp {Math.round(o.suitability * 100)}%</span>}>
            <div className="relative overflow-hidden rounded-img border border-line bg-photo" style={front?.width && front.height ? { aspectRatio: `${front.width} / ${front.height}` } : undefined}>
              {front ? <img src={front.url} alt="" className="absolute inset-0 h-full w-full" /> : null}
              {o.sketch_svg_url ? <img src={o.sketch_svg_url} alt={`Bản vẽ phương án ${o.rank}`} className="absolute inset-0 h-full w-full" /> : null}
            </div>
            {design.why_vi ? <p className="mb-2 mt-3 text-caption">{design.why_vi}</p> : null}
            <KeyValue items={[
              ['Giữ', (design.keep_branches ?? []).map((k) => `${k.id} (${k.role})`).join(', ') || '—'],
              ['Cắt', (design.remove_branches ?? []).map((r) => `${r.id}: ${r.reason_vi}`).join(' · ') || '—'],
              ['Nuôi mới', String(design.new_branches_needed?.length ?? 0)],
            ]} />
            <div className="mt-2"><JsonBlock data={o.design} label="Thiết kế (JSON)" /></div>
          </Panel>
        );
      })}
      {d.options.length === 0 ? <p className="text-caption text-ink-muted">Chưa có phương án.</p> : null}
    </div>
  );
}

function Images({ renders }: { renders: RenderRow[] }) {
  const [sel, setSel] = useState<RenderRow | null>(null);
  const groups = ['S4', 'S1', 'S2', 'S3', 'PV'].map((code) => [code, renders.filter((r) => r.stage_code === code)] as const).filter(([, rs]) => rs.length);
  if (!renders.length) return <p className="text-caption text-ink-muted">Chưa có ảnh sinh ra.</p>;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 3xl:grid-cols-[minmax(0,1fr)_520px]">
      <div className="flex flex-col gap-4">
        {groups.map(([code, rs]) => (
          <Panel key={code} title={code === 'S4' ? 'Ảnh kết quả (S4) — mọi ứng viên' : code === 'PV' ? 'Xem thử nhanh (thiết kế của người dùng)' : `Giai đoạn ${code}`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 3xl:grid-cols-6">
              {rs.map((r) => {
                const fails = ((r.cv_checks?.fails as string[] | undefined) ?? []);
                return (
                  <button key={r.id} type="button" onClick={() => setSel(r)} aria-pressed={sel?.id === r.id}
                    className={cx('flex flex-col gap-1 rounded-img border p-1 text-left', sel?.id === r.id ? 'border-ink' : 'border-line hover:border-line-strong')}>
                    <img src={r.url} alt={`${code} lần ${r.attempt}`} className="aspect-square w-full rounded-[6px] object-cover" loading="lazy" />
                    <span className="flex flex-wrap items-center gap-1 px-1 text-label">
                      #{r.attempt}
                      {r.selected ? <Badge tone="success">Chọn</Badge> : <Badge>Loại</Badge>}
                      {fails.length ? <Badge tone="danger">{fails.join(', ')}</Badge> : null}
                      {r.total_score != null ? <span className="tabular text-ink-muted">{r.total_score.toFixed(1)}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>
        ))}
      </div>
      <Panel title="Chi tiết ảnh" className="xl:sticky xl:top-[76px] xl:self-start">
        {sel ? (
          <div className="flex flex-col gap-3">
            <a href={sel.url} target="_blank" rel="noreferrer"><img src={sel.url} alt="" className="w-full rounded-img border border-line" /></a>
            <KeyValue items={[['Giai đoạn', sel.stage_code], ['Lần', String(sel.attempt)], ['Model', sel.model], ['Điểm', sel.total_score?.toFixed(2) ?? '—'], ['Lúc', dt(sel.created_at)]]} />
            <JsonBlock data={sel.cv_checks} label="Kiểm tra CV" open />
            <JsonBlock data={sel.judge} label="Chấm điểm (VLM)" />
          </div>
        ) : <span className="text-caption text-ink-muted">Chọn một ảnh để xem kiểm tra CV và điểm.</span>}
      </Panel>
    </div>
  );
}

function Pipeline({ steps }: { steps: StepRow[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const total = steps.reduce((a, s) => a + s.cost_usd, 0);
  const maxLat = Math.max(1, ...steps.map((s) => s.latency_ms));
  return (
    <Panel title={`Các bước pipeline · ${steps.length} bước · ${usd(total)}`} pad={false}>
      <DataTable rows={steps} rowKey={(s) => String(s.id)} onRowClick={(s) => setOpen(open === s.id ? null : s.id)}
        columns={[
          { key: 'code', header: 'Bước', render: (s) => <span className="font-mono font-semibold">{s.step_code}</span> },
          { key: 'ok', header: '', render: (s) => s.ok ? <Badge tone="success">OK</Badge> : <Badge tone="danger">Lỗi</Badge> },
          { key: 'model', header: 'Nhà cung cấp / model', render: (s) => <span className="text-ink-muted">{s.provider} · {s.model}</span> },
          { key: 'pv', header: 'Prompt', render: (s) => <span className="font-mono text-label">{s.prompt_version ?? '—'}</span> },
          { key: 'tok', header: 'Token vào / ra', align: 'right', render: (s) => s.tokens_in || s.tokens_out ? `${s.tokens_in.toLocaleString('vi-VN')} / ${s.tokens_out.toLocaleString('vi-VN')}` : '—' },
          { key: 'img', header: 'Ảnh', align: 'right', render: (s) => s.images_out || '—' },
          { key: 'lat', header: 'Thời gian', render: (s) => (
            <span className="flex items-center gap-2"><span className="h-1.5 rounded-full bg-[var(--chart-3)]" style={{ width: `${Math.max(2, (s.latency_ms / maxLat) * 80)}px` }} />{secs(s.latency_ms)}</span>
          ) },
          { key: 'cost', header: 'Chi phí', align: 'right', render: (s) => s.cost_usd ? usd(s.cost_usd) : '—' },
        ]} />
      {open !== null ? (() => {
        const s = steps.find((x) => x.id === open)!;
        return (
          <div className="flex flex-col gap-2 border-t border-line p-4">
            <div className="text-caption font-semibold">{s.step_code} · {dt(s.created_at)}</div>
            {s.error ? <pre className="m-0 whitespace-pre-wrap break-words rounded-btn bg-danger-soft p-3 font-mono text-label text-danger">{s.error}</pre> : null}
            <JsonBlock data={s.output} label="Đầu ra" open />
          </div>
        );
      })() : null}
    </Panel>
  );
}

function Result({ d }: { d: Detail }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2 3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Panel title="Lộ trình & hướng dẫn">
        {d.stages.length ? d.stages.map((s) => (
          <details key={s.code} className="border-b border-line py-2 last:border-0">
            <summary className="cursor-pointer text-caption font-medium">{s.code} · {s.time_from_start ?? '—'} {(s.guide_vi as { title_vi?: string } | null)?.title_vi ? `· ${(s.guide_vi as { title_vi: string }).title_vi}` : ''}</summary>
            <div className="mt-2 flex flex-col gap-2"><JsonBlock data={s.guide_vi} label="Hướng dẫn" /><JsonBlock data={s.plan} label="Kế hoạch" /></div>
          </details>
        )) : <span className="text-caption text-ink-muted">Chưa có.</span>}
      </Panel>
      <Panel title="Tổng quan gửi người dùng"><JsonBlock data={d.report} label="Báo cáo (JSON)" open /></Panel>
    </div>
  );
}

export default function JobDetail() {
  const { jobId = '' } = useParams();
  const [tab, setTab] = useState<Tab>('overview');
  const [state, , setData] = useLoad(() => consoleApi.job(jobId), [jobId]);
  const [confirm, dialog] = useConfirm();
  const [run, notice, busy] = useAction();

  const act = async (d: Detail, action: 'retry' | 'refund' | 'fail') => {
    const text = {
      retry: { title: 'Chạy lại phiên', body: d.can_retry === 'phase_b' ? 'Người dùng được tặng 1 lượt rồi trừ lại — không mất lượt.' : 'Chạy lại phân tích (miễn phí).', label: 'Chạy lại', ok: 'Đã đưa vào hàng đợi.' },
      refund: { title: 'Hoàn lượt', body: 'Hoàn 1 lượt đã trừ cho phiên lỗi này.', label: 'Hoàn lượt', ok: 'Đã hoàn lượt.' },
      fail: { title: 'Dừng phiên bị treo', body: 'Đánh dấu lỗi và tự hoàn lượt nếu đã trừ.', label: 'Dừng phiên', ok: 'Đã dừng phiên.' },
    }[action];
    const r = await confirm({ title: text.title, body: text.body, confirmLabel: text.label, danger: action === 'fail', note: { label: 'Ghi chú (lưu vào nhật ký)', required: action !== 'retry' } });
    if (r) await run(async () => setData(await consoleApi.jobAction(d.job.id, action, r.note)), text.ok);
  };

  return (
    <>
      <Link to="/admin/phien" className="mb-2 inline-flex items-center gap-1 text-caption text-ink-muted no-underline hover:text-ink"><ChevronLeft size={16} />Phiên thiết kế</Link>
      <TableView state={state}>
        {(d) => (
          <>
            <PageHeader
              title={<span className="flex flex-wrap items-center gap-2">Phiên <span className="font-mono">{shortId(d.job.id)}</span><StatusBadge status={d.job.status} stuck={d.job.stuck} />{d.job.paid ? <Badge tone="success">Có trả lượt</Badge> : null}</span>}
              sub={<span className="font-mono">{d.job.id}</span>}
              actions={<>
                {d.can_retry ? <Button size="touch" block={false} disabled={busy} onClick={() => act(d, 'retry')}>Chạy lại</Button> : null}
                {d.can_refund ? <Button size="touch" block={false} variant="secondary" disabled={busy} onClick={() => act(d, 'refund')}>Hoàn lượt</Button> : null}
                {d.job.stuck ? <Button size="touch" block={false} variant="danger" disabled={busy} onClick={() => act(d, 'fail')}>Dừng phiên</Button> : null}
                {d.job.status === 'done' ? <a href={`/ket-qua/${d.job.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-touch items-center gap-1 px-2 text-caption">Xem như khách <ExternalLink size={14} /></a> : null}
              </>} />
            {notice}
            <Tabs value={tab} onChange={setTab} tabs={[
              ['overview', 'Tổng quan'], ['options', `Phương án (${d.options.length})`], ['images', `Ảnh (${d.renders.length})`],
              ['pipeline', `Pipeline (${d.steps.length})`], ['result', 'Lộ trình'],
            ]} />
            {tab === 'overview' ? <Overview d={d} /> : tab === 'options' ? <Options d={d} /> : tab === 'images' ? <Images renders={d.renders} /> : tab === 'pipeline' ? <Pipeline steps={d.steps} /> : <Result d={d} />}
          </>
        )}
      </TableView>
      {dialog}
    </>
  );
}
