import type { ReactNode } from 'react';

export interface StageGuide {
  code: string;
  name: string;
  time: string;
  see: string;
  actions: string[];
  season: string;
  ready: string[];
  mistake: string;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="font-body text-label font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
      {children}
    </div>
  );
}

/** Thẻ hướng dẫn một giai đoạn (màn hình 06). `done` lưu theo cây ở tầng trên. */
export function GuideCard({ guide, done, onToggle }: { guide: StageGuide; done: Set<number>; onToggle: (index: number) => void }) {
  return (
    <section aria-labelledby={`guide-${guide.code}`} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
      <div>
        <div className="text-label text-ink-muted">
          {guide.code} · {guide.time}
        </div>
        <h2 id={`guide-${guide.code}`} className="text-h2">
          {guide.name}
        </h2>
      </div>

      <Section title="Bạn sẽ thấy">
        <p className="m-0">{guide.see}</p>
      </Section>

      <Section title="Việc cần làm">
        <ul className="m-0 flex list-none flex-col p-0">
          {guide.actions.map((a, i) => (
            <li key={i}>
              <label className="flex min-h-touch cursor-pointer items-start gap-3 py-2">
                <input
                  type="checkbox"
                  checked={done.has(i)}
                  onChange={() => onToggle(i)}
                  className="mt-0.5 h-6 w-6 flex-none accent-[var(--primary)]"
                />
                <span className={done.has(i) ? 'text-ink-muted line-through' : undefined}>{a}</span>
              </label>
            </li>
          ))}
        </ul>
      </Section>

      <div className="rounded-btn bg-primary-soft px-3 py-2.5 text-primary-ink">
        <div className="text-label font-semibold">Thời điểm tốt nhất</div>
        <div>{guide.season}</div>
      </div>

      {guide.ready.length > 0 && (
        <Section title="Sẵn sàng sang giai đoạn sau khi">
          <ul className="m-0 flex flex-col gap-1 pl-5">
            {guide.ready.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Section>
      )}

      <div className="rounded-btn border-l-4 border-seal bg-clay-soft px-3 py-2.5">
        <div className="text-label font-semibold text-seal">Lỗi hay gặp</div>
        <div>{guide.mistake}</div>
      </div>
    </section>
  );
}
