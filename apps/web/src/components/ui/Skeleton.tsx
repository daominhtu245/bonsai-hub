import { cx } from '@/lib/cx';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-img bg-line', className)} />;
}
