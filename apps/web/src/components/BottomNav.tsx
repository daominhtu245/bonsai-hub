import { NavLink } from 'react-router-dom';
import { cx } from '@/lib/cx';

const items = [
  { to: '/', label: 'Trang chủ', icon: <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" /> },
  { to: '/vuon', label: 'Vườn', icon: <><path d="M6 20h12l-1.5-6h-9L6 20Z" /><path d="M12 14V9" /><path d="M12 9c-3 0-5-2-5-5 3 0 5 2 5 5Zm0 0c3 0 5-2 5-5-3 0-5 2-5 5Z" /></> },
  { to: '/tai-khoan', label: 'Tài khoản', icon: <><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" /></> },
];

/** Thanh điều hướng dưới (màn 08, tài khoản). */
export function BottomNav() {
  return (
    <nav aria-label="Điều hướng chính" className="sticky bottom-0 mt-auto grid grid-cols-3 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end
          className={({ isActive }) =>
            cx('flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-label no-underline', isActive ? 'font-semibold text-primary-ink' : 'text-ink-muted hover:text-ink')
          }
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {it.icon}
          </svg>
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
}
