import React, { useEffect, useState, type FormEvent } from 'react';
import {
  Bell, ChevronDown, ChevronRight, Coins, FileText, Gift, History, Image as ImageIcon, LogOut, MessageCircle, Palette, Phone, Receipt, Shield,
  Store, UserRound, type LucideIcon,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { GiftCodeBox } from '@/components/GiftCodeBox';
import { ProfileExtras } from '@/components/ProfileExtras';
import { PublicProfile } from '@/components/PublicProfile';
import { ReferralCard } from '@/components/ReferralCard';
import { SkillCard } from '@/components/SkillCard';
import { Avatar } from '@/components/Avatar';
import { Button, ButtonLink, Chip, IconBadge, Notice, Segmented, Skeleton, type Tone } from '@/components/ui';
import { accountApi, vnd, type Payment } from '@/lib/account';
import { ApiError, type User } from '@/lib/api';
import { communityApi, type Skill } from '@/lib/community';
import { cachedGarden, loadGarden } from '@/lib/garden';
import { useAuth } from '@/lib/auth';
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push';
import { getTheme, setTheme, type ThemePref } from '@/lib/theme';
import { useFeatures } from '@/lib/features';

const PUSH_TEXT: Record<PushState, string> = {
  on: 'Đang bật trên thiết bị này',
  off: 'Đang tắt trên thiết bị này',
  denied: 'Trình duyệt đang chặn thông báo — mở cài đặt trang web để cho phép',
  disabled: 'Máy chủ chưa bật thông báo',
  unsupported: 'Trình duyệt này không hỗ trợ',
  'ios-needs-install': 'Trên iPhone: Chia sẻ › Thêm vào Màn hình chính, rồi mở app từ đó',
};

function Toggle({ id, label, hint, checked, disabled, onChange, Icon, tone }: { id: string; label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; Icon: LucideIcon; tone?: Tone }) {
  return (
    <label htmlFor={id} className="flex min-h-[52px] cursor-pointer items-center gap-3 px-4 py-2">
      <IconBadge Icon={Icon} tone={tone} size="sm" />
      <span className="flex-1">
        <span className="block text-caption font-medium">{label}</span>
        {hint ? <span className="block text-label text-ink-subtle">{hint}</span> : null}
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="switch" />
    </label>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="eyebrow px-1">{title}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">{children}</div>
    </section>
  );
}

/** Một dòng cài đặt: biểu tượng màu + nhãn + mũi tên. */
function RowLink({ to, Icon, tone, label, value }: { to: string; Icon: LucideIcon; tone?: Tone; label: string; value?: string }) {
  return (
    <Link to={to} className="flex min-h-[52px] items-center gap-3 px-4 text-caption font-medium text-ink no-underline hover:bg-surface-2 hover:text-ink">
      <IconBadge Icon={Icon} tone={tone} size="sm" />
      <span className="flex-1">{label}</span>
      {value ? <span className="text-ink-muted">{value}</span> : null}
      <ChevronRight size={16} className="text-ink-subtle" aria-hidden="true" />
    </Link>
  );
}

const ROLE_VI = { nursery: 'Nhà vườn', admin: 'Quản trị', artisan: 'Nghệ nhân', player: 'Người chơi' } as Record<string, string>;

/** Đầu trang: ảnh chữ cái, tên, vai trò; ba số liệu bấm được (lượt, cây, bậc tay nghề). */
function ProfileHero({ me, trees, skill }: { me: User; trees: number | null; skill: Skill | null }) {
  const stat = 'flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-ink no-underline hover:bg-surface-2 hover:text-ink';
  return (
    <section aria-label="Hồ sơ của bạn" className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center gap-3 p-4">
        <Avatar name={me.name || me.email || '?'} size="lg" />
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <div className="text-h2">{me.name || me.email}</div>
          {me.garden_name ? <div className="text-caption text-ink-muted">{me.garden_name}</div> : null}
          <Chip tone={me.role === 'player' ? 'neutral' : 'success'} className="mt-1">{ROLE_VI[me.role] ?? me.role}</Chip>
        </div>
      </div>
      <div className="flex divide-x divide-line border-t border-line">
        <Link to="/mua-luot" className={stat}><span className="tabular text-h2 text-primary">{me.credits}</span><span className="text-label text-ink-muted">lượt</span></Link>
        <Link to="/vuon" className={stat}><span className="tabular text-h2">{trees ?? '–'}</span><span className="text-label text-ink-muted">cây</span></Link>
        {skill ? <a href="#bac-tay-nghe" className={stat}><span className="text-body font-semibold">{skill.level_vi}</span><span className="text-label text-ink-muted">bậc</span></a> : null}
      </div>
    </section>
  );
}

const STATUS: Record<Payment['status'], string> = { pending: 'Chờ tiền về', paid: 'Đã cộng lượt', expired: 'Hết hạn', cancelled: 'Đã hủy' };

export default function Account() {
  const on = useFeatures();
  const { user, setUser, signOut } = useAuth();
  const navigate = useNavigate();
  const me = user.status === 'ready' ? user.data : null;
  const [form, setForm] = useState({ name: '', garden_name: '', phone: '' });
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [theme, setThemeState] = useState<ThemePref>(getTheme);
  const [push, setPush] = useState<PushState | null>(null);
  const [prefError, setPrefError] = useState<string | null>(null);
  const [trees, setTrees] = useState<number | null>(cachedGarden(me?.id)?.trees.length ?? null);
  const [skill, setSkill] = useState<Skill | null>(null);
  const [gift, setGift] = useState(false);
  useEffect(() => {
    loadGarden(me?.id).then((g) => setTrees(g.trees.length)).catch(() => null);
    if (on('skill_levels')) communityApi.skill().then(setSkill).catch(() => null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    pushState().then(setPush).catch(() => setPush('unsupported'));
  }, []);

  const setPref = async (body: { consent_training?: boolean; notify_zalo?: boolean }) => {
    setPrefError(null);
    try {
      setUser(await accountApi.updateProfile(body));
    } catch (e) {
      setPrefError((e as ApiError).message);
    }
  };
  const togglePush = async (on: boolean) => {
    setPrefError(null);
    try {
      setPush(on ? await enablePush() : await disablePush());
    } catch (e) {
      setPrefError((e as ApiError).message ?? 'Chưa đổi được cài đặt thông báo.');
    }
  };
  const removeAccount = async () => {
    if (!window.confirm('Xóa tài khoản? Bạn sẽ không đăng nhập được nữa. Dữ liệu được giữ lại và có thể khôi phục khi liên hệ hỗ trợ.')) return;
    try {
      await accountApi.deleteAccount();
      signOut();
      navigate('/', { replace: true });
    } catch (e) {
      setPrefError((e as ApiError).message);
    }
  };

  useEffect(() => {
    if (me) setForm({ name: me.name ?? '', garden_name: me.garden_name ?? '', phone: me.phone ?? '' });
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    accountApi.payments().then(setPayments).catch(() => setPayments([]));
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(null);
    try {
      setUser(await accountApi.updateProfile(form));
      setSaved('Đã lưu');
    } catch (err) {
      setError((err as ApiError).status === 422 ? 'Số điện thoại chưa đúng (8–32 chữ số).' : (err as ApiError).message);
    }
  };

  const dirty = Boolean(me) && (form.name !== (me?.name ?? '') || form.garden_name !== (me?.garden_name ?? '') || form.phone !== (me?.phone ?? ''));
  const field = (id: keyof typeof form, label: string, Icon: LucideIcon, placeholder?: string) => (
    <label htmlFor={id} className="flex min-h-[52px] items-center gap-3 px-4">
      <IconBadge Icon={Icon} size="sm" />
      <span className="w-24 flex-none text-caption text-ink-muted">{label}</span>
      <input id={id} value={form[id]} placeholder={placeholder} onChange={(e) => setForm({ ...form, [id]: e.target.value })} inputMode={id === 'phone' ? 'tel' : 'text'}
        className="min-h-touch min-w-0 flex-1 bg-transparent text-right text-caption font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-subtle" />
    </label>
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <header className="px-gutter pb-2 pt-5"><h1 className="text-h1">Tài khoản</h1></header>
      <main className="flex flex-col gap-5 px-gutter pb-6">
        {!me ? <Skeleton className="h-36 rounded-card" /> : <ProfileHero me={me} trees={trees} skill={skill} />}

        <section className="flex flex-col gap-2" aria-label="Lượt">
          <ButtonLink to="/mua-luot" size="touch">
            <Coins size={18} strokeWidth={1.75} aria-hidden="true" />
            Mua lượt
          </ButtonLink>
          <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <button type="button" aria-expanded={gift} onClick={() => setGift(!gift)} className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-caption font-medium">
              <IconBadge Icon={Gift} tone="clay" size="sm" />
              <span className="flex-1">Nhập mã quà tặng</span>
              <ChevronDown size={16} className={gift ? 'rotate-180 text-ink-subtle' : 'text-ink-subtle'} aria-hidden="true" />
            </button>
            {gift ? <div className="p-4"><GiftCodeBox /></div> : null}
            <RowLink to="/tai-khoan/luot" Icon={History} label="Lịch sử lượt" />
          </div>
        </section>

        {on('skill_levels') ? <div id="bac-tay-nghe" className="scroll-mt-4"><SkillCard data={skill} /></div> : null}
        {on('public_profiles') ? <PublicProfile /> : null}
        {on('referral') ? <ReferralCard /> : null}

        <form onSubmit={save} className="flex flex-col gap-2">
          <Group title="Hồ sơ">
            {field('name', 'Tên', UserRound, 'Chưa đặt')}
            {field('garden_name', 'Tên vườn', Store, 'Chưa đặt')}
            {field('phone', 'Điện thoại', Phone, 'Chưa đặt')}
            <ProfileExtras />
          </Group>
          {error ? <Notice tone="danger">{error}</Notice> : saved ? <Notice tone="success">{saved}</Notice> : null}
          {dirty ? <Button type="submit" size="touch">Lưu hồ sơ</Button> : null}
        </form>

        <Group title="Thông báo">
          <Toggle id="push" Icon={Bell} tone="leaf" label="Trên trình duyệt này" hint={push && push !== 'on' && push !== 'off' ? PUSH_TEXT[push] : undefined} checked={push === 'on'}
            disabled={push !== 'on' && push !== 'off'} onChange={togglePush} />
          <Toggle id="zalo" Icon={MessageCircle} tone="leaf" label="Qua Zalo" hint={me?.phone ? undefined : 'Cần số điện thoại'}
            checked={Boolean(me?.notify_zalo)} disabled={!me?.phone} onChange={(v) => setPref({ notify_zalo: v })} />
        </Group>

        <Group title="Giao diện">
          <div className="flex items-center gap-3 px-4 py-3">
            <IconBadge Icon={Palette} size="sm" />
            <div className="flex-1"><Segmented<ThemePref> label="Giao diện" value={theme} onChange={(v) => { setThemeState(v); setTheme(v); }}
              options={[['light', 'Sáng'], ['dark', 'Tối'], ['system', 'Theo máy']]} /></div>
          </div>
        </Group>

        <Group title="Quyền riêng tư">
          <Toggle id="consent" Icon={ImageIcon} label="Cho phép dùng ảnh để cải thiện AI" checked={Boolean(me?.consent_training)} onChange={(v) => setPref({ consent_training: v })} />
          <RowLink to="/dieu-khoan" Icon={FileText} label="Điều khoản và quyền riêng tư" />
        </Group>
        {prefError ? <Notice tone="danger">{prefError}</Notice> : null}

        <Group title="Thanh toán">
          {payments === null ? <div className="p-4"><Skeleton className="h-6" /></div> : payments.length === 0 ? (
            <p className="m-0 px-4 py-3.5 text-caption text-ink-subtle">Chưa có giao dịch</p>
          ) : (
            payments.map((p) => (
              <div key={p.id} className="tabular flex min-h-[52px] items-center gap-3 px-4 text-caption">
                <IconBadge Icon={Receipt} tone={p.status === 'paid' ? 'leaf' : 'ink'} size="sm" />
                <span className="flex flex-1 flex-col"><span className="font-semibold">{vnd(p.amount_vnd)}</span><span className="font-mono text-label text-ink-subtle">{p.transfer_code_display}</span></span>
                <span className={p.status === 'paid' ? 'font-medium text-primary' : 'text-ink-subtle'}>{STATUS[p.status]}</span>
              </div>
            ))
          )}
        </Group>

        <div className="flex flex-col gap-1">
          {me?.role === 'admin' ? (
            <ButtonLink to="/admin" variant="ghost" size="touch">
              <Shield size={16} strokeWidth={1.75} aria-hidden="true" />
              Trang quản trị
            </ButtonLink>
          ) : me?.role === 'artisan' ? (
            <ButtonLink to="/admin/cham-diem" variant="ghost" size="touch">
              <Shield size={16} strokeWidth={1.75} aria-hidden="true" />
              Khu nghệ nhân
            </ButtonLink>
          ) : null}
          <Button variant="ghost" size="touch" onClick={() => { signOut(); navigate('/'); }}>
            <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
            Đăng xuất
          </Button>
          <Button variant="danger" size="touch" onClick={removeAccount}>Xóa tài khoản</Button>
        </div>
      </main>
    </div>
  );
}
