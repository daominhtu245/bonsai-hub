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
  care?: string[];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="font-body text-caption font-semibold text-ink-muted">{title}</h3>
      {children}
    </div>
  );
}

/** Thẻ hướng dẫn một giai đoạn (màn 06, design/mockups/Result.dc.html). `done` lưu theo cây ở tầng trên. */
export function GuideCard({ guide, done, onToggle }: { guide: StageGuide; done: Set<number>; onToggle: (index: number) => void }) {
  return (
    <section aria-labelledby={`guide-${guide.code}`} className="flex flex-col gap-3.5 rounded-card border border-line bg-surface px-4 py-[18px]">
      <div>
        <div className="text-caption font-semibold text-clay">
          {guide.code} · {guide.time}
        </div>
        <h2 id={`guide-${guide.code}`} className="mt-0.5 text-h2">
          {guide.name}
        </h2>
      </div>

      <Section title="Bạn sẽ thấy">
        <p className="m-0">{guide.see}</p>
      </Section>

      {guide.actions.length > 0 ? (
        <Section title="Việc cần làm">
          <ul className="m-0 flex list-none flex-col p-0">
            {guide.actions.map((a, i) => (
              <li key={i}>
                <label className="flex min-h-touch cursor-pointer items-start gap-2.5 py-1">
                  <input
                    type="checkbox"
                    checked={done.has(i)}
                    onChange={() => onToggle(i)}
                    className="mt-0.5 h-[22px] w-[22px] flex-none accent-[var(--primary)]"
                  />
                  <span className={done.has(i) ? 'text-ink-muted line-through' : undefined}>{a}</span>
                </label>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="flex items-start gap-2.5 rounded-btn bg-bg px-3 py-2.5">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" className="mt-0.5 flex-none"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
        <div>
          <div className="text-caption text-ink-muted">Thời điểm tốt nhất</div>
          <div className="font-medium">{guide.season}</div>
        </div>
      </div>

      {guide.care && guide.care.length > 0 ? (
        <Section title="Chăm sóc trong giai đoạn">
          <ul className="m-0 flex flex-col gap-1 pl-5">
            {guide.care.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {guide.ready.length > 0 && (
        <Section title="Sẵn sàng sang giai đoạn sau khi">
          <ul className="m-0 flex flex-col gap-1 pl-5">
            {guide.ready.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Section>
      )}

      {guide.mistake ? (
        <div className="flex items-start gap-2.5 rounded-btn border border-warn bg-warn-soft px-3 py-2.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--warn-ink)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 flex-none"><path d="M12 4 2.5 20h19L12 4Zm0 6v4m0 3h.01" /></svg>
          <div>
            <div className="text-caption font-semibold text-warn-ink">Lỗi hay gặp</div>
            <div className="text-caption">{guide.mistake}</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
