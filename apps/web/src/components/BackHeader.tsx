import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

/** Thanh đầu trang con: quay lại, tiêu đề, phần phụ bên phải (vd. "Bước 2/3" hoặc nút). */
export function BackHeader({ to, title, right }: { to: string; title: ReactNode; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex min-h-14 items-center gap-1 border-b border-line px-2 py-1" style={{ background: 'color-mix(in srgb, var(--bg) 88%, transparent)', backdropFilter: 'blur(8px)' }}>
      <Link to={to} aria-label="Quay lại" className="flex h-touch w-touch flex-none items-center justify-center rounded-btn text-ink hover:bg-surface-2 hover:text-ink">
        <ChevronLeft size={22} strokeWidth={1.75} />
      </Link>
      <h1 className="min-w-0 flex-1 text-[15px] font-semibold [overflow-wrap:anywhere]">{title}</h1>
      {right ? <div className="flex flex-none items-center pr-2 text-caption text-ink-muted">{right}</div> : null}
    </header>
  );
}
