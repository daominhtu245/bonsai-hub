import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Button, Notice } from '@/components/ui';
import { ApiError, auth } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { googleEnabled, renderGoogleButton, startZaloLogin, takeZaloPkce, zaloEnabled } from '@/lib/oauth';

const devLoginEnabled = import.meta.env.DEV || import.meta.env.VITE_DEV_LOGIN === 'true';

function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export default function Login() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const googleBox = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devEmail, setDevEmail] = useState('');

  useEffect(() => {
    if (!googleEnabled || !googleBox.current) return;
    renderGoogleButton(googleBox.current, (token) => {
      setBusy(true);
      auth
        .google(token)
        .then((res) => {
          signIn(res);
          navigate(next, { replace: true });
        })
        .catch((e: ApiError) => setError(e.message))
        .finally(() => setBusy(false));
    }).catch(() => setError('Không tải được nút Google. Kiểm tra mạng rồi tải lại trang.'));
  }, [navigate, next, signIn]);

  if (user.status === 'ready') return <Navigate to={next} replace />;

  const onDev = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    auth
      .dev(devEmail)
      .then((res) => {
        signIn(res);
        navigate(next, { replace: true });
      })
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/" title="Đăng nhập" />
      <main className="flex flex-col gap-4 px-gutter pt-4">
        <h2 className="text-h1">Lưu cây vào vườn của bạn</h2>
        <p className="m-0 text-ink-muted">Đăng nhập để lưu ảnh phôi, bản vẽ và lộ trình. Tài khoản mới được tặng 1 lượt tạo ảnh.</p>

        {error ? <Notice tone="danger">{error}</Notice> : null}

        {googleEnabled ? <div ref={googleBox} className="min-h-touch w-full" aria-busy={busy} /> : null}
        {zaloEnabled ? (
          <Button variant="secondary" disabled={busy} onClick={() => startZaloLogin(next).catch(() => setError('Không mở được Zalo, bạn thử lại nhé.'))}>
            Tiếp tục với Zalo
          </Button>
        ) : null}
        {!googleEnabled && !zaloEnabled ? (
          <Notice tone="warn">Đăng nhập Google và Zalo chưa được cấu hình (VITE_GOOGLE_CLIENT_ID, VITE_ZALO_APP_ID).</Notice>
        ) : null}

        {devLoginEnabled ? (
          <form onSubmit={onDev} className="flex flex-col gap-2 rounded-card border border-dashed border-line-strong p-4">
            <label htmlFor="dev-email" className="text-caption font-medium">
              Đăng nhập thử (chỉ môi trường dev)
            </label>
            <input
              id="dev-email"
              type="email"
              required
              value={devEmail}
              onChange={(e) => setDevEmail(e.target.value)}
              placeholder="ban@example.com"
              className="min-h-cta rounded-btn border border-line-strong bg-surface px-3.5 text-body text-ink"
            />
            <Button type="submit" variant="secondary" loading={busy}>
              Vào bằng email thử
            </Button>
          </form>
        ) : null}
      </main>
    </div>
  );
}

/** Trang Zalo chuyển về sau khi người dùng cấp quyền. */
export function ZaloCallback() {
  const [params] = useSearchParams();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = params.get('code');
    const pkce = takeZaloPkce(params.get('state'));
    if (!code || !pkce) {
      setError('Phiên đăng nhập Zalo không hợp lệ hoặc đã hết hạn. Bạn thử đăng nhập lại nhé.');
      return;
    }
    auth
      .zalo(code, pkce.verifier)
      .then((res) => {
        signIn(res);
        navigate(safeNext(pkce.next), { replace: true });
      })
      .catch((e: ApiError) => setError(e.message));
  }, [navigate, params, signIn]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col gap-4 px-gutter pt-8">
      {error ? (
        <Notice tone="danger" action={<Button variant="secondary" size="touch" block={false} onClick={() => navigate('/dang-nhap')}>Đăng nhập lại</Button>}>
          {error}
        </Notice>
      ) : (
        <p className="text-ink-muted" aria-live="polite">Đang đăng nhập bằng Zalo…</p>
      )}
    </div>
  );
}
