import { Check } from 'lucide-react';
import { cx } from '@/lib/cx';

/** Hàng chip chọn một (cuộn ngang trên điện thoại) — thay ô chọn thả xuống cho lựa chọn ít. */
export function ChoiceChips<T extends string>({ label, value, options, onChange, scroll = true }: {
  label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void; scroll?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('flex gap-2', scroll ? '-mx-gutter overflow-x-auto px-gutter pb-1' : 'flex-wrap')}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cx('inline-flex min-h-touch flex-none items-center gap-1 rounded-full border px-4 text-caption font-medium transition-colors duration-fast',
            value === v ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-muted hover:text-ink')}>
          {value === v ? <Check size={14} aria-hidden="true" /> : null}
          {text}
        </button>
      ))}
    </div>
  );
}
