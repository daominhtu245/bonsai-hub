import React, { useEffect, useState, type FormEvent } from 'react';
import { ChevronRight, LogOut, Shield } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { BottomNav } from '@/components/BottomNav';
import { GiftCodeBox } from '@/components/GiftCodeBox';
import { ProfileExtras } from '@/components/ProfileExtras';
import { ReferralCard } from '@/components/ReferralCard';
import { Button, ButtonLink, Notice, Segmented, Skeleton } from '@/components/ui';
import { accountApi, vnd, type Payment } from '@/lib/account';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push';
import { getTheme, setTheme, type ThemePref } from '@/lib/theme';

const PUSH_TEXT: Record<PushState, string> = {
  on: 'Đang bật trên thiết bị này',
  off: 'Đang tắt trên thiết bị này',
  denied: 'Trình duyệt đang chặn thông báo — mở cài đặt trang web để cho phép',
  disabled: 'Máy chủ chưa bật thông báo',
  unsupported: 'Trình duyệt này không hỗ trợ',
  'ios-needs-install': 'Trên iPhone: Chia sẻ › Thêm vào Màn hình chính, rồi mở app từ đó',
};

function Toggle({ id, label, hint, checked, disabled, onChange }: { id: string; label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex min-h-[52px] cursor-pointer items-center gap-3 px-4 py-2">
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

const STATUS: Record<Payment['status'], string> = { pending: 'Chờ tiền về', paid: 'Đã cộng lượt', expired: 'Hết hạn', cancelled: 'Đã hủy' };

export default function Account() {
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

  const field = (id: keyof typeof form, label: string, placeholder?: string) => (
    <label htmlFor={id} className="flex min-h-[52px] items-center gap-3 px-4">
      <span className="w-28 flex-none text-caption text-ink-muted">{label}</span>
      <input id={id} value={form[id]} placeholder={placeholder} onChange={(e) => setForm({ ...form, [id]: e.target.value })} inputMode={id === 'phone' ? 'tel' : 'text'}
        className="min-h-touch min-w-0 flex-1 bg-transparent text-right text-caption font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-subtle" />
    </label>
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <header className="px-gutter pb-2 pt-5"><h1 className="text-h1">Tài khoản</h1></header>
      <main className="flex flex-col gap-5 px-gutter pb-6">
        {!me ? <Skeleton className="h-20 rounded-card" /> : (
          <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="min-w-[10rem] flex-1 [overflow-wrap:anywhere]">
              <div className="font-semibold">{me.name || me.email}</div>
              <div className="tabular text-label text-ink-muted">{me.role === 'nursery' ? 'Nhà vườn' : me.role === 'admin' ? 'Quản trị' : me.role === 'artisan' ? 'Nghệ nhân' : 'Người chơi'} · {me.credits} lượt</div>
            </div>
            <ButtonLink to="/mua-luot" size="touch" block={false}>Mua lượt</ButtonLink>
          </div>
        )}

        <div className="rounded-card border border-line bg-surface p-4 shadow-card">
          <GiftCodeBox />
          <Link to="/tai-khoan/luot" className="mt-3 flex min-h-touch items-center justify-between text-caption font-medium text-ink no-underline">
            Lịch sử lượt
            <ChevronRight size={16} className="text-ink-subtle" aria-hidden="true" />
          </Link>
        </div>

        <ReferralCard />

        <form onSubmit={save} className="flex flex-col gap-2">
          <Group title="Hồ sơ">
            {field('name', 'Tên', 'Chưa đặt')}
            {field('garden_name', 'Tên vườn', 'Chưa đặt')}
            {field('phone', 'Điện thoại', 'Chưa đặt')}
            <ProfileExtras />
          </Group>
          {error ? <Notice tone="danger">{error}</Notice> : saved ? <Notice tone="success">{saved}</Notice> : null}
          <Button type="submit" variant="secondary" size="touch">Lưu hồ sơ</Button>
        </form>

        <Group title="Thông báo">
          <Toggle id="push" label="Trên trình duyệt này" hint={push && push !== 'on' && push !== 'off' ? PUSH_TEXT[push] : undefined} checked={push === 'on'}
            disabled={push !== 'on' && push !== 'off'} onChange={togglePush} />
          <Toggle id="zalo" label="Qua Zalo" hint={me?.phone ? undefined : 'Cần số điện thoại'}
            checked={Boolean(me?.notify_zalo)} disabled={!me?.phone} onChange={(v) => setPref({ notify_zalo: v })} />
        </Group>

        <Group title="Giao diện">
          <div className="px-4 py-3">
            <Segmented<ThemePref> label="Giao diện" value={theme} onChange={(v) => { setThemeState(v); setTheme(v); }}
              options={[['light', 'Sáng'], ['dark', 'Tối'], ['system', 'Theo máy']]} />
          </div>
        </Group>

        <Group title="Quyền riêng tư">
          <Toggle id="consent" label="Cho phép dùng ảnh để cải thiện AI" checked={Boolean(me?.consent_training)} onChange={(v) => setPref({ consent_training: v })} />
          <Link to="/dieu-khoan" className="flex min-h-[52px] items-center gap-3 px-4 text-caption font-medium text-ink no-underline hover:bg-surface-2 hover:text-ink">
            <span className="flex-1">Điều khoản và quyền riêng tư</span>
            <ChevronRight size={16} className="text-ink-subtle" aria-hidden="true" />
          </Link>
        </Group>
        {prefError ? <Notice tone="danger">{prefError}</Notice> : null}

        <Group title="Thanh toán">
          {payments === null ? <div className="p-4"><Skeleton className="h-6" /></div> : payments.length === 0 ? (
            <p className="m-0 px-4 py-3.5 text-caption text-ink-subtle">Chưa có giao dịch</p>
          ) : (
            payments.map((p) => (
              <div key={p.id} className="tabular flex min-h-[52px] items-center justify-between gap-3 px-4 text-caption">
                <span className="font-mono">{p.transfer_code_display}</span>
                <span>{vnd(p.amount_vnd)}</span>
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
      <BottomNav />
    </div>
  );
}
