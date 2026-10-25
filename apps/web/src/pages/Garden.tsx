import { useEffect, useState } from 'react';
import { Coins, ListChecks, Plus, Sprout, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BottomNav } from '@/components/BottomNav';
import { ReceiveTree } from '@/components/ReceiveTree';
import { TreePhotoCard } from '@/components/TreePhotoCard';
import { ButtonLink, EmptyState, FilterChip, PhotoHero, Skeleton, StateView, type ViewState } from '@/components/ui';
import { accountApi, type GardenTree } from '@/lib/account';
import { ApiError } from '@/lib/api';
import { useFeatures } from '@/lib/features';

type Filter = 'all' | 'todo' | 'choose';
const FILTERS: Array<[Filter, string, (t: GardenTree) => boolean]> = [
  ['all', 'Tất cả', () => true],
  ['todo', 'Còn việc cần làm', (t) => Boolean(t.next_task_vi)],
  ['choose', 'Chờ chọn thế', (t) => t.job_status === 'awaiting_choice'],
];

function Stat({ to, Icon, value, label }: { to: string; Icon: LucideIcon; value: number; label: string }) {
  return (
    <Link to={to} className="flex min-h-touch flex-1 items-center gap-2 px-3 py-2.5 text-ink no-underline hover:bg-surface-2 hover:text-ink">
      <Icon size={18} strokeWidth={1.75} className="flex-none text-primary" aria-hidden="true" />
      <span className="flex flex-col leading-tight">
        <span className="tabular text-h2">{value}</span>
        <span className="text-label text-ink-muted">{label}</span>
      </span>
    </Link>
  );
}

/** Màn 08 — Vườn của tôi: lưới ảnh cây (phôi → minh họa tương lai), số liệu nhanh, lọc theo việc cần làm. */
export default function Garden() {
  const [state, setState] = useState<ViewState<{ trees: GardenTree[]; credits: number }>>({ status: 'loading' });
  const [filter, setFilter] = useState<Filter>('all');
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
  const count = (f: Filter) => (data ? data.trees.filter(FILTERS.find(([k]) => k === f)![2]).length : 0);
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <header className="flex items-center gap-3 px-gutter pb-3 pt-5">
        <h1 className="flex-1 text-h1">Vườn của tôi</h1>
        <ButtonLink to="/chup" size="touch" block={false}>
          <Plus size={18} strokeWidth={2} aria-hidden="true" />
          Thêm cây
        </ButtonLink>
      </header>
      <main className="flex flex-col gap-3 px-gutter pb-6">
        {data ? (
          <>
            <section aria-label="Tổng quan vườn" className="flex divide-x divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
              <Stat to="/vuon" Icon={Sprout} value={data.trees.length} label="cây" />
              <Stat to="/vuon" Icon={ListChecks} value={count('todo')} label="việc" />
              <Stat to="/mua-luot" Icon={Coins} value={data.credits} label="lượt" />
            </section>
            <div className="-mx-gutter flex gap-2 overflow-x-auto px-gutter" role="group" aria-label="Lọc cây">
              {FILTERS.filter(([k]) => k === 'all' || count(k) > 0).map(([k, label]) => (
                <FilterChip key={k} selected={filter === k} onClick={() => setFilter(k)} className="flex-none">
                  {label}
                  <span className="tabular opacity-70">{count(k)}</span>
                </FilterChip>
              ))}
            </div>
          </>
        ) : null}
        <StateView
          state={state}
          skeleton={<div className="grid grid-cols-2 gap-3"><Skeleton className="aspect-[4/6] rounded-card" /><Skeleton className="aspect-[4/6] rounded-card" /></div>}
          empty={(
            <PhotoHero src="/images/juniper.webp" title="Chưa có cây nào" sub="Chụp phôi đầu tiên để xem nó sẽ thành cây gì." ratio="4 / 3">
              <ButtonLink to="/chup" block={false} size="touch" className="self-start">Chụp phôi</ButtonLink>
            </PhotoHero>
          )}
        >
          {(g) => {
            const list = g.trees.filter(FILTERS.find(([k]) => k === filter)![2]);
            return list.length ? (
              <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0">
                {list.map((t) => <li key={t.tree_id}><TreePhotoCard t={t} /></li>)}
              </ul>
            ) : (
              <EmptyState title="Không còn việc cần làm" />
            );
          }}
        </StateView>
        {on('passport') ? <ReceiveTree onReceived={load} /> : null}
      </main>
      <BottomNav />
    </div>
  );
}
