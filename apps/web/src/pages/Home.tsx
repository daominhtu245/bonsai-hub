import { useEffect, useState } from 'react';
import { ArrowRight, Camera, CalendarCheck, ChevronRight, PenTool, ScanSearch } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { HeroShot } from '@/components/HeroShot';
import { ButtonLink, Chip, Skeleton } from '@/components/ui';
import { accountApi, type GardenTree } from '@/lib/account';
import { useAuth } from '@/lib/auth';

const features = [
  { Icon: ScanSearch, title: 'Phân tích phôi', body: 'Loài, thân, cành, rễ từ 1–4 ảnh.' },
  { Icon: PenTool, title: 'Bản vẽ thiết kế', body: '2–3 phương án thế, cành cắt và giữ.' },
  { Icon: CalendarCheck, title: 'Lộ trình chăm', body: 'Ảnh từng giai đoạn và việc cần làm.' },
];

const STYLES = ['Trực', 'Trực uốn', 'Xiêu', 'Huyền', 'Bán huyền', 'Văn nhân', 'Phong xuy', 'Trực quân tử', 'Thế long'];

function Landing() {
  return (
    <main className="flex flex-col gap-10 px-gutter pb-12 pt-6">
      <section className="flex flex-col gap-4">
        <h1 className="text-display">Thiết kế dáng bonsai từ ảnh phôi</h1>
        <p className="m-0 text-ink-muted">Bản vẽ theo luật tạo dáng, ảnh minh họa từng giai đoạn và lộ trình chăm cho chính cây của bạn.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ButtonLink to="/chup">
            <Camera size={18} strokeWidth={2} aria-hidden="true" />
            Bắt đầu với ảnh phôi
          </ButtonLink>
        </div>
        <p className="m-0 text-label text-ink-subtle">Phân tích và bản vẽ miễn phí.</p>
      </section>

      <HeroShot />

      <section className="grid gap-px overflow-hidden rounded-card border border-line bg-line shadow-card sm:grid-cols-3">
        {features.map(({ Icon, title, body }, i) => (
          <div key={title} className="flex items-start gap-3 bg-surface p-4">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-btn bg-surface-2 text-ink">
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div>
              <div className="tabular text-label font-medium text-ink-subtle">0{i + 1}</div>
              <div className="font-semibold">{title}</div>
              <div className="text-caption text-ink-muted">{body}</div>
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">Thế cây hỗ trợ</h2>
        <div className="flex flex-wrap gap-1.5">
          {STYLES.map((s) => <Chip key={s} tone="outline">{s}</Chip>)}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <img src="/images/juniper.webp" alt="Bonsai tùng thế xiêu" loading="lazy" className="aspect-[3/4] w-full rounded-card border border-line object-cover" />
        <img src="/images/pedestal.webp" alt="Bonsai văn nhân trên kệ đá" loading="lazy" className="aspect-[3/4] w-full rounded-card border border-line object-cover" />
      </section>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-4 text-label text-ink-subtle">
        <span>© 2026 Bonsai AI</span>
        <Link to="/dieu-khoan" className="text-ink-subtle hover:text-ink">Điều khoản và quyền riêng tư</Link>
      </footer>
    </main>
  );
}

function Dashboard({ name, credits }: { name: string | null; credits: number }) {
  const [trees, setTrees] = useState<GardenTree[] | null>(null);
  useEffect(() => {
    accountApi.garden().then((g) => setTrees(g.trees.slice(0, 4))).catch(() => setTrees([]));
  }, []);
  return (
    <main className="flex flex-col gap-6 px-gutter pb-8 pt-6">
      <section className="flex flex-col gap-1">
        <h1 className="text-h1">{name ? `Chào ${name.split(' ').slice(-1)[0]}` : 'Bảng điều khiển'}</h1>
        <p className="m-0 tabular text-caption text-ink-muted">Còn {credits} lượt tạo ảnh</p>
      </section>

      <Link to="/chup" className="group flex items-center gap-4 rounded-card border border-line bg-surface p-4 text-ink no-underline shadow-card hover:border-line-strong hover:text-ink">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-btn bg-primary text-primary-on">
          <Camera size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold">Phân tích phôi mới</span>
          <span className="block text-caption text-ink-muted">Chụp hoặc chọn 1–4 ảnh</span>
        </span>
        <ArrowRight size={18} className="text-ink-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="eyebrow">Cây gần đây</h2>
          <Link to="/vuon" className="text-caption font-medium no-underline">Xem tất cả</Link>
        </div>
        {trees === null ? (
          <Skeleton className="h-36 rounded-card" />
        ) : trees.length === 0 ? (
          <p className="m-0 rounded-card border border-dashed border-line-strong p-4 text-caption text-ink-muted">Chưa có cây nào.</p>
        ) : (
          <ul className="m-0 list-none divide-y divide-line overflow-hidden rounded-card border border-line bg-surface p-0 shadow-card">
            {trees.map((t) => (
              <li key={t.tree_id}>
                <Link to={t.job_status === 'done' ? `/ket-qua/${t.job_id}` : t.job_status === 'awaiting_choice' ? `/chon/${t.job_id}` : '/vuon'} className="flex items-center gap-3 px-3 py-2.5 text-ink no-underline hover:bg-surface-2 hover:text-ink">
                  <span className="h-11 w-11 flex-none overflow-hidden rounded-[6px] bg-photo">{t.thumbnail_url ? <img src={t.thumbnail_url} alt="" className="h-full w-full object-cover" /> : null}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{t.nickname || 'Cây chưa đặt tên'}</span>
                    <span className="block truncate text-label text-ink-muted">{[t.style_vi, t.stage_code && `${t.stage_code} ${t.stage_name_vi}`].filter(Boolean).join(' · ') || 'Chưa chọn thế'}</span>
                  </span>
                  <ChevronRight size={16} className="text-ink-subtle" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/** Màn 01 — Trang chủ: khách thấy giới thiệu ngắn; người đã đăng nhập thấy bảng điều khiển. */
export default function Home() {
  const { user } = useAuth();
  const me = user.status === 'ready' ? user.data : null;
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <AppHeader />
      {me ? <Dashboard name={me.name} credits={me.credits} /> : <Landing />}
      {me ? <BottomNav /> : null}
    </div>
  );
}
