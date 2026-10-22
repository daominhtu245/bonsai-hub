import { Check } from 'lucide-react';
import { cx } from '@/lib/cx';

export type StageCode = 'S0' | 'S1' | 'S2' | 'S3' | 'S4';

export interface StageTab {
  code: StageCode;
  short: string;
}

/** Tab giai đoạn S0–S4 dạng thanh tiến trình chia đoạn: đã qua (✓) · đang xem · chưa tới. Hẹp quá thì cuộn ngang. */
export function StageTimeline({ stages, current, onSelect }: { stages: StageTab[]; current: number; onSelect: (index: number) => void }) {
  return (
    <nav aria-label="Các giai đoạn" className="overflow-x-auto">
      <ol className="m-0 grid min-w-[17rem] list-none gap-1 p-0" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
        {stages.map((s, i) => {
          const state = i === current ? 'current' : i < current ? 'past' : 'future';
          return (
            <li key={s.code}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-pressed={state === 'current'}
                aria-label={`${s.code} ${s.short}`}
                className="group flex min-h-touch w-full flex-col gap-1.5 rounded-btn pb-1 pt-1 text-left"
              >
                <span className={cx('h-1 w-full rounded-full transition-colors duration-base', state === 'future' ? 'bg-line' : 'bg-primary', state === 'past' && 'opacity-40')} />
                <span className="flex items-center gap-1 px-0.5">
                  <span className={cx('tabular text-label font-semibold', state === 'current' ? 'text-ink' : 'text-ink-subtle')}>{s.code}</span>
                  {state === 'past' ? <Check size={12} strokeWidth={2.5} className="text-primary" aria-hidden="true" /> : null}
                </span>
                <span className={cx('px-0.5 text-label leading-tight', state === 'current' ? 'font-medium text-ink' : 'text-ink-muted group-hover:text-ink')}>{s.short}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
