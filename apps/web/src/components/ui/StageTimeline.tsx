import { cx } from '@/lib/cx';

export type StageCode = 'S0' | 'S1' | 'S2' | 'S3' | 'S4';

export interface StageTab {
  code: StageCode;
  short: string;
}

/** Timeline S0–S4: đã qua · đang xem · chưa tới. */
export function StageTimeline({ stages, current, onSelect }: { stages: StageTab[]; current: number; onSelect: (index: number) => void }) {
  return (
    <nav aria-label="Các giai đoạn" className="relative">
      <div aria-hidden="true" className="absolute left-[10%] right-[10%] top-[22px] h-px bg-line-strong" />
      <ol className="relative m-0 grid list-none p-0" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
        {stages.map((s, i) => {
          const state = i === current ? 'current' : i < current ? 'past' : 'future';
          return (
            <li key={s.code} className="flex justify-center">
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-pressed={state === 'current'}
                aria-label={`${s.code} ${s.short}`}
                className="flex min-w-touch flex-col items-center gap-1.5 rounded-btn px-1 pb-1"
              >
                <span
                  className={cx(
                    'flex h-touch w-touch items-center justify-center rounded-full text-caption transition-colors duration-base ease-calm',
                    state === 'current' && 'bg-primary font-semibold text-primary-on',
                    state === 'past' && 'bg-primary-soft font-semibold text-primary-ink',
                    state === 'future' && 'border border-line-strong bg-surface text-ink-muted',
                  )}
                >
                  {s.code}
                </span>
                <span className={cx('text-label', state === 'current' ? 'font-semibold text-ink' : 'text-ink-muted')}>{s.short}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
