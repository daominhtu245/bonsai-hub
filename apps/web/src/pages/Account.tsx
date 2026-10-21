import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BottomNav } from '@/components/BottomNav';
import { Button, ButtonLink, Card, Notice, Skeleton } from '@/components/ui';
import { accountApi, vnd, type Payment } from '@/lib/account';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push';

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
    <label htmlFor={id} className="flex min-h-touch cursor-pointer items-center gap-3">
      <span className="flex-1">
        <span className="block font-medium">{label}</span>
        {hint ? <span className="block text-caption text-ink-muted">{hint}</span> : null}
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-6 w-6 flex-none accent-[var(--primary)]" />
    </label>
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
      setSaved('Đã lưu.');
    } catch (err) {
      setError((err as ApiError).status === 422 ? 'Số điện thoại chưa đúng (8–32 chữ số).' : (err as ApiError).message);
    }
  };

  const field = (id: keyof typeof form, label: string, hint?: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-caption font-medium">{label}</label>
      <input id={id} value={form[id]} onChange={(e) => setForm({ ...form, [id]: e.target.value })} inputMode={id === 'phone' ? 'tel' : 'text'}
        className="min-h-cta rounded-btn border border-line-strong bg-surface px-3.5 text-body text-ink" />
      {hint ? <span className="text-label text-ink-muted">{hint}</span> : null}
    </div>
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <header className="px-gutter pb-2 pt-4"><h1 className="text-h1">Tài khoản</h1></header>
      <main className="flex flex-col gap-4 px-gutter pb-6">
        {!me ? <Skeleton className="h-24 rounded-card" /> : (
          <Card className="flex flex-wrap items-center gap-3">
            <div className="min-w-[10rem] flex-1 [overflow-wrap:anywhere]">
              <div className="font-semibold">{me.name || me.email}</div>
              <div className="text-caption text-ink-muted">{me.role === 'nursery' ? 'Nhà vườn' : me.role === 'admin' ? 'Quản trị' : 'Người chơi'} · còn {me.credits} lượt</div>
            </div>
            <ButtonLink to="/mua-luot" size="touch" block={false}>Mua lượt</ButtonLink>
          </Card>
        )}

        <form onSubmit={save} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <h2 className="text-h2">Thông tin hiển thị</h2>
          {field('name', 'Tên của bạn')}
          {field('garden_name', 'Tên vườn', 'Nhà vườn: tên và số điện thoại được in lên ảnh chia sẻ.')}
          {field('phone', 'Số điện thoại vườn')}
          {error ? <Notice tone="danger">{error}</Notice> : saved ? <Notice tone="success">{saved}</Notice> : null}
          <Button type="submit" variant="secondary">Lưu</Button>
        </form>

        <section className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4" aria-labelledby="notify-h">
          <h2 id="notify-h" className="text-h2">Thông báo</h2>
          <p className="m-0 text-caption text-ink-muted">Báo khi phân tích xong, khi ảnh và lộ trình sẵn sàng.</p>
          <Toggle id="push" label="Trên trình duyệt này" hint={push ? PUSH_TEXT[push] : undefined} checked={push === 'on'}
            disabled={push !== 'on' && push !== 'off'} onChange={togglePush} />
          <Toggle id="zalo" label="Qua Zalo" hint={me?.phone ? `Gửi tới ${me.phone}` : 'Thêm số điện thoại ở trên để bật'}
            checked={Boolean(me?.notify_zalo)} disabled={!me?.phone} onChange={(v) => setPref({ notify_zalo: v })} />
        </section>

        <section className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4" aria-labelledby="privacy-h">
          <h2 id="privacy-h" className="text-h2">Quyền riêng tư</h2>
          <Toggle id="consent" label="Cho phép dùng ảnh để cải thiện AI" hint="Không bắt buộc. Ảnh không được công bố hay bán."
            checked={Boolean(me?.consent_training)} onChange={(v) => setPref({ consent_training: v })} />
          <Link to="/dieu-khoan" className="flex min-h-touch items-center text-caption">Điều khoản và quyền riêng tư</Link>
        </section>
        {prefError ? <Notice tone="danger">{prefError}</Notice> : null}

        <section className="flex flex-col gap-2">
          <h2 className="text-h2">Lịch sử thanh toán</h2>
          {payments === null ? <Skeleton className="h-16 rounded-card" /> : payments.length === 0 ? (
            <p className="m-0 text-caption text-ink-muted">Chưa có giao dịch.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between rounded-card border border-line bg-surface px-3.5 py-2.5 text-caption">
                  <span>{p.transfer_code_display} · {vnd(p.amount_vnd)}</span>
                  <span className={p.status === 'paid' ? 'font-semibold text-primary-ink' : 'text-ink-muted'}>{STATUS[p.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {me?.role === 'admin' ? <ButtonLink to="/admin" variant="secondary">Trang quản trị</ButtonLink> : null}
        <Button variant="ghost" onClick={() => { signOut(); navigate('/'); }}>Đăng xuất</Button>
        <Button variant="danger" size="touch" onClick={removeAccount}>Xóa tài khoản</Button>
      </main>
      <BottomNav />
    </div>
  );
}
