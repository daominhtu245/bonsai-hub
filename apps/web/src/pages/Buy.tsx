import { useEffect, useState } from 'react';
import { BackHeader } from '@/components/BackHeader';
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
      <main className="flex flex-col gap-4 px-gutter pb-8">
        <p className="m-0 text-caption text-ink-muted">
          Mỗi lượt gồm ảnh kết quả cuối, 3 ảnh giai đoạn và hướng dẫn chăm. Phân tích và bản vẽ luôn miễn phí.
        </p>

        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0" disabled={Boolean(payment)}>
          <legend className="mb-2 font-semibold">Chọn gói</legend>
          {packages === null
            ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[72px] rounded-card" />)
            : packages.map((p) => (
                <label
                  key={p.code}
                  className={cx(
                    'relative flex min-h-[72px] cursor-pointer items-center gap-3 rounded-card bg-surface px-3.5 py-3',
                    selected === p.code ? 'border-2 border-primary' : 'border border-line',
                  )}
                >
                  {p.popular ? <span className="absolute -top-2.5 left-3 rounded-full bg-primary px-2 text-label font-semibold text-primary-on">Được chọn nhiều</span> : null}
                  <input type="radio" name="pk" value={p.code} checked={selected === p.code} onChange={() => setSelected(p.code)} className="h-5 w-5 accent-[var(--primary)]" />
                  <span className="flex flex-1 flex-col">
                    <span className="font-semibold">
                      {p.name_vi} · {p.credits} lượt{' '}
                      {p.nursery ? <span className="rounded-full bg-clay-soft px-2 text-label font-semibold text-clay">Logo vườn</span> : null}
                    </span>
                    <span className="text-caption text-ink-muted">{p.note_vi}</span>
                  </span>
                  <span className="font-semibold">{vnd(p.amount_vnd)}</span>
                </label>
              ))}
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
            Mã chuyển khoản đã hết hạn. Nếu bạn đã chuyển tiền, đừng lo — lượt vẫn được cộng khi tiền về.
          </Notice>
        ) : (
          <section className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface p-4" aria-label="Thông tin chuyển khoản">
            <span className="font-semibold">Quét mã để chuyển khoản</span>
            {payment.qr_url ? <img src={payment.qr_url} alt={`Mã VietQR chuyển ${vnd(payment.amount_vnd)}, nội dung ${payment.transfer_code_display}`} className="h-[220px] w-[220px] rounded-img bg-surface" /> : null}
            <dl className="m-0 grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-caption">
              <dt className="text-ink-muted">Số tiền</dt><dd className="m-0 font-semibold">{vnd(payment.amount_vnd)}</dd>
              <dt className="text-ink-muted">Nội dung</dt><dd className="m-0 font-mono font-semibold">{payment.transfer_code_display}</dd>
              <dt className="text-ink-muted">Tài khoản</dt><dd className="m-0">{[payment.bank_name, payment.bank_account, payment.bank_account_name].filter(Boolean).join(' · ')}</dd>
            </dl>
            <div role="status" className="flex w-full items-center gap-2 rounded-btn bg-warn-soft px-3 py-2.5 text-caption text-warn-ink">
              <span className="h-2.5 w-2.5 flex-none animate-pulse rounded-full bg-warn" aria-hidden="true" />
              Đang chờ tiền về · lượt sẽ tự cộng, không cần gửi ảnh
            </div>
            {payment.qr_url ? (
              <Button variant="secondary" onClick={() => downloadImage(payment.qr_url!, `vietqr-${payment.transfer_code}.png`).catch(() => setError('Chưa lưu được mã QR, bạn chụp màn hình giúp nhé.'))}>
                Lưu mã QR vào máy
              </Button>
            ) : null}
          </section>
        )}
        <span className="text-center text-label text-ink-muted">Lịch sử thanh toán nằm trong Tài khoản</span>
      </main>
    </div>
  );
}
