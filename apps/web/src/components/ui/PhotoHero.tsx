import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

/** Khung ảnh thật lớn, chữ trắng trên lớp tối phía dưới (luôn tông sáng để chữ đọc được ở cả giao diện tối). */
export function PhotoHero({ src, title, sub, children, className, ratio = '16 / 9' }: {
  src: string; title: string; sub?: string; children?: ReactNode; className?: string; ratio?: string;
}) {
  return (
    <section className={cx('theme-light relative overflow-hidden rounded-card bg-photo shadow-card', className)} style={{ aspectRatio: ratio }}>
      <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div aria-hidden="true" className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 30%, color-mix(in srgb, var(--ink) 78%, transparent))' }} />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4">
        <h2 className="m-0 text-h1 text-surface">{title}</h2>
        {sub ? <p className="m-0 text-caption text-surface opacity-90">{sub}</p> : null}
        {children}
      </div>
    </section>
  );
}
