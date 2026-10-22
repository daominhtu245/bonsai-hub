import type { ReactNode } from 'react';
import { AlertTriangle, CalendarDays } from 'lucide-react';

export interface StageGuide {
  code: string;
  name: string;
  time: string;
  see: string;
  actions: string[];
  season: string;
  ready: string[];
  mistake: string;
  care?: string[];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-3.5">
      <h3 className="eyebrow">{title}</h3>
      {children}
    </div>
  );
}

/** Hướng dẫn một giai đoạn (màn 06). Việc cần làm là checklist lưu theo cây. */
export function GuideCard({ guide, done, onToggle }: { guide: StageGuide; done: Set<number>; onToggle: (index: number) => void }) {
  const total = guide.actions.length;
  return (
    <section aria-labelledby={`guide-${guide.code}`} className="flex flex-col gap-3.5 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="tabular text-label font-medium text-ink-subtle">
            {guide.code} · {guide.time}
          </div>
          <h2 id={`guide-${guide.code}`} className="mt-0.5 text-h1">
            {guide.name}
          </h2>
        </div>
        {total ? <span className="tabular mt-1 flex-none rounded-chip bg-surface-2 px-2 py-0.5 text-label font-medium text-ink-muted">{done.size}/{total}</span> : null}
      </div>

      <p className="m-0 text-ink-muted">{guide.see}</p>

      {total > 0 ? (
        <Section title="Việc cần làm">
          <ul className="m-0 flex list-none flex-col p-0">
            {guide.actions.map((a, i) => (
              <li key={i}>
                <label className="flex min-h-touch cursor-pointer items-start gap-3 py-1.5">
                  <input type="checkbox" checked={done.has(i)} onChange={() => onToggle(i)} className="mt-0.5 h-5 w-5 flex-none" />
                  <span className={done.has(i) ? 'text-ink-subtle line-through' : undefined}>{a}</span>
                </label>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="flex items-start gap-2.5 rounded-btn bg-surface-2 px-3 py-2.5 text-caption">
        <CalendarDays size={18} strokeWidth={1.75} className="mt-0.5 flex-none text-ink-muted" aria-hidden="true" />
        <div>
          <div className="text-label text-ink-subtle">Thời điểm tốt nhất</div>
          <div className="font-medium">{guide.season}</div>
        </div>
      </div>

      {guide.care && guide.care.length > 0 ? (
        <Section title="Chăm sóc">
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-caption">
            {guide.care.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </Section>
      ) : null}

      {guide.ready.length > 0 && (
        <Section title="Sang giai đoạn sau khi">
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-caption">
            {guide.ready.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </Section>
      )}

      {guide.mistake ? (
        <div className="flex items-start gap-2.5 rounded-btn bg-warn-soft px-3 py-2.5 text-caption text-warn-ink">
          <AlertTriangle size={18} strokeWidth={1.75} className="mt-px flex-none" aria-hidden="true" />
          <div>
            <span className="font-semibold">Lỗi hay gặp. </span>
            {guide.mistake}
          </div>
        </div>
      ) : null}
    </section>
  );
}
