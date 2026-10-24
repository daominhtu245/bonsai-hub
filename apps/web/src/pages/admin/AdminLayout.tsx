import { useEffect, useState, type FormEvent } from 'react';
import {
  Activity, BarChart3, Bell, BookOpen, Brush, ClipboardCheck, CreditCard, FileCode2, Gift, LayoutDashboard, ListChecks, Menu,
  MessageSquare, Receipt, Scale, ScrollText, Search, Settings2, SlidersHorizontal, Users, X,
  Swords, Amphora, MessagesSquare,
} from 'lucide-react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BrandMark } from '@/components/BrandMark';
import { adminApi } from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import { cx } from '@/lib/cx';

type NavGroup = { group: string; artisan?: boolean; items: Array<{ to: string; label: string; Icon: typeof Users; end?: boolean }> };

/** Nhóm có `artisan: true` thì nghệ nhân cũng thấy; các nhóm khác chỉ quản trị viên. */
const NAV: NavGroup[] = [
  { group: 'Tổng quan', items: [{ to: '/admin', label: 'Bảng điều khiển', Icon: LayoutDashboard, end: true }] },
  {
    group: 'Nghệ nhân',
    artisan: true,
    items: [
      { to: '/admin/cham-diem', label: 'Chấm điểm', Icon: ClipboardCheck },
      { to: '/admin/bo-luat', label: 'Bộ luật & thông số', Icon: Scale },
      { to: '/admin/thong-ke-cham', label: 'Thống kê chấm', Icon: BarChart3 },
      { to: '/admin/hoi-dap', label: 'Hỏi đáp', Icon: MessagesSquare },
    ],
  },
  {
    group: 'Vận hành',
    items: [
      { to: '/admin/phien', label: 'Phiên thiết kế', Icon: ListChecks },
      { to: '/admin/phan-hoi', label: 'Phản hồi', Icon: MessageSquare },
    ],
  },
  {
    group: 'Khách hàng',
    items: [
      { to: '/admin/nguoi-dung', label: 'Người dùng', Icon: Users },
      { to: '/admin/thanh-toan', label: 'Thanh toán', Icon: CreditCard },
      { to: '/admin/ma-qua-tang', label: 'Mã quà tặng', Icon: Gift },
      { to: '/admin/thong-bao', label: 'Gửi thông báo', Icon: Bell },
      { to: '/admin/thu-thach', label: 'Thử thách phôi', Icon: Swords },
      { to: '/admin/chau-doi-tac', label: 'Chậu đối tác', Icon: Amphora },
    ],
  },
  {
    group: 'AI',
    items: [
      { to: '/admin/che-do-ai', label: 'Chế độ AI', Icon: SlidersHorizontal },
      { to: '/admin/chi-phi', label: 'Chi phí AI', Icon: Receipt },
      { to: '/admin/prompt', label: 'Prompt', Icon: FileCode2 },
      { to: '/admin/gan-nhan', label: 'Gán nhãn', Icon: Brush },
      { to: '/admin/danh-muc', label: 'Danh mục loài & thế', Icon: BookOpen },
    ],
  },
  {
    group: 'Hệ thống',
    items: [
      { to: '/admin/van-hanh', label: 'Cấu hình vận hành', Icon: Settings2 },
      { to: '/admin/he-thong', label: 'Sức khỏe hệ thống', Icon: Activity },
      { to: '/admin/nhat-ky', label: 'Nhật ký quản trị', Icon: ScrollText },
    ],
  },
];

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function QuickSearch({ onDone }: { onDone?: () => void }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    // Mã phiên → mở thẳng; còn lại tìm người dùng (email, tên, SĐT, tên vườn).
    navigate(UUID.test(v) ? `/admin/phien/${v}` : `/admin/nguoi-dung?q=${encodeURIComponent(v)}`);
    setQ('');
    onDone?.();
  };
  return (
    <form onSubmit={submit} role="search" className="relative w-full max-w-[420px] 3xl:max-w-[560px]">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã phiên, email, SĐT…" aria-label="Tìm nhanh"
        className="min-h-[40px] w-full rounded-btn border border-line bg-surface-2 pl-9 pr-3 text-caption text-ink focus:bg-surface" />
    </form>
  );
}

