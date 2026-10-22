import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cx } from '@/lib/cx';

type Tone = 'warn' | 'danger' | 'success' | 'info';

const tones: Record<Tone, string> = {
  warn: 'bg-warn-soft text-warn-ink',
  danger: 'bg-danger-soft text-danger',
  success: 'bg-primary-soft text-primary-ink',
  info: 'bg-surface-2 text-ink-muted',
};
const icons = { warn: AlertTriangle, danger: XCircle, success: CheckCircle2, info: Info };

/** Thông báo ngắn kèm icon (không dùng màu là tín hiệu duy nhất). */
export function Notice({ tone, children, action, className }: { tone: Tone; children: ReactNode; action?: ReactNode; className?: string }) {
  const Icon = icons[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex items-start gap-2.5 rounded-btn px-3 py-2.5 text-caption', tones[tone], className)}>
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" className="mt-px flex-none" />
      <div className="flex flex-1 flex-col gap-2">
        <div>{children}</div>
        {action}
      </div>
    </div>
  );
}
