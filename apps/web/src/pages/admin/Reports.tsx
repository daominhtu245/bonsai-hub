import { useEffect, useState } from 'react';
import { EyeOff, ExternalLink, Flag, Lock, ShieldCheck, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { adminCommunityApi, type ReportAdmin, type ReportStatus } from '@/lib/adminCommunity';
import { cx } from '@/lib/cx';
import { useInbox } from './inbox';
import { Badge, KeyValue, PageHeader, Panel, TableView, Tabs, dt, useAction, useConfirm, useLoad, useUrlState, vnd } from './kit';

const STATUS_TONE: Record<ReportStatus, 'danger' | 'success' | 'neutral'> = { open: 'danger', actioned: 'success', dismissed: 'neutral' };
const STATUS_VI: Record<ReportStatus, string> = { open: 'Chờ xử lý', actioned: 'Đã ẩn', dismissed: 'Không vi phạm' };

function Detail({ r, onDone }: { r: ReportAdmin; onDone: () => void }) {
  const [ask, dialog] = useConfirm();
  const [run, msg, busy] = useAction();
  const { refresh } = useInbox();
  const act = async (action: 'hide' | 'hide_lock' | 'dismiss') => {
    const label = { hide: 'Ẩn nội dung', hide_lock: 'Ẩn và khóa người đăng', dismiss: 'Không vi phạm' }[action];
    const res = await ask({
      title: label, confirmLabel: label, danger: action !== 'dismiss',
      body: action === 'dismiss' ? `Đóng ${r.reports_on_target} báo cáo về nội dung này.`
        : `Người đăng nhận thông báo kèm lý do. Đóng luôn ${r.reports_on_target} báo cáo về nội dung này.${action === 'hide_lock' ? ' Tài khoản bị khóa (mở lại được ở trang người dùng).' : ''}`,
      note: { label: action === 'dismiss' ? 'Ghi chú (không bắt buộc)' : 'Lý do gửi người đăng', required: action !== 'dismiss', placeholder: 'VD: đòi đặt cọc ngoài app' },
    });
    if (!res) return;
    if (await run(() => adminCommunityApi.resolveReport(r.id, action, res.note || undefined), 'Đã xử lý.')) {
      refresh();
      onDone();
    }
  };
  const t = r.target;
  return (
    <Panel title="Chi tiết" className="lg:sticky lg:top-[76px]">
      {dialog}
      {msg}
      <div className="flex flex-col gap-4 text-caption">
        {t ? (
          <div className="flex gap-3">
            {t.photo_url ? <img src={t.photo_url} alt="" className="h-28 w-28 flex-none rounded-btn object-cover" /> : null}
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-label text-ink-muted">{r.kind_vi}{t.code ? ` · ${t.code}` : ''}</span>
              <span className="text-body font-semibold [overflow-wrap:anywhere]">{t.title}</span>
              {t.price_vnd ? <span className="tabular">{vnd(t.price_vnd)}</span> : null}
              {t.hidden ? <Badge tone="neutral">Đang ẩn</Badge> : <Badge tone="success">Đang hiện</Badge>}
              {t.public_url && !t.hidden ? (
                <a href={t.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-label">Mở trang công khai <ExternalLink size={12} aria-hidden="true" /></a>
              ) : null}
            </div>
          </div>
        ) : <p className="m-0 text-ink-muted">Nội dung đã bị xóa.</p>}
        {t?.description ? <p className="m-0 max-h-32 overflow-y-auto whitespace-pre-line rounded-btn bg-surface-2 p-3">{t.description}</p> : null}
        <KeyValue items={[
          ['Lý do', <span key="r" className="font-semibold text-danger">{r.reason_vi}</span>],
          ['Ghi chú người báo', r.note ?? '—'],
          ['Số lần bị báo', String(r.reports_on_target)],
          ['Người báo', r.reporter ? <Link key="rp" to={`/admin/nguoi-dung/${r.reporter.id}`}>{r.reporter.name}</Link> : 'Ẩn danh'],
          ['Người đăng', r.owner ? (
            <Link key="ow" to={`/admin/nguoi-dung/${r.owner.id}`} className="inline-flex items-center gap-1"><UserRound size={13} aria-hidden="true" />{r.owner.name}{r.owner.locked ? ' (đang khóa)' : ''}</Link>
          ) : '—'],
          ['Báo lúc', dt(r.created_at)],
          ...(r.status !== 'open' ? [['Kết quả', `${r.resolution ?? STATUS_VI[r.status]} · ${r.resolved_by ?? ''} · ${dt(r.resolved_at)}`] as [string, string]] : []),
        ]} />
        {r.status === 'open' ? (
          <div className="flex flex-col gap-2">
            <Button size="touch" variant="danger" className="border border-danger" disabled={busy || !t} onClick={() => act('hide')}><EyeOff size={16} aria-hidden="true" />Ẩn nội dung</Button>
            <Button size="touch" variant="danger" className="border border-danger" disabled={busy || !r.owner} onClick={() => act('hide_lock')}><Lock size={16} aria-hidden="true" />Ẩn và khóa người đăng</Button>
            <Button size="touch" variant="secondary" disabled={busy} onClick={() => act('dismiss')}><ShieldCheck size={16} aria-hidden="true" />Không vi phạm</Button>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

/** Hàng chờ báo vi phạm: người dùng báo tin đăng / trang công khai; xử lý một lần cho mọi báo cáo cùng nội dung. */
export default function Reports() {
  const [f, setF] = useUrlState({ status: 'open' });
  const [state, reload] = useLoad(() => adminCommunityApi.reports(f.status as ReportStatus | 'all'), [f.status]);
  const [sel, setSel] = useState<string | null>(null);
  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    if (data && !data.items.some((r) => r.id === sel)) setSel(data.items[0]?.id ?? null);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = data?.items.find((r) => r.id === sel) ?? null;
  const n = (k: ReportStatus) => (data ? ` (${data.summary[k]})` : '');
  return (
    <>
      <PageHeader title="Báo vi phạm" sub="Người dùng báo tin đăng, trang công khai · xử lý một lần cho mọi báo cáo về cùng nội dung" />
      <Tabs value={f.status} onChange={(status) => setF({ status })}
        tabs={[['open', `Chờ xử lý${n('open')}`], ['actioned', `Đã ẩn${n('actioned')}`], ['dismissed', `Không vi phạm${n('dismissed')}`], ['all', 'Tất cả']]} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Panel pad={false}>
          <TableView state={state}>
            {(d) => d.items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-caption text-ink-muted">
                <Flag size={28} aria-hidden="true" />
                {f.status === 'open' ? 'Không có báo cáo nào đang chờ.' : 'Chưa có báo cáo.'}
              </div>
            ) : (
              <ul className="m-0 list-none divide-y divide-line p-0">
                {d.items.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setSel(r.id)} aria-pressed={r.id === sel}
                      className={cx('flex w-full items-center gap-3 px-4 py-3 text-left text-caption hover:bg-surface-2', r.id === sel && 'bg-surface-2')}>
                      {r.target?.photo_url ? <img src={r.target.photo_url} alt="" className="h-12 w-12 flex-none rounded-btn object-cover" />
                        : <span className="flex h-12 w-12 flex-none items-center justify-center rounded-btn bg-surface-2 text-ink-muted"><UserRound size={20} aria-hidden="true" /></span>}
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-semibold">{r.target?.title ?? 'Nội dung đã xóa'}</span>
                        <span className="truncate text-label text-ink-muted">{r.kind_vi} · {r.owner?.name ?? '—'}{r.note ? ` · “${r.note}”` : ''}</span>
                      </span>
                      <span className="flex flex-none flex-col items-end gap-1">
                        <Badge tone={STATUS_TONE[r.status]}>{r.status === 'open' ? r.reason_vi : STATUS_VI[r.status]}</Badge>
                        <span className="text-label text-ink-subtle">{r.reports_on_target > 1 ? `${r.reports_on_target} lần · ` : ''}{dt(r.created_at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TableView>
        </Panel>
        {current ? <Detail key={current.id} r={current} onDone={reload} /> : null}
      </div>
    </>
  );
}
