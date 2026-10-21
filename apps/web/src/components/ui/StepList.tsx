import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export type StepState = 'done' | 'current' | 'pending';

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done')
    return (
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-leaf" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--surface)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
      </span>
    );
  if (state === 'current')
    return (
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full border-2 border-primary" aria-hidden="true">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
      </span>
    );
  return <span className="h-7 w-7 flex-none rounded-full border-[1.5px] border-line-strong" aria-hidden="true" />;
}

/** Danh sách bước AI đang làm (màn 04 và màn chờ ảnh). Trạng thái đọc được cả bằng chữ, không chỉ bằng màu. */
export function StepList({ steps }: { steps: Array<{ key: string; state: StepState; label: ReactNode }> }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-1 p-0" aria-live="polite">
      {steps.map((s) => (
        <li key={s.key} className={cx('flex min-h-touch items-center gap-3', s.state === 'pending' && 'text-ink-muted', s.state === 'current' && 'font-semibold')}>
          <StepIcon state={s.state} />
          <span>
            {s.label}
            <span className="sr-only">{s.state === 'done' ? ' (xong)' : s.state === 'current' ? ' (đang làm)' : ' (chưa tới)'}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
