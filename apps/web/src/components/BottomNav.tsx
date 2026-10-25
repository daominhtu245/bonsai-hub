import { Home, LayoutGrid, Sprout, UserRound } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cx } from '@/lib/cx';

/** Mỗi tab sở hữu các trang con (để tab vẫn sáng khi đi sâu vào trong). */
const items = [
  { to: '/', label: 'Trang chủ', Icon: Home, owns: (p: string) => p === '/' },
  { to: '/vuon', label: 'Vườn', Icon: Sprout, owns: (p: string) => /^\/(vuon|ket-qua|chia-se|so-cay|cham-ho)(\/|$)/.test(p) },
  { to: '/tien-ich', label: 'Tiện ích', Icon: LayoutGrid, owns: (p: string) => /^\/(tien-ich|cho|tin|tin-cua-toi|nghe-nhan|nguoi|hoi-nghe-nhan|thu-thach|chon-dang)(\/|$)/.test(p) },
  { to: '/tai-khoan', label: 'Tài khoản', Icon: UserRound, owns: (p: string) => /^\/(tai-khoan|mua-luot|dieu-khoan)(\/|$)/.test(p) },
];

/** Thanh điều hướng dưới — gắn một lần ở AppShell, cố định đáy màn hình như app thật. */
export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Điều hướng chính" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-content grid-cols-4">
        {items.map(({ to, label, Icon, owns }) => {
          const active = owns(pathname);
          return (
            <Link key={to} to={to} aria-current={active ? 'page' : undefined}
              className={cx('flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-label font-medium no-underline transition-colors duration-fast',
                active ? 'text-primary' : 'text-ink-subtle hover:text-ink')}>
              <span className={cx('flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-fast', active && 'bg-primary-soft')}>
                <Icon size={20} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
