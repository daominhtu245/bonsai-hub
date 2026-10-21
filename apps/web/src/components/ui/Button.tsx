import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cx } from '@/lib/cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const base =
  'inline-flex items-center justify-center gap-2 rounded-btn font-body font-semibold text-body transition-colors duration-fast ease-calm disabled:cursor-not-allowed';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-on hover:bg-primary-ink disabled:bg-line disabled:text-ink-muted',
  secondary: 'border border-primary bg-surface text-primary-ink hover:bg-primary-soft disabled:border-line disabled:text-ink-muted',
  ghost: 'text-primary-ink hover:bg-primary-soft disabled:text-ink-muted',
  danger: 'text-danger hover:bg-danger-soft disabled:text-ink-muted',
};

function classes(variant: Variant, block: boolean, size: 'cta' | 'touch') {
  return cx(base, variants[variant], size === 'cta' ? 'min-h-cta px-5' : 'min-h-touch px-4', block && 'w-full');
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  size?: 'cta' | 'touch';
  loading?: boolean;
  loadingLabel?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', block = true, size = 'cta', loading = false, loadingLabel = 'Đang xử lý…', className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(classes(variant, block, size), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? loadingLabel : children}
    </button>
  );
});

export interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  block?: boolean;
  size?: 'cta' | 'touch';
}

export function ButtonLink({ variant = 'primary', block = true, size = 'cta', className, ...rest }: ButtonLinkProps) {
  // Ghi đè màu link toàn cục (a:hover) để chữ nút luôn đủ tương phản.
  const hoverText = { primary: 'hover:text-primary-on', secondary: 'hover:text-primary-ink', ghost: 'hover:text-primary-ink', danger: 'hover:text-danger' }[variant];
  return <Link className={cx(classes(variant, block, size), 'no-underline', hoverText, className)} {...rest} />;
}
