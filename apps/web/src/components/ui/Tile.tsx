import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cx } from '@/lib/cx';

export type Tone = 'leaf' | 'clay' | 'brass' | 'ink' | 'seal';
const TONE: Record<Tone, string> = {
  leaf: 'bg-primary-soft text-primary-ink',
  clay: 'bg-clay-soft text-clay',
  brass: 'bg-warn-soft text-warn-ink',
  ink: 'bg-surface-2 text-ink',
  seal: 'bg-danger-soft text-danger',
};

export function IconBadge({ Icon, tone = 'ink', size = 'md' }: { Icon: LucideIcon; tone?: Tone; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={cx('flex flex-none items-center justify-center rounded-full', TONE[tone], size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-8 w-8' : 'h-10 w-10')}>
      <Icon size={size === 'lg' ? 26 : size === 'sm' ? 16 : 20} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

/** Ô lối tắt dạng lưới: biểu tượng màu + tên + một dòng phụ (có thể là số liệu sống, vd. "3 tin mới"). */
export function Tile({ to, title, sub, Icon, tone = 'ink', badge }: { to: string; title: string; sub?: string; Icon: LucideIcon; tone?: Tone; badge?: string }) {
  return (
    <Link to={to} className="relative flex min-h-[112px] flex-col justify-between gap-3 rounded-card border border-line bg-surface p-3 text-ink no-underline shadow-card transition-colors duration-fast hover:bg-surface-2">
      <IconBadge Icon={Icon} tone={tone} />
      <span className="flex flex-col">
        <span className="text-body font-semibold leading-tight">{title}</span>
        {sub ? <span className="mt-0.5 text-label text-ink-muted">{sub}</span> : null}
      </span>
      {badge ? <span className="absolute right-2.5 top-2.5 rounded-chip bg-primary px-1.5 py-0.5 text-label font-semibold text-primary-on">{badge}</span> : null}
    </Link>
  );
}
