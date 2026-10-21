import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '@/components/BottomNav';
import { Button, ButtonLink, Card, Notice, Skeleton } from '@/components/ui';
import { accountApi, vnd, type Payment } from '@/lib/account';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const STATUS: Record<Payment['status'], string> = { pending: 'Chờ tiền về', paid: 'Đã cộng lượt', expired: 'Hết hạn', cancelled: 'Đã hủy' };

export default function Account() {
  const { user, setUser, signOut } = useAuth();
  const navigate = useNavigate();
  const me = user.status === 'ready' ? user.data : null;
  const [form, setForm] = useState({ name: '', garden_name: '', phone: '' });
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);

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
          <Card className="flex items-center gap-3">
            <div className="flex-1">
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
      </main>
      <BottomNav />
    </div>
  );
}
