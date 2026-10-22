import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Tone = 'neutral' | 'success' | 'warn' | 'outline';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-muted',
  success: 'bg-primary-soft text-primary-ink',
  warn: 'bg-warn-soft text-warn-ink',
  outline: 'border border-line text-ink-muted',
};

/** Nhãn nhỏ dạng thẻ (số lượt, loài, trạng thái). */
export function Chip({ tone = 'neutral', children, className }: { tone?: Tone | 'soft' | 'species'; children: ReactNode; className?: string }) {
  const t: Tone = tone === 'soft' ? 'success' : tone === 'species' ? 'neutral' : tone;
  return <span className={cx('inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-label font-medium', tones[t], className)}>{children}</span>;
}

/** Tên thế: tên Việt, tên Nhật nhỏ nhạt bên cạnh. */
export function StyleName({ vi, jp }: { vi: string; jp?: string | null }) {
  return (
    <>
      {vi}
      {jp ? (
        <>
          {' '}
          <span className="font-normal text-ink-subtle" lang="ja-Latn">
            {jp}
          </span>
        </>
      ) : null}
    </>
  );
}

/** Nút lọc / chọn một trong nhiều (vùng chạm ≥ 44 px). */
export function FilterChip({ selected, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx(
        'inline-flex min-h-touch items-center gap-1.5 rounded-btn border px-3.5 text-caption font-medium transition-colors duration-fast',
        selected ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-muted hover:text-ink',
        className,
      )}
      {...rest}
    />
  );
}

/** Nhóm nút chọn liền khối (segmented control). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-btn bg-surface-2 p-1">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cx(
            'min-h-[40px] flex-1 rounded-[6px] px-2 text-caption font-medium transition-colors duration-fast',
            value === v ? 'bg-surface text-ink shadow-card' : 'text-ink-muted hover:text-ink',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
