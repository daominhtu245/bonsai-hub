import { useEffect, useState } from 'react';
import {
  CalendarHeart, ChevronRight, CloudSun, GraduationCap, HandHeart, HeartPulse, Leaf, LineChart, MessageCircleQuestion,
  Sparkles, Store, Swords, ThumbsUp, type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { BottomNav } from '@/components/BottomNav';
import { Tile, type Tone } from '@/components/ui';
import { accountApi, type GardenTree } from '@/lib/account';
import { useAuth } from '@/lib/auth';
import { useFeatures, type FeatureKey } from '@/lib/features';
import { daysUntil, useToday } from '@/lib/today';

export type HubItem = { to: string; title: string; sub: string; Icon: LucideIcon; feature: FeatureKey | FeatureKey[] };

/** Nhóm tiện ích — mỗi đợt tính năng thêm mục vào đây (docs/ideas.md). Mục đang tắt ở quản trị thì ẩn. */
export const HUB: Array<{ group: string; tone: Tone; items: HubItem[] }> = [
  {
    group: 'Chăm cây',
    tone: 'leaf',
    items: [
      { to: '/tien-ich/hoi-dap', title: 'Hỏi cách chăm', sub: 'Nói là có câu trả lời', Icon: MessageCircleQuestion, feature: 'assistant' },
      { to: '/tien-ich/benh-la', title: 'Lá có bệnh?', sub: 'Chụp lá, xem cách chữa', Icon: Leaf, feature: 'health_check' },
      { to: '/tien-ich/thoi-tiet', title: 'Thời tiết', sub: 'Việc cần làm 3 ngày tới', Icon: CloudSun, feature: 'weather' },
      { to: '/tien-ich/mai-tet', title: 'Mai kịp Tết', sub: 'Ngày tuốt lá theo tỉnh', Icon: CalendarHeart, feature: 'mai_tet' },
      { to: '/tien-ich/cap-cuu', title: 'Cấp cứu cây', sub: 'Héo, vàng lá, thối rễ', Icon: HeartPulse, feature: 'rescue' },
      { to: '/tien-ich/hop-menh', title: 'Cây hợp mệnh', sub: 'Theo năm sinh', Icon: Sparkles, feature: 'menh' },
    ],
  },
  {
    group: 'Nghệ nhân & nhà vườn',
    tone: 'ink',
    items: [
      { to: '/nghe-nhan', title: 'Hỏi nghệ nhân', sub: 'Góp ý thiết kế', Icon: GraduationCap, feature: ['consults', 'public_profiles'] },
      { to: '/cham-ho', title: 'Chăm hộ, nuôi hộ', sub: 'Gửi cây cho vườn', Icon: HandHeart, feature: 'care' },
    ],
  },
  {
    group: 'Mua bán',
    tone: 'clay',
    items: [
      { to: '/cho', title: 'Chợ phôi', sub: 'Kèm dáng tương lai', Icon: Store, feature: 'market' },
      { to: '/tien-ich/gia', title: 'Giá thị trường', sub: 'Giá mỗi cm gốc', Icon: LineChart, feature: 'price_index' },
    ],
  },
  {
    group: 'Cộng đồng',
    tone: 'brass',
    items: [
      { to: '/thu-thach', title: 'Thử thách phôi', sub: 'Ai thiết kế đẹp nhất', Icon: Swords, feature: 'challenges' },
      { to: '/chon-dang', title: 'Chọn dáng đẹp', sub: 'Chạm dáng bạn thích', Icon: ThumbsUp, feature: 'design_votes' },
    ],
  },
];

/** "Hôm nay": thời tiết nơi ở + cảnh báo, đếm ngược Tết, việc tiếp theo của cây — lý do để mở app mỗi ngày. */
function Today() {
  const { user } = useAuth();
  const me = user.status === 'ready' ? user.data : null;
  const { weather: w, today, alert, WIcon, tet } = useToday();
  const [task, setTask] = useState<GardenTree | null>(null);
  useEffect(() => {
    if (me) accountApi.garden().then((g) => setTask(g.trees.find((t) => t.next_task_vi) ?? null)).catch(() => null);
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!today && !tet && !task) return null;
  return (
    <section aria-label="Hôm nay" className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="grid grid-cols-2 divide-x divide-line">
        {today ? (
          <Link to="/tien-ich/thoi-tiet" className="flex items-center gap-3 p-3 text-ink no-underline">
            <WIcon size={30} strokeWidth={1.5} className={alert ? 'text-warn' : 'text-primary'} aria-hidden="true" />
            <span className="flex flex-col">
              <span className="tabular text-h2">{Math.round(today.min_c)}–{Math.round(today.max_c)}°</span>
              <span className="text-label text-ink-muted">{alert ? alert.title_vi : w?.province_vi}</span>
            </span>
          </Link>
        ) : (
          <Link to="/tai-khoan" className="flex items-center gap-3 p-3 text-caption text-ink-muted no-underline"><CloudSun size={26} aria-hidden="true" />Chọn tỉnh để xem thời tiết</Link>
        )}
        {tet ? (
          <Link to="/tien-ich/mai-tet" className="flex items-center gap-3 p-3 text-ink no-underline">
            <span className="tabular text-display text-clay">{daysUntil(tet.tet)}</span>
            <span className="flex flex-col text-label text-ink-muted"><span className="font-semibold text-ink">ngày tới Tết</span>tuốt lá còn {daysUntil(tet.from)} ngày</span>
          </Link>
        ) : <span />}
      </div>
      {task ? (
        <Link to={task.job_id ? `/ket-qua/${task.job_id}` : '/vuon'} className="flex min-h-touch items-center gap-3 border-t border-line px-3 py-2.5 text-ink no-underline hover:bg-surface-2">
          {task.thumbnail_url ? <img src={task.thumbnail_url} alt="" className="h-10 w-10 flex-none rounded-img object-cover" /> : null}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-label text-ink-muted">Việc tiếp theo · {task.nickname || 'Cây của bạn'}</span>
            <span className="truncate text-caption font-medium">{task.next_task_vi}</span>
          </span>
          <ChevronRight size={18} className="text-ink-subtle" aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  );
}

export default function UtilitiesHub() {
  const on = useFeatures();
  const groups = HUB.map((g) => ({ ...g, items: g.items.filter((i) => (Array.isArray(i.feature) ? i.feature.some(on) : on(i.feature))) }))
    .filter((g) => g.items.length);
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/" title="Tiện ích" />
      <div className="flex flex-col gap-5 px-gutter pb-24 pt-3">
        <Today />
        {groups.map((g) => (
          <section key={g.group}>
            <h2 className="eyebrow mb-2 px-1">{g.group}</h2>
            <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
              {g.items.map(({ to, title, sub, Icon }) => <li key={to}><Tile to={to} title={title} sub={sub} Icon={Icon} tone={g.tone} /></li>)}
            </ul>
          </section>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}
