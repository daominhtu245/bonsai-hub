import { Home, Sprout, UserRound } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cx } from '@/lib/cx';

const items = [
  { to: '/', label: 'Trang chủ', Icon: Home },
  { to: '/vuon', label: 'Vườn', Icon: Sprout },
  { to: '/tai-khoan', label: 'Tài khoản', Icon: UserRound },
];

/** Thanh điều hướng dưới cho các màn chính. */
export function BottomNav() {
  return (
    <nav aria-label="Điều hướng chính" className="sticky bottom-0 z-10 mt-auto grid grid-cols-3 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      {items.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) => cx('flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-label font-medium no-underline', isActive ? 'text-primary' : 'text-ink-subtle hover:text-ink')}
        >
          <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
