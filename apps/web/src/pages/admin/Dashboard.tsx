import {
  AlertTriangle, ArrowRight, Bell, Bot, CheckCircle2, CreditCard, Flag, HandHeart, MessagesSquare, ShieldAlert, Store, ThumbsDown, type LucideIcon,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui';
import type { InboxTone } from '@/lib/adminCommunity';
import { cx } from '@/lib/cx';
import { useInbox } from './inbox';
import { consoleApi, type Dashboard as DashboardData } from '@/lib/adminConsole';
import { Funnel, Lines, StackedBars, type Series } from './charts';
import { DataTable, PageHeader, Panel, Select, StatCard, StatusBadge, TableView, dt, dur, num, pct, shortId, usd, useLoad, useUrlState, useWide, vnd, vndShort } from './kit';

const JOB_SERIES: Series[] = [
  { key: 'jobs_paid', label: 'Có trả lượt', color: 'var(--chart-1)' },
  { key: 'free', label: 'Chỉ phân tích', color: 'var(--chart-3)' },
];
const MONEY_SERIES: Series[] = [
  { key: 'revenue_vnd', label: 'Doanh thu', color: 'var(--chart-1)' },
  { key: 'ai_cost_vnd', label: 'Chi phí AI', color: 'var(--chart-2)' },
];

function Body({ d }: { d: DashboardData }) {
  const k = d.kpis;
  const wide = useWide();
  const chartH = wide ? 280 : 220;
  const rows = d.series.map((r) => ({ ...r, label: r.day.slice(5).split('-').reverse().join('/'), free: r.jobs_a - r.jobs_paid }));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 4xl:grid-cols-12">
        <StatCard label="Doanh thu" value={k.revenue_vnd.value} previous={k.revenue_vnd.previous} format={vnd} />
        <StatCard label="Chi phí AI" value={k.ai_cost_vnd.value} previous={k.ai_cost_vnd.previous} format={vnd} goodWhen="down" />
        <StatCard label="Lãi gộp" value={k.gross_margin_vnd.value} previous={k.gross_margin_vnd.previous} format={vnd} />
        <StatCard label="Chi phí AI / lượt trả" value={k.ai_cost_per_paid_vnd.value} previous={k.ai_cost_per_paid_vnd.previous} format={vnd} goodWhen="down" />
        <StatCard label="Người dùng mới" value={k.users_new.value} previous={k.users_new.previous} format={num} />
        <StatCard label="Phiên phân tích" value={k.jobs_a.value} previous={k.jobs_a.previous} format={num} />
        <StatCard label="Lượt trả phí" value={k.jobs_paid.value} previous={k.jobs_paid.previous} format={num} />
        <StatCard label="Tỉ lệ chuyển đổi" value={k.conversion.value} previous={k.conversion.previous} format={pct} hint="phân tích → trả lượt" />
        <StatCard label="Tỉ lệ lỗi" value={k.fail_rate.value} previous={k.fail_rate.previous} format={pct} goodWhen="down" />
        <StatCard label="Phản hồi “Hợp lý”" value={k.feedback_positive.value} previous={k.feedback_positive.previous} format={pct} />
        <StatCard label="Thời gian phân tích" value={d.median_phase_a_s ?? 0} format={dur} hint="trung vị" />
        <StatCard label="Thời gian tạo ảnh" value={d.median_phase_b_s ?? 0} format={dur} hint="trung vị" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2 3xl:grid-cols-3">
        <StackedBars title="Phiên theo ngày" rows={rows} series={JOB_SERIES} format={num} height={chartH}
          valueOf={(r, key) => Number(r[key as keyof typeof r]) || 0}
          summary={`${num(k.jobs_a.value)} phiên · ${num(k.jobs_paid.value)} có trả lượt`} />
        <Lines title="Doanh thu và chi phí AI (VND)" rows={rows} series={MONEY_SERIES} format={vndShort} height={chartH}
          valueOf={(r, key) => Number(r[key as keyof typeof r]) || 0}
          summary={`Tỉ giá quy đổi ${num(d.usd_vnd_rate)} đ/USD`} />
        <Funnel title="Phễu người dùng (trong kỳ)" summary="Số người dùng khác nhau đi tới từng bước"
          steps={[
            { label: 'Bắt đầu phân tích', value: d.funnel.users },
            { label: 'Có bản vẽ', value: d.funnel.analysed },
            { label: 'Trả lượt', value: d.funnel.chose },
            { label: 'Nhận kết quả', value: d.funnel.done },
            { label: 'Chia sẻ', value: d.funnel.shared },
          ]} />
        <div className="xl:col-span-1 3xl:col-span-3"><RecentFailures /></div>
      </div>
    </div>
  );
}

