import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui';
import { accountApi, type GardenTree } from '@/lib/account';
import { cx } from '@/lib/cx';

/** Chọn một cây trong vườn (có phiên thiết kế) — dùng khi hỏi nghệ nhân, gửi chăm hộ. */
export function TreePicker({ value, onChange, needJob = true }: { value: string | null; onChange: (t: GardenTree) => void; needJob?: boolean }) {
  const [trees, setTrees] = useState<GardenTree[] | null>(null);
  useEffect(() => { accountApi.garden().then((g) => setTrees(g.trees.filter((t) => !needJob || t.job_id))).catch(() => setTrees([])); }, [needJob]);
  if (trees === null) return <Skeleton className="h-24 rounded-card" />;
  if (!trees.length) return <p className="m-0 text-caption text-ink-muted">Chưa có cây nào đã phân tích.</p>;
  return (
    <ul className="-mx-gutter m-0 flex list-none gap-2 overflow-x-auto px-gutter p-0" role="radiogroup" aria-label="Chọn cây">
      {trees.map((t) => (
        <li key={t.tree_id} className="flex-none">
          <button type="button" role="radio" aria-checked={value === t.tree_id} onClick={() => onChange(t)}
            className={cx('flex w-24 flex-col items-center gap-1 rounded-card border p-1.5 text-label', value === t.tree_id ? 'border-ink bg-surface-2' : 'border-line bg-surface')}>
            {t.thumbnail_url ? <img src={t.thumbnail_url} alt="" className="aspect-square w-full rounded-img object-cover" /> : <span className="aspect-square w-full rounded-img bg-surface-2" />}
            <span className="w-full truncate">{t.nickname || 'Cây chưa đặt tên'}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
