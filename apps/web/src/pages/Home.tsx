import { useEffect, useState } from 'react';
import { ArrowRight, CalendarCheck, CalendarHeart, Camera, MapPin, PenTool, Plus, ScanSearch } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AnnouncementBar } from '@/components/AnnouncementBar';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { HeroShot } from '@/components/HeroShot';
import { StageBar, TreeImage, TreePhotoCard } from '@/components/TreePhotoCard';
import { ButtonLink, Chip, PhotoHero, Skeleton, Tile } from '@/components/ui';
import { accountApi, type GardenTree } from '@/lib/account';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/features';
import { destination, focusTree, photoOverdue, treeName } from '@/lib/garden';
import { daysUntil, useToday } from '@/lib/today';
import { HUB } from './utilities/Hub';

const features = [
  { Icon: ScanSearch, title: 'Phân tích phôi', body: 'Loài, thân, cành, rễ từ 1–4 ảnh.' },
  { Icon: PenTool, title: 'Bản vẽ thiết kế', body: '2–3 phương án thế, cành cắt và giữ.' },
  { Icon: CalendarCheck, title: 'Lộ trình chăm', body: 'Ảnh từng giai đoạn và việc cần làm.' },
];

const STYLES = ['Trực', 'Trực uốn', 'Xiêu', 'Huyền', 'Bán huyền', 'Văn nhân', 'Phong xuy', 'Trực quân tử', 'Thế long'];

