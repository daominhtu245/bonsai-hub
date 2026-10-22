import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { Link, type LinkProps } from 'react-router-dom';
import { cx } from '@/lib/cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'cta' | 'touch';

const base =
  'inline-flex items-center justify-center gap-2 rounded-btn font-sans text-[15px] font-semibold tracking-[-0.005em] no-underline transition-colors duration-fast ease-calm disabled:cursor-not-allowed';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-on shadow-card hover:bg-primary-ink hover:text-primary-on disabled:bg-surface-2 disabled:text-ink-subtle disabled:shadow-none',
  secondary: 'border border-line-strong bg-surface text-ink shadow-card hover:bg-surface-2 hover:text-ink disabled:text-ink-subtle',
  ghost: 'text-ink-muted hover:bg-surface-2 hover:text-ink disabled:text-ink-subtle',
  danger: 'text-danger hover:bg-danger-soft hover:text-danger disabled:text-ink-subtle',
};

function classes(variant: Variant, block: boolean, size: Size) {
  return cx(base, variants[variant], size === 'cta' ? 'min-h-cta px-5' : 'min-h-touch px-4', block && 'w-full');
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  size?: Size;
  loading?: boolean;
  loadingLabel?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', block = true, size = 'cta', loading = false, loadingLabel = 'Đang xử lý…', className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cx(classes(variant, block, size), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? (
        <>
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          {loadingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
});

export interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  block?: boolean;
  size?: Size;
}

export function ButtonLink({ variant = 'primary', block = true, size = 'cta', className, ...rest }: ButtonLinkProps) {
  return <Link className={cx(classes(variant, block, size), className)} {...rest} />;
}
