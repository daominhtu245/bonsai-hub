import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { BackHeader } from '@/components/BackHeader';
import { GiftCodeBox } from '@/components/GiftCodeBox';
import { Button, ButtonLink, Notice, Skeleton } from '@/components/ui';
import { accountApi, downloadImage, vnd, watchPayment, type Package, type Payment } from '@/lib/account';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cx } from '@/lib/cx';

/** Màn 09 — Mua lượt (design/mockups/Buy.dc.html): chọn gói → mã VietQR → tự cộng lượt khi tiền về (webhook + SSE). */
export default function Buy() {
  const { refresh } = useAuth();
  const [packages, setPackages] = useState<Package[] | null>(null);
  const [selected, setSelected] = useState('player');
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    accountApi.packages().then(setPackages).catch((e: ApiError) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!payment || payment.status !== 'pending') return;
    return watchPayment(
      payment.id,
      (status) => {
        setPayment((p) => (p ? { ...p, status } : p));
        if (status === 'paid') refresh();
      },
      (e) => setError(e.message),
    );
  }, [payment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pkg = packages?.find((p) => p.code === selected);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setPayment(await accountApi.createPayment(selected));
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/tai-khoan" title="Mua thêm lượt" />
      <main className="flex flex-col gap-4 px-gutter pb-8 pt-5">
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" disabled={Boolean(payment)}>
          <legend className="eyebrow mb-2">Chọn gói</legend>
          {packages === null
            ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[68px] rounded-card" />)
            : packages.map((p) => {
                const on = selected === p.code;
                return (
                  <label key={p.code}
                    className={cx('flex min-h-[68px] cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-card border bg-surface px-4 py-3 shadow-card transition-colors',
                      on ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-line-strong')}>
                    <input type="radio" name="pk" value={p.code} checked={on} onChange={() => setSelected(p.code)} className="h-4 w-4" />
                    <span className="flex min-w-[9rem] flex-1 flex-col">
                      <span className="flex flex-wrap items-center gap-1.5 font-semibold">
                        {p.name_vi} · {p.credits} lượt
                        {p.popular ? <span className="rounded-chip bg-primary-soft px-1.5 text-label font-medium text-primary-ink">Phổ biến</span> : null}
                        {p.nursery ? <span className="rounded-chip bg-surface-2 px-1.5 text-label font-medium text-ink-muted">Logo vườn</span> : null}
                      </span>
                      <span className="tabular text-label text-ink-subtle">{vnd(Math.round(p.amount_vnd / p.credits))} / lượt</span>
                    </span>
                    <span className="tabular ml-auto font-semibold">{vnd(p.amount_vnd)}</span>
                  </label>
                );
              })}
        </fieldset>

        {error ? <Notice tone="danger">{error}</Notice> : null}

        {!payment ? (
          <Button onClick={start} loading={busy} disabled={!pkg}>
            {pkg ? `Lấy mã chuyển khoản · ${vnd(pkg.amount_vnd)}` : 'Chọn gói'}
          </Button>
        ) : payment.status === 'paid' ? (
          <>
            <Notice tone="success">Đã nhận {vnd(payment.amount_vnd)} · cộng {pkg?.credits ?? ''} lượt</Notice>
            <ButtonLink to="/vuon">Về vườn của tôi</ButtonLink>
          </>
        ) : payment.status === 'expired' ? (
          <Notice tone="warn" action={<Button variant="secondary" size="touch" block={false} onClick={() => setPayment(null)}>Lấy mã mới</Button>}>
            Mã đã hết hạn. Nếu bạn đã chuyển, lượt vẫn được cộng khi tiền về.
          </Notice>
        ) : (
          <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-card" aria-label="Thông tin chuyển khoản">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Chuyển khoản</span>
              <span role="status" className="flex items-center gap-1.5 text-label font-medium text-ink-muted">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                Đang chờ tiền về
              </span>
            </div>
            {payment.qr_url ? (
              <div className="theme-light mx-auto rounded-btn border border-line bg-surface p-2">
                <img src={payment.qr_url} alt={`Mã VietQR chuyển ${vnd(payment.amount_vnd)}, nội dung ${payment.transfer_code_display}`} className="h-[200px] w-[200px]" />
              </div>
            ) : null}
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-caption">
              <dt className="text-ink-subtle">Số tiền</dt><dd className="tabular m-0 text-right font-semibold">{vnd(payment.amount_vnd)}</dd>
              <dt className="text-ink-subtle">Nội dung</dt><dd className="m-0 text-right font-mono font-semibold">{payment.transfer_code_display}</dd>
              <dt className="text-ink-subtle">Tài khoản</dt><dd className="m-0 text-right">{[payment.bank_name, payment.bank_account, payment.bank_account_name].filter(Boolean).join(' · ')}</dd>
            </dl>
            {payment.qr_url ? (
              <Button variant="secondary" size="touch" onClick={() => downloadImage(payment.qr_url!, `vietqr-${payment.transfer_code}.png`).catch(() => setError('Chưa lưu được mã QR, bạn chụp màn hình giúp nhé.'))}>
                <Download size={16} strokeWidth={1.75} aria-hidden="true" />
                Lưu mã QR
              </Button>
            ) : null}
          </section>
        )}
        <div className="mt-2 rounded-card border border-line bg-surface p-4 shadow-card">
          <GiftCodeBox />
        </div>
      </main>
    </div>
  );
}
