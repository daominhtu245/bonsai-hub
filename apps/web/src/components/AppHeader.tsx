import { Link } from 'react-router-dom';
import { Coins, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Wordmark } from './BrandMark';
import { Skeleton } from './ui';

function Credits() {
  const { user } = useAuth();
  if (user.status === 'loading') return <Skeleton className="h-7 w-20" />;
  if (user.status !== 'ready') return null;
  return (
    <Link to="/mua-luot" className="tabular flex min-h-touch items-center gap-1.5 rounded-btn px-2 text-caption font-medium text-ink-muted no-underline hover:text-ink" aria-label={`Còn ${user.data.credits} lượt. Mua thêm`}>
      <Coins size={16} strokeWidth={1.75} aria-hidden="true" />
      {user.data.credits} lượt
    </Link>
  );
}

/** Thanh đầu trang chính: thương hiệu, số lượt, tài khoản. */
export function AppHeader() {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-10 flex min-h-14 flex-wrap items-center gap-x-2 border-b border-line px-gutter py-1 backdrop-blur" style={{ background: 'color-mix(in srgb, var(--bg) 88%, transparent)' }}>
      <Link to="/" className="no-underline" aria-label="Bonsai AI — trang chủ">
        <Wordmark />
      </Link>
      <div className="ml-auto flex items-center gap-1">
        <Credits />
        {user.status === 'ready' ? (
          <Link to="/tai-khoan" aria-label="Tài khoản" className="flex h-touch w-touch items-center justify-center rounded-btn text-ink-muted hover:bg-surface-2 hover:text-ink">
            <UserRound size={20} strokeWidth={1.75} />
          </Link>
        ) : user.status === 'empty' ? (
          <Link to="/dang-nhap" className="flex min-h-touch items-center rounded-btn px-3 text-caption font-semibold text-ink no-underline hover:bg-surface-2 hover:text-ink">
            Đăng nhập
          </Link>
        ) : null}
      </div>
    </header>
  );
}