const TONE_BAR: Record<InboxTone, string> = { danger: 'bg-danger', warn: 'bg-warn', info: 'bg-line-strong' };
const TONE_NUM: Record<InboxTone, string> = { danger: 'text-danger', warn: 'text-warn-ink', info: 'text-ink' };
const INBOX_ICON: Record<string, LucideIcon> = {
  reports: Flag, payments: CreditCard, consults: MessagesSquare, care: HandHeart, feedback: ThumbsDown,
  jobs_failed: AlertTriangle, assistant: Bot, listings: Store, stolen: ShieldAlert,
};

/** Việc cần xử lý: gấp (đỏ) → nên xem (vàng) → để biết (xám); mỗi thẻ mở thẳng chỗ xử lý. */
export function InboxPanel() {
  const { inbox } = useInbox();
  if (!inbox) return <Skeleton className="h-[120px] rounded-card" />;
  if (!inbox.items.length) {
    return (
      <Panel>
        <div className="flex items-center gap-3 text-caption">
          <CheckCircle2 size={22} className="text-primary" aria-hidden="true" />
          <span><span className="font-semibold">Không có việc tồn đọng.</span> <span className="text-ink-muted">Báo vi phạm, chuyển khoản, câu hỏi nghệ nhân, phản hồi đều đã xử lý.</span></span>
        </div>
      </Panel>
    );
  }
  return (
    <section aria-label="Việc cần xử lý" className="flex flex-col gap-2">
      <h2 className="m-0 flex items-center gap-2 text-body font-semibold">
        Việc cần xử lý
        {inbox.urgent ? <span className="tabular rounded-full bg-danger-soft px-2 text-label font-semibold text-danger">{inbox.urgent} việc gấp</span> : null}
      </h2>
      <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
        {inbox.items.map((it) => {
          const Icon = INBOX_ICON[it.key] ?? Bell;
          return (
            <li key={it.key} className="relative flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
              <span aria-hidden="true" className={cx('absolute inset-y-0 left-0 w-1', TONE_BAR[it.tone])} />
              <Link to={it.to} className="flex items-center gap-3 px-4 pb-2 pt-3 text-ink no-underline hover:text-ink">
                <Icon size={18} strokeWidth={1.75} className="flex-none text-ink-muted" aria-hidden="true" />
                <span className="flex-1 text-caption font-semibold">{it.title}</span>
                <span className={cx('tabular text-h2', TONE_NUM[it.tone])}>{num(it.count)}</span>
              </Link>
              {it.preview.length ? (
                <ul className="m-0 flex list-none flex-col border-t border-line p-0">
                  {it.preview.map((p, i) => (
                    <li key={i}>
                      <Link to={p.to} className="flex min-h-[40px] items-center gap-2 px-4 py-1.5 text-label text-ink no-underline hover:bg-surface-2 hover:text-ink">
                        <span className="min-w-0 flex-1 truncate">{p.label}</span>
                        <span className="flex-none text-ink-subtle">{p.sub}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Link to={it.to} className="mt-auto flex min-h-[40px] items-center gap-1 border-t border-line px-4 text-label font-semibold no-underline">
                Xử lý <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RecentFailures() {
  const navigate = useNavigate();
  const [state] = useLoad(() => consoleApi.jobs({ status: 'failed', limit: 6 }));
  return (
    <Panel title="Phiên lỗi gần đây" actions={<Link to="/admin/phien?status=failed" className="text-label">Xem tất cả</Link>} pad={false}>
      <TableView state={state}>
        {(page) => (
          <DataTable rows={page.items} rowKey={(r) => r.id} dense empty="Không có phiên lỗi."
            onRowClick={(r) => navigate(`/admin/phien/${r.id}`)}
            columns={[
              { key: 'id', header: 'Phiên', render: (r) => <span className="font-mono">{shortId(r.id)}</span> },
              { key: 'err', header: 'Mã lỗi', render: (r) => r.error_code ?? '—' },
              { key: 'st', header: 'Trạng thái', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'cost', header: 'Chi phí', align: 'right', render: (r) => usd(r.cost_usd) },
              { key: 'at', header: 'Lúc', align: 'right', render: (r) => dt(r.created_at) },
            ]} />
        )}
      </TableView>
    </Panel>
  );
}

export default function Dashboard() {
  const [f, setF] = useUrlState({ days: '30' });
  const [state] = useLoad(() => consoleApi.dashboard(Number(f.days)), [f.days]);
  return (
    <>
      <PageHeader title="Bảng điều khiển" sub="So sánh với kỳ liền trước cùng độ dài"
        actions={<Select label="Kỳ" value={f.days} onChange={(days) => setF({ days })} options={[['7', '7 ngày'], ['30', '30 ngày'], ['90', '90 ngày']]} />} />
      <div className="mb-5"><InboxPanel /></div>
      {state.status === 'ready' ? <Body d={state.data} /> : state.status === 'error' ? (
        <Panel><span className="text-danger">{state.message}</span></Panel>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 4xl:grid-cols-12" aria-busy="true">
          {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-[96px] rounded-card" />)}
        </div>
      )}
    </>
  );
}
