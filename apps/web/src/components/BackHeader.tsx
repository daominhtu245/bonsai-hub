import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Thanh đầu trang có nút quay lại, tiêu đề và phần phụ bên phải (vd. "Bước 2/3"). */
export function BackHeader({ to, title, right }: { to: string; title: string; right?: ReactNode }) {
  return (
    <header className="flex items-center gap-2 px-gutter py-3">
      <Link to={to} aria-label="Quay lại" className="flex h-touch w-touch items-center justify-center rounded-btn text-ink hover:text-ink">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </Link>
      <h1 className="font-body text-body font-semibold">{title}</h1>
      {right ? <span className="ml-auto text-caption text-ink-muted">{right}</span> : null}
    </header>
  );
}
