import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Tone = 'soft' | 'species' | 'outline';

const tones: Record<Tone, string> = {
  soft: 'bg-primary-soft text-primary-ink font-medium',
  species: 'bg-clay-soft text-clay font-semibold',
  outline: 'border border-line-strong bg-surface text-ink',
};

/** Nhãn tĩnh: "1 lượt miễn phí", tên loài, tên thế. */
export function Chip({ tone = 'outline', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-caption', tones[tone], className)}>{children}</span>;
}

/** Thuật ngữ hai lớp: tên Việt chính, tên Nhật nhỏ bên cạnh. */
export function StyleName({ vi, jp }: { vi: string; jp?: string | null }) {
  return (
    <>
      {vi}
      {jp ? (
        <>
          {' '}
          <span className="font-body text-label font-normal text-clay" lang="ja-Latn">
            {jp}
          </span>
        </>
      ) : null}
    </>
  );
}

/** Chip lọc bật/tắt (vùng chạm ≥ 44 px). */
export function FilterChip({ selected, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx(
        'inline-flex min-h-touch items-center gap-1 rounded-full px-4 text-caption transition-colors duration-fast ease-calm',
        selected ? 'bg-primary text-primary-on font-semibold' : 'border border-line-strong bg-surface text-ink',
        className,
      )}
      {...rest}
    />
  );
}
