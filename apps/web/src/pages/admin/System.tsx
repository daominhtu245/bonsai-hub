import { RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { consoleApi } from '@/lib/adminConsole';
import { Badge, DataTable, KeyValue, PageHeader, Panel, StatCard, TableView, dt, num, pct, useLoad, vnd, secs } from './kit';

const STATUS_VI: Record<string, string> = {
  queued: 'Chờ', analyzing: 'Đang phân tích', designing: 'Đang thiết kế', rendering_final: 'Đang tạo ảnh',
  judging: 'Đang chấm', rendering_stages: 'Ảnh giai đoạn', writing_guide: 'Viết hướng dẫn',
};
const ok = (v: boolean, yes = 'Có', no = 'Chưa') => <Badge tone={v ? 'success' : 'warn'}>{v ? yes : no}</Badge>;

export default function System() {
  const [state, reload] = useLoad(() => consoleApi.system());
  return (
    <>
      <PageHeader title="Sức khỏe hệ thống" sub="Hàng đợi, worker, phiên treo, lỗi và độ trễ 24 giờ, cấu hình"
        actions={<Button size="touch" block={false} variant="secondary" onClick={reload}><RefreshCw size={16} aria-hidden="true" />Làm mới</Button>} />
      <TableView state={state}>
        {(s) => {
          const w = s.worker_info;
          const queued = Object.values(s.queues).reduce((a, b) => a + b, 0);
          return (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <StatCard label="Worker đang chạy" value={s.workers.length} format={num} hint={s.workers.length ? undefined : 'không phản hồi'} />
                <StatCard label="Việc trong hàng đợi" value={queued} format={num} hint={Object.entries(s.queues).map(([q, n]) => `${q}: ${n}`).join(' · ')} />
                <StatCard label="Phiên đang chạy" value={Object.values(s.active_jobs).reduce((a, b) => a + b, 0)} format={num} />
                <StatCard label="Phiên bị treo" value={s.stuck_jobs} format={num} hint="> 20 phút" />
                <StatCard label="Phiên 24 giờ" value={s.jobs_24h} format={num} />
                <StatCard label="Tỉ lệ lỗi 24 giờ" value={s.jobs_24h ? s.failed_24h / s.jobs_24h : 0} format={pct} hint={`${s.failed_24h} lỗi`} />
              </div>
              {!s.redis_ok ? <Panel><span className="text-danger">Không kết nối được Redis — hàng đợi và worker không đọc được.</span></Panel> : null}
              {s.stuck_jobs ? (
                <Panel><span className="text-caption">Có {s.stuck_jobs} phiên bị treo. <Link to="/admin/phien?status=stuck">Xem và xử lý</Link></span></Panel>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-3">
                <Panel title="Worker & AI">
                  {w ? (
                    <KeyValue items={[
                      ['Máy', `${w.host} · ${dt(w.reported_at)}`],
                      ['Worker trả lời ping', s.workers.join(', ') || '—'],
                      ['Model chữ', `${w.llm.provider} · ${w.llm.model} (effort ${w.llm.effort})`],
                      ['Model chữ tiết kiệm', w.llm.economy_model ?? '—'],
                      ['Model ảnh', `${w.image.provider} · ${w.image.model}`],
                      ['Dự phòng', [w.llm.fallback && `chữ: ${w.llm.fallback}`, w.image.fallback && `ảnh: ${w.image.fallback}`].filter(Boolean).join(' · ') || '—'],
                      ['Khóa API', <span className="flex flex-wrap gap-1">{Object.entries(w.keys).map(([k, v]) => <Badge key={k} tone={v ? 'success' : 'neutral'}>{k}</Badge>)}</span>],
                      ['Model riêng YOLO-seg', ok(w.seg_model)],
                      ['SAM (gán nhãn)', ok(w.sam)],
                    ]} />
                  ) : <span className="text-caption text-ink-muted">Worker chưa báo cấu hình (chưa khởi động lại sau cập nhật?).</span>}
                </Panel>
                <Panel title="Phiên đang chạy theo bước">
                  {Object.keys(s.active_jobs).length ? (
                    <KeyValue items={Object.entries(s.active_jobs).map(([k, n]) => [STATUS_VI[k] ?? k, num(n)])} />
                  ) : <span className="text-caption text-ink-muted">Không có phiên nào đang chạy.</span>}
                  <div className="mt-4 border-t border-line pt-3">
                    <div className="mb-2 text-label font-medium text-ink-muted">Giám sát (10 phút / lần)</div>
                    {s.monitoring ? (
                      <KeyValue items={[
                        ['Lần cuối', dt(s.monitoring.at)],
                        ['Cảnh báo', Object.keys(s.monitoring.alerts).length ? Object.values(s.monitoring.alerts).join(' · ') : <Badge tone="success">Không có</Badge>],
                      ]} />
                    ) : <span className="text-caption text-ink-muted">Chưa có dữ liệu (beat chưa chạy?).</span>}
                  </div>
                </Panel>
                <Panel title="Cấu hình">
                  <KeyValue items={[
                    ['Môi trường', <Badge tone={s.config.app_env === 'prod' ? 'success' : 'warn'}>{s.config.app_env}</Badge>],
                    ['Chế độ AI', <Link to="/admin/che-do-ai">{Object.values(s.config.modes).join(' · ')}</Link>],
                    ['Tỉ giá', `${num(s.config.usd_vnd_rate)} đ / USD`],
                    ['Tài khoản ngân hàng', ok(s.config.bank_configured)],
                    ['Webhook', <span className="flex gap-1">{Object.entries(s.config.webhooks).map(([k, v]) => <Badge key={k} tone={v ? 'success' : 'neutral'}>{k}</Badge>)}</span>],
                    ['Đăng nhập', <span className="flex gap-1">{Object.entries(s.config.login).map(([k, v]) => <Badge key={k} tone={v ? 'success' : 'neutral'}>{k}</Badge>)}</span>],
                    ['Sentry', ok(s.config.sentry)],
                    ['Gói bán', s.config.packages.map((p) => `${p.name}: ${p.credits} lượt / ${vnd(p.price_vnd)}`).join(' · ')],
                  ]} />
                </Panel>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Panel title="Độ trễ theo bước (24 giờ)" pad={false}>
                  <DataTable rows={s.slow_steps_24h} rowKey={(r) => r.step_code} empty="Chưa có bước nào chạy trong 24 giờ."
                    columns={[
                      { key: 'code', header: 'Bước', render: (r) => <span className="font-mono font-semibold">{r.step_code}</span> },
                      { key: 'n', header: 'Lần chạy', align: 'right', render: (r) => num(r.calls) },
                      { key: 'avg', header: 'Trung bình', align: 'right', render: (r) => secs(r.avg_ms) },
                      { key: 'p95', header: 'P95', align: 'right', render: (r) => secs(r.p95_ms) },
                      { key: 'fail', header: 'Lỗi', align: 'right', render: (r) => <span className={r.fail_rate > 0.1 ? 'font-semibold text-danger' : undefined}>{pct(r.fail_rate)}</span> },
                    ]} />
                </Panel>
                <Panel title="Mã lỗi phổ biến (24 giờ)" pad={false}>
                  <DataTable rows={s.top_errors_24h} rowKey={(r) => r.error_code} empty="Không có lỗi."
                    columns={[
                      { key: 'c', header: 'Mã lỗi', render: (r) => <Link to={`/admin/phien?status=failed&days=1&q=${encodeURIComponent(r.error_code)}`} className="font-mono">{r.error_code}</Link> },
                      { key: 'n', header: 'Số phiên', align: 'right', render: (r) => num(r.count) },
                    ]} />
                </Panel>
              </div>
              <p className="m-0 text-label text-ink-subtle">Kiểm tra lúc {dt(s.checked_at)}</p>
            </div>
          );
        }}
      </TableView>
    </>
  );
}
