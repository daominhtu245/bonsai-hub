import { useEffect, useState } from 'react';
import { communityApi, type Skill } from '@/lib/community';

/** B7 — Bậc tay nghề: Học trò → Thợ → Nghệ nhân, tiến độ tới bậc sau. */
export function SkillCard() {
  const [s, setS] = useState<Skill | null>(null);
  useEffect(() => { communityApi.skill().then(setS).catch(() => setS(null)); }, []);
  if (!s) return null;
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card" aria-label="Bậc tay nghề">
      <div className="flex items-baseline justify-between">
        <span className="text-body font-semibold">{s.level_vi}</span>
        {s.next_vi ? <span className="text-label text-ink-muted">Bậc sau: {s.next_vi}</span> : null}
      </div>
      {s.progress.length ? (
        <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
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
