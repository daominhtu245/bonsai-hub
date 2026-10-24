import { useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { IconBadge } from '@/components/ui';
import { communityApi, type Skill } from '@/lib/community';
import { cx } from '@/lib/cx';

const LEVELS = [['hoc_tro', 'Học trò'], ['tho', 'Thợ'], ['nghe_nhan', 'Nghệ nhân']] as const;

/** B7 — Bậc tay nghề: Học trò → Thợ → Nghệ nhân, tiến độ tới bậc sau. */
export function SkillCard() {
  const [s, setS] = useState<Skill | null>(null);
  useEffect(() => { communityApi.skill().then(setS).catch(() => setS(null)); }, []);
  if (!s) return null;
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card" aria-label="Bậc tay nghề">
      <div className="flex items-center gap-3">
        <IconBadge Icon={Award} tone="brass" />
        <span className="flex flex-col"><span className="text-label text-ink-muted">Bậc tay nghề</span><span className="text-h2">{s.level_vi}</span></span>
      </div>
      <ol className="m-0 mt-3 flex list-none items-center p-0" aria-label="Các bậc">
        {LEVELS.map(([k, label], i) => {
          const idx = LEVELS.findIndex(([x]) => x === s.level);
          return (
            <li key={k} className="flex flex-1 items-center last:flex-none">
              <span className={cx('flex flex-col items-center gap-1 text-label', i <= idx ? 'font-semibold text-ink' : 'text-ink-subtle')}>
                <span className={cx('h-3 w-3 rounded-full', i < idx ? 'bg-primary' : i === idx ? 'bg-primary ring-4 ring-primary-soft' : 'bg-line-strong')} />
                {label}
              </span>
              {i < LEVELS.length - 1 ? <span aria-hidden="true" className={cx('mx-1 mb-5 h-0.5 flex-1', i < idx ? 'bg-primary' : 'bg-line')} /> : null}
            </li>
          );
        })}
      </ol>
      {s.next_vi ? <div className="mt-3 text-label text-ink-muted">Lên bậc {s.next_vi}:</div> : null}
      {s.progress.length ? (
        <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
          {s.progress.map((p) => (
            <li key={p.key} className="text-label">
              <div className="flex justify-between"><span>{p.label_vi}</span><span className="tabular text-ink-muted">{Math.min(p.have, p.need)}/{p.need}</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={p.label_vi} aria-valuemin={0} aria-valuemax={p.need} aria-valuenow={Math.min(p.have, p.need)}>
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (p.have / p.need) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
