import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BottomNav } from '@/components/BottomNav';
import { ButtonLink, EmptyState, FilterChip, Skeleton, StateView, type ViewState } from '@/components/ui';
import { accountApi, type GardenTree } from '@/lib/account';
import { ApiError } from '@/lib/api';
import { SPECIES_NAME } from '@/lib/copy';
import { cx } from '@/lib/cx';

function destination(t: GardenTree): { to: string; status: string; cta: string | null } {
  const id = t.job_id;
  switch (t.job_status) {
    case 'done':
      return { to: `/ket-qua/${id}`, status: [t.style_vi, t.stage_code && `${t.stage_code} ${t.stage_name_vi}`].filter(Boolean).join(' · '), cta: null };
    case 'awaiting_choice':
      return { to: `/chon/${id}`, status: 'Đã phân tích · chưa chọn thế', cta: 'Chọn thế để tạo ảnh' };
    case 'failed':
      return t.style_vi
        ? { to: `/ket-qua/${id}`, status: `${t.style_vi} · tạo ảnh chưa thành công`, cta: 'Đã hoàn lượt' }
        : { to: `/phan-tich/${id}`, status: 'Phân tích chưa xong', cta: 'Xem cách chụp lại' };
    case null:
      return { to: '/chup', status: 'Chưa phân tích', cta: null };
    case 'queued':
    case 'analyzing':
    case 'designing':
      return { to: `/phan-tich/${id}`, status: 'Đang phân tích…', cta: null };
    default:
      return { to: `/ket-qua/${id}`, status: 'Đang tạo ảnh tương lai…', cta: null };
  }
}

function TreeCard({ t }: { t: GardenTree }) {
  const d = destination(t);
  return (
    <Link to={d.to} className="flex flex-wrap gap-3 rounded-card border border-line bg-surface p-3 text-ink no-underline hover:text-ink">
      <div className="h-[84px] w-[84px] flex-none overflow-hidden rounded-img bg-photo">
        {t.thumbnail_url ? <img src={t.thumbnail_url} alt="" className="h-full w-full object-cover" /> : null}
      </div>
      <div className="flex min-w-[9rem] flex-1 flex-col gap-1">
        <span className="font-semibold [overflow-wrap:anywhere]">{t.nickname || (t.species_key ? `Phôi ${SPECIES_NAME[t.species_key]?.toLowerCase() ?? ''}` : 'Cây chưa đặt tên')}</span>
        <span className="text-caption text-ink-muted">{d.status}</span>
        {t.job_status === 'done' ? (
          <>
            <div className="flex gap-1" aria-label={`Đã xong ${t.stages_done}/5 giai đoạn`} role="img">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className={cx('h-1.5 flex-1 rounded-full', i < t.stages_done ? 'bg-primary' : i === t.stages_done ? 'bg-brass' : 'bg-line')} />
              ))}
            </div>
            <span className="text-caption">{t.next_task_vi ?? <span className="text-ink-muted">Không còn việc ở giai đoạn này</span>}</span>
          </>
        ) : d.cta ? (
          <span className="text-caption font-medium text-primary-ink">{d.cta}</span>
        ) : null}
      </div>
    </Link>
  );
}

/** Màn 08 — Vườn của tôi (design/mockups/Garden.dc.html). */
export default function Garden() {
  const [state, setState] = useState<ViewState<{ trees: GardenTree[]; credits: number }>>({ status: 'loading' });
  const [todoOnly, setTodoOnly] = useState(false);

  const load = () => {
    setState({ status: 'loading' });
    accountApi
      .garden()
      .then((g) => setState(g.trees.length ? { status: 'ready', data: g } : { status: 'empty' }))
      .catch((e: ApiError) => setState({ status: 'error', message: e.message, retry: load }));
  };
  useEffect(load, []);

  const data = state.status === 'ready' ? state.data : null;
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <header className="flex items-center gap-3 px-gutter pb-2 pt-4">
        <div className="flex-1">
          <h1 className="text-h1">Vườn của tôi</h1>
          {data ? <span className="text-caption text-ink-muted">{data.trees.length} cây · còn {data.credits} lượt</span> : null}
        </div>
        <ButtonLink to="/chup" size="touch" block={false}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Thêm cây
        </ButtonLink>
      </header>
      <main className="flex flex-col gap-3 px-gutter pb-6 pt-2">
        {data ? (
          <div className="flex gap-2" role="group" aria-label="Lọc cây">
            <FilterChip selected={!todoOnly} onClick={() => setTodoOnly(false)}>Tất cả</FilterChip>
            <FilterChip selected={todoOnly} onClick={() => setTodoOnly(true)}>Còn việc cần làm</FilterChip>
          </div>
        ) : null}
        <StateView
          state={state}
          skeleton={<div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[110px] rounded-card" />)}</div>}
          empty={<EmptyState title="Vườn còn trống" body="Chụp phôi đầu tiên để nhận bản vẽ và lộ trình chăm." action={<ButtonLink to="/chup" block={false}>Chụp phôi</ButtonLink>} />}
        >
          {(g) => {
            const list = todoOnly ? g.trees.filter((t) => t.next_task_vi) : g.trees;
            return list.length ? (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {list.map((t) => <li key={t.tree_id}><TreeCard t={t} /></li>)}
              </ul>
            ) : (
              <EmptyState title="Không còn việc cần làm" body="Các cây của bạn đã xong việc ở giai đoạn hiện tại." />
            );
          }}
        </StateView>
      </main>
      <BottomNav />
    </div>
  );
}