function Landing() {
  return (
    <main className="flex flex-col gap-10 px-gutter pb-12 pt-6">
      <AnnouncementBar className="-mb-6" />
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

const GREET = (h: number) => (h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối');
const WEEKDAY = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
/** Lối tắt hay dùng nhất (theo thứ tự ưu tiên); chỉ hiện mục đang mở, tối đa 4. */
const EXPLORE = ['/tien-ich/hoi-dap', '/tien-ich/benh-la', '/cho', '/thu-thach', '/nghe-nhan', '/tien-ich/mai-tet'];

/** Hai chip nhỏ dưới lời chào: thời tiết nơi ở, đếm ngược Tết. */
function TodayChips() {
  const on = useFeatures();
  const { province, today, alert, WIcon, tet } = useToday();
  const askProvince = !today && on('weather') && !province;
  if (!today && !askProvince && !tet) return null;
  const chip = 'inline-flex min-h-touch items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-caption font-medium text-ink no-underline shadow-card hover:bg-surface-2 hover:text-ink';
  return (
    <div className="flex flex-wrap gap-2">
      {today ? (
        <Link to="/tien-ich/thoi-tiet" className={chip}>
          <WIcon size={18} strokeWidth={1.75} className={alert ? 'text-warn' : 'text-primary'} aria-hidden="true" />
          <span className="tabular">{Math.round(today.min_c)}–{Math.round(today.max_c)}°</span>
          {alert ? <span className="text-warn-ink">{alert.title_vi}</span> : null}
        </Link>
      ) : askProvince ? (
        <Link to="/tai-khoan" className={chip}><MapPin size={16} className="text-primary" aria-hidden="true" />Chọn tỉnh để xem thời tiết</Link>
      ) : null}
      {tet ? (
        <Link to="/tien-ich/mai-tet" className={chip}>
          <CalendarHeart size={18} strokeWidth={1.75} className="text-clay" aria-hidden="true" />
          <span><span className="tabular font-semibold">{daysUntil(tet.tet)}</span> ngày tới Tết</span>
        </Link>
      ) : null}
    </div>
  );
}

/** Cây nên chăm hôm nay: ảnh tương lai + phôi, việc tiếp theo, tiến độ giai đoạn. */
function FocusCard({ t }: { t: GardenTree }) {
  const d = destination(t);
  const overdue = photoOverdue(t);
  return (
    <Link to={d.to} aria-label={`${t.next_task_vi ? 'Việc hôm nay' : 'Làm tiếp'}: ${treeName(t)}`}
      className="group flex overflow-hidden rounded-card border border-line bg-surface text-ink no-underline shadow-card hover:border-line-strong hover:text-ink">
      <TreeImage t={t} className="w-[42%] flex-none self-stretch" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5">
        <span className="eyebrow text-primary">{t.next_task_vi ? 'Việc hôm nay' : 'Làm tiếp'}</span>
        <span className="truncate text-caption text-ink-muted">{treeName(t)}{t.style_vi ? ` · ${t.style_vi}` : ''}</span>
        <span className="line-clamp-3 text-body font-semibold leading-snug [overflow-wrap:anywhere]">{t.next_task_vi ?? d.cta ?? d.status}</span>
        {t.job_status === 'done' ? <StageBar done={t.stages_done} className="mt-1" /> : null}
        {overdue !== null ? <span className="inline-flex items-center gap-1 text-label font-medium text-warn-ink"><Camera size={13} aria-hidden="true" />{overdue} ngày chưa chụp ảnh</span> : null}
        <span className="mt-auto inline-flex items-center gap-1 pt-1 text-caption font-semibold text-primary">
          {t.job_status === 'done' ? 'Mở lộ trình' : 'Tiếp tục'}
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}

function Dashboard({ name }: { name: string | null }) {
  const on = useFeatures();
  const [trees, setTrees] = useState<GardenTree[] | null>(null);
  useEffect(() => {
    accountApi.garden().then((g) => setTrees(g.trees)).catch(() => setTrees([]));
  }, []);
  const now = new Date();
  const focus = trees ? focusTree(trees) : null;
  const explore = HUB.flatMap((g) => g.items.map((i) => ({ ...i, tone: g.tone })))
    .filter((i) => EXPLORE.includes(i.to) && (Array.isArray(i.feature) ? i.feature.some(on) : on(i.feature)))
    .sort((a, b) => EXPLORE.indexOf(a.to) - EXPLORE.indexOf(b.to))
    .slice(0, 4);
  return (
    <main className="flex flex-col gap-6 px-gutter pb-8 pt-5">
      <section className="flex flex-col gap-3">
        <div>
          <span className="text-label text-ink-muted">{WEEKDAY[now.getDay()]}, {now.getDate()}/{now.getMonth() + 1}</span>
          <h1 className="text-h1">{GREET(now.getHours())}{name ? `, ${name.split(' ').slice(-1)[0]}` : ''}</h1>
        </div>
        <TodayChips />
      </section>
      <AnnouncementBar />

      {trees === null ? <Skeleton className="h-48 rounded-card" /> : trees.length === 0 ? (
        <PhotoHero src="/images/hero.webp" title="Phôi của bạn sẽ thành cây gì?" sub="Chụp 1–4 ảnh · bản vẽ miễn phí" ratio="4 / 5">
          <ButtonLink to="/chup" size="touch" block={false} className="self-start">
            <Camera size={18} strokeWidth={2} aria-hidden="true" />
            Chụp phôi đầu tiên
          </ButtonLink>
        </PhotoHero>
      ) : (
        <>
          {focus ? <FocusCard t={focus} /> : null}
          <Link to="/chup" className="group flex items-center gap-4 rounded-card bg-primary p-4 text-primary-on no-underline shadow-card hover:text-primary-on">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-surface text-primary">
              <Camera size={20} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">Phân tích phôi mới</span>
              <span className="block text-caption opacity-85">Chụp hoặc chọn 1–4 ảnh</span>
            </span>
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="eyebrow">Vườn của bạn · {trees.length}</h2>
              <Link to="/vuon" className="flex min-h-touch items-center text-caption font-medium no-underline">Xem tất cả</Link>
            </div>
            <ul className="-mx-gutter m-0 flex list-none gap-3 overflow-x-auto px-gutter pb-1">
              {trees.slice(0, 8).map((t) => <li key={t.tree_id} className="w-[140px] flex-none"><TreePhotoCard t={t} compact /></li>)}
              <li className="w-[110px] flex-none">
                <Link to="/chup" className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong text-caption font-medium text-ink-muted no-underline hover:bg-surface-2 hover:text-ink">
                  <Plus size={22} aria-hidden="true" />Thêm cây
                </Link>
              </li>
            </ul>
          </section>
        </>
      )}

      {explore.length ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="eyebrow">Khám phá</h2>
            <Link to="/tien-ich" className="flex min-h-touch items-center text-caption font-medium no-underline">Tất cả tiện ích</Link>
          </div>
          <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
            {explore.map(({ to, title, sub, Icon, tone }) => <li key={to}><Tile to={to} title={title} sub={sub} Icon={Icon} tone={tone} /></li>)}
          </ul>
        </section>
      ) : null}
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
      {me ? <Dashboard name={me.name} /> : <Landing />}
      {me ? <BottomNav /> : null}
    </div>
  );
}
