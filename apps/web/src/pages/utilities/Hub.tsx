import { ChevronRight, type LucideIcon } from 'lucide-react';
import { CalendarHeart, HeartPulse, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { BottomNav } from '@/components/BottomNav';

export type HubItem = { to: string; title: string; sub: string; Icon: LucideIcon };

/** Nhóm tiện ích — mỗi đợt tính năng thêm mục vào đây (docs/ideas.md). */
export const HUB: Array<{ group: string; items: HubItem[] }> = [
  {
    group: 'Chăm cây',
    items: [
      { to: '/tien-ich/mai-tet', title: 'Mai kịp Tết', sub: 'Ngày tuốt lá theo tỉnh', Icon: CalendarHeart },
      { to: '/tien-ich/cap-cuu', title: 'Cấp cứu cây', sub: 'Cây héo, vàng lá, thối rễ', Icon: HeartPulse },
    ],
  },
  {
    group: 'Chọn cây',
    items: [{ to: '/tien-ich/hop-menh', title: 'Cây hợp mệnh', sub: 'Theo năm sinh', Icon: Sparkles }],
  },
];

export default function UtilitiesHub() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/" title="Tiện ích" />
      <div className="flex flex-col gap-5 px-gutter py-4">
        {HUB.map((g) => (
          <section key={g.group}>
            <h2 className="eyebrow mb-2 px-1">{g.group}</h2>
            <ul className="m-0 list-none divide-y divide-line overflow-hidden rounded-card border border-line bg-surface p-0 shadow-card">
              {g.items.map(({ to, title, sub, Icon }) => (
                <li key={to}>
                  <Link to={to} className="flex min-h-[64px] items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-surface-2">
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-btn bg-surface-2"><Icon size={20} strokeWidth={1.75} aria-hidden="true" /></span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body font-medium">{title}</span>
                      <span className="text-caption text-ink-muted">{sub}</span>
                    </span>
                    <ChevronRight size={18} className="text-ink-subtle" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}