export const ARTISAN_PATHS = NAV.filter((g) => g.artisan).flatMap((g) => g.items.map((i) => i.to));

function SideNav({ onNavigate, artisanOnly }: { onNavigate?: () => void; artisanOnly?: boolean }) {
  return (
    <nav aria-label="Quản trị" className="flex flex-col gap-5 px-3 py-4">
      {NAV.filter((g) => !artisanOnly || g.artisan).map((g) => (
        <div key={g.group}>
          <div className="px-3 pb-1 text-label font-medium uppercase tracking-[0.04em] text-ink-subtle">{g.group}</div>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {g.items.map(({ to, label, Icon, end }) => (
              <li key={to}>
                <NavLink to={to} end={end} onClick={onNavigate}
                  className={({ isActive }) => cx('flex min-h-[40px] items-center gap-2.5 rounded-btn px-3 text-caption no-underline',
                    isActive ? 'bg-surface-2 font-semibold text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink')}>
                  <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Khung quản trị: thanh bên (≥ 1024 px) hoặc ngăn kéo (điện thoại), thanh trên có tìm nhanh. */
export default function AdminLayout() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const [env, setEnv] = useState<string | null>(null);
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (user.status === 'ready' && user.data.role === 'admin') adminApi.settings().then((s) => setEnv(s.app_env)).catch(() => setEnv(null));
  }, [user.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const role = user.status === 'ready' ? user.data.role : null;
  if (role && role !== 'admin' && role !== 'artisan') return <Navigate to="/" replace />;
  const artisanOnly = role === 'artisan';
  if (artisanOnly && !ARTISAN_PATHS.some((p) => location.pathname.startsWith(p))) return <Navigate to="/admin/cham-diem" replace />;

  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[248px_1fr] 3xl:grid-cols-[272px_1fr]">
      <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-r border-line bg-surface lg:block">
        <Link to="/admin" className="flex h-[60px] items-center gap-2 border-b border-line px-5 no-underline">
          <BrandMark size={28} />
          <span className="text-caption font-semibold text-ink">Bonsai AI · {artisanOnly ? 'Nghệ nhân' : 'Quản trị'}</span>
        </Link>
        <SideNav artisanOnly={artisanOnly} />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu quản trị">
          <button type="button" aria-label="Đóng menu" className="absolute inset-0 bg-[var(--ink)] opacity-40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] overflow-y-auto bg-surface shadow-raised">
            <div className="flex h-[60px] items-center justify-between border-b border-line px-4">
              <span className="text-caption font-semibold">Quản trị</span>
              <button type="button" aria-label="Đóng menu" onClick={() => setOpen(false)} className="flex h-touch w-touch items-center justify-center"><X size={20} /></button>
            </div>
            <SideNav onNavigate={() => setOpen(false)} artisanOnly={artisanOnly} />
          </div>
        </div>
      ) : null}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-line bg-surface px-4 lg:px-8">
          <button type="button" aria-label="Mở menu" onClick={() => setOpen(true)} className="flex h-touch w-touch items-center justify-center lg:hidden"><Menu size={20} /></button>
          {artisanOnly ? <span className="text-caption font-semibold">Khu nghệ nhân</span> : <QuickSearch />}
          <div className="ml-auto flex items-center gap-3 text-label">
            {env ? (
              <span className={cx('hidden rounded-chip px-2 py-0.5 font-medium uppercase sm:inline', env === 'prod' ? 'bg-primary-soft text-primary-ink' : 'bg-warn-soft text-warn-ink')}>{env}</span>
            ) : null}
            <Link to="/" className="hidden text-ink-muted sm:inline">Về ứng dụng</Link>
            {user.status === 'ready' ? <span className="hidden max-w-[200px] truncate text-ink-muted md:inline">{user.data.email}</span> : null}
          </div>
        </header>
        <main className="w-full max-w-[2200px] px-4 py-6 lg:px-8 3xl:px-10 3xl:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
