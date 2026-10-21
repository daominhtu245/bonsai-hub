import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Tone = 'warn' | 'danger' | 'success';

const tones: Record<Tone, string> = {
  warn: 'bg-warn-soft text-warn-ink border-warn',
  danger: 'bg-danger-soft text-danger border-danger',
  success: 'bg-primary-soft text-primary-ink border-primary',
};

const icons: Record<Tone, ReactNode> = {
  warn: <path d="M12 4 2.5 20h19L12 4Zm0 6v4m0 3h.01" />,
  danger: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v5m0 3h.01" />,
  success: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-4 9 3 3 5-6" />,
};

/** Thông báo — luôn nói việc tiếp theo cần làm. Có icon để không dùng màu là tín hiệu duy nhất. */
export function Notice({ tone, children, action, className }: { tone: Tone; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx('flex items-start gap-2.5 rounded-btn border border-l-4 px-3 py-2.5 text-caption', tones[tone], className)}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px flex-none">
        {icons[tone]}
      </svg>
      <div className="flex flex-1 flex-col gap-2">
        <div>{children}</div>
        {action}
      </div>
    </div>
  );
}
