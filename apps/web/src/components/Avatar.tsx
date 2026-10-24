import { cx } from '@/lib/cx';

/** Ảnh đại diện bằng chữ cái đầu (không dùng hình hoạt hình). */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const parts = name.trim().split(/\s+/);
  const letters = (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();
  return (
    <span aria-hidden="true" className={cx('flex flex-none items-center justify-center rounded-full bg-primary-soft font-semibold text-primary-ink',
      size === 'sm' ? 'h-8 w-8 text-label' : size === 'lg' ? 'h-16 w-16 text-h2' : 'h-12 w-12 text-body')}>
      {letters}
    </span>
  );
}

export function Stars({ value }: { value: number }) {
  return <span className="tabular text-label font-semibold text-brass" aria-label={`${value} trên 5 sao`}>★ {value.toLocaleString('vi-VN')}</span>;
}
