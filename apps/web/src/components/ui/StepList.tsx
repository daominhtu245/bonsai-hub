import type { ReactNode } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cx } from '@/lib/cx';

export type StepState = 'done' | 'current' | 'pending';

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done')
    return (
      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary text-primary-on" aria-hidden="true">
        <Check size={14} strokeWidth={2.5} />
      </span>
    );
  if (state === 'current')
    return (
      <span className="flex h-6 w-6 flex-none items-center justify-center text-primary" aria-hidden="true">
        <Loader2 size={18} className="animate-spin" />
      </span>
    );
  return <span className="h-6 w-6 flex-none rounded-full border border-line-strong" aria-hidden="true" />;
}

/** Danh sách bước đang xử lý. Trạng thái đọc được bằng chữ (sr-only), không chỉ bằng màu. */
export function StepList({ steps }: { steps: Array<{ key: string; state: StepState; label: ReactNode }> }) {
  return (
    <ol className="m-0 flex list-none flex-col p-0" aria-live="polite">
      {steps.map((s) => (
        <li key={s.key} className={cx('flex min-h-[40px] items-center gap-3 text-caption', s.state === 'pending' && 'text-ink-subtle', s.state === 'current' && 'font-medium text-ink')}>
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
