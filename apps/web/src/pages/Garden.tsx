import { useEffect, useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BottomNav } from '@/components/BottomNav';
import { ReceiveTree } from '@/components/ReceiveTree';
import { ButtonLink, EmptyState, Segmented, Skeleton, StateView, type ViewState } from '@/components/ui';
import { accountApi, type GardenTree } from '@/lib/account';
import { ApiError } from '@/lib/api';
import { SPECIES_NAME } from '@/lib/copy';
import { cx } from '@/lib/cx';
import { useFeatures } from '@/lib/features';

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
  const name = t.nickname || (t.species_key ? `Phôi ${SPECIES_NAME[t.species_key]?.toLowerCase() ?? ''}` : 'Cây chưa đặt tên');
  return (
    <Link to={d.to} className="flex items-center gap-3 px-3 py-3 text-ink no-underline hover:bg-surface-2 hover:text-ink">
      <span className="h-14 w-14 flex-none overflow-hidden rounded-[6px] bg-photo">
        {t.thumbnail_url ? <img src={t.thumbnail_url} alt="" className="h-full w-full object-cover" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium [overflow-wrap:anywhere]">{name}</span>
        <span className="text-label text-ink-muted">{d.status}</span>
        {t.job_status === 'done' ? (
          <>
            <span className="flex gap-0.5" aria-label={`Đã xong ${t.stages_done}/5 giai đoạn`} role="img">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={cx('h-1 flex-1 rounded-full', i < t.stages_done ? 'bg-primary' : i === t.stages_done ? 'bg-ink-subtle' : 'bg-line')} />
              ))}
            </span>
            {t.next_task_vi ? <span className="text-label [overflow-wrap:anywhere]">Tiếp theo: {t.next_task_vi}</span> : null}
          </>
        ) : d.cta ? (
          <span className="text-label font-medium text-primary">{d.cta}</span>
        ) : null}
      </span>
      <ChevronRight size={16} className="flex-none text-ink-subtle" aria-hidden="true" />
    </Link>
  );
}

/** Màn 08 — Vườn của tôi (design/mockups/Garden.dc.html). */
export default function Garden() {
  const [state, setState] = useState<ViewState<{ trees: GardenTree[]; credits: number }>>({ status: 'loading' });
  const [todoOnly, setTodoOnly] = useState(false);
  const on = useFeatures();

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
      <header className="flex items-center gap-3 px-gutter pb-3 pt-5">
        <div className="flex-1">
          <h1 className="text-h1">Vườn của tôi</h1>
          {data ? <span className="tabular text-caption text-ink-muted">{data.trees.length} cây · {data.credits} lượt</span> : null}
        </div>
        <ButtonLink to="/chup" size="touch" block={false}>
          <Plus size={18} strokeWidth={2} aria-hidden="true" />
          Thêm cây
        </ButtonLink>
      </header>
      <main className="flex flex-col gap-3 px-gutter pb-6">
        {data ? <Segmented<'all' | 'todo'> label="Lọc cây" value={todoOnly ? 'todo' : 'all'} onChange={(v) => setTodoOnly(v === 'todo')} options={[['all', 'Tất cả'], ['todo', 'Còn việc cần làm']]} /> : null}
        <StateView
          state={state}
          skeleton={<Skeleton className="h-60 rounded-card" />}
          empty={<EmptyState image="/images/cutout.webp" title="Chưa có cây nào" body="Chụp phôi đầu tiên để nhận bản vẽ và lộ trình." action={<ButtonLink to="/chup" block={false}>Chụp phôi</ButtonLink>} />}
        >
          {(g) => {
            const list = todoOnly ? g.trees.filter((t) => t.next_task_vi) : g.trees;
            return list.length ? (
              <ul className="m-0 list-none divide-y divide-line overflow-hidden rounded-card border border-line bg-surface p-0 shadow-card">
                {list.map((t) => <li key={t.tree_id}><TreeCard t={t} /></li>)}
              </ul>
            ) : (
              <EmptyState title="Không còn việc cần làm" />
            );
          }}
        </StateView>
      </main>
      {on('passport') ? <ReceiveTree onReceived={load} /> : null}
      <div className="h-6" />
      <BottomNav />
    </div>
  );
}
