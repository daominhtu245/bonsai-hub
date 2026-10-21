import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Chip, Skeleton } from './ui';
import { SealLogo } from './illustrations/Bonsai';

function Credits() {
  const { user } = useAuth();
  switch (user.status) {
    case 'loading':
      return <Skeleton className="h-8 w-28 rounded-full" />;
    case 'ready':
      return <Chip tone="soft">{user.data.credits > 0 ? `${user.data.credits} lượt` : 'Hết lượt'}</Chip>;
    case 'error':
      return null;
    case 'empty':
      return <Chip tone="soft">1 lượt miễn phí</Chip>;
  }
}

export function AppHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 px-gutter pb-2 pt-4">
      <Link to="/" className="flex items-center gap-2.5 text-ink no-underline hover:text-ink">
        <SealLogo />
        <span className="font-display text-h2 font-semibold">Bonsai AI</span>
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <Credits />
        <Link
          to="/vuon"
          aria-label="Vườn của tôi"
          className="flex h-touch w-touch items-center justify-center rounded-btn border border-line bg-surface text-ink"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 20h12l-1.5-6h-9L6 20Z" />
            <path d="M12 14V9" />
            <path d="M12 9c-3 0-5-2-5-5 3 0 5 2 5 5Zm0 0c3 0 5-2 5-5-3 0-5 2-5 5Z" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
