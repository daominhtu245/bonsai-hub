import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { BrandMark } from '@/components/BrandMark';
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
      <main className="flex flex-col gap-4 px-gutter pt-8">
        <BrandMark size={40} />
        <div>
          <h2 className="text-h1">Đăng nhập Bonsai AI</h2>
          <p className="m-0 mt-1 text-caption text-ink-muted">Tài khoản mới được tặng 1 lượt tạo ảnh.</p>
        </div>

        {error ? <Notice tone="danger">{error}</Notice> : null}

        {googleEnabled ? <div ref={googleBox} className="min-h-touch w-full" aria-busy={busy} /> : null}
        {zaloEnabled ? (
          <Button variant="secondary" disabled={busy} onClick={() => startZaloLogin(next).catch(() => setError('Không mở được Zalo, bạn thử lại nhé.'))}>
            Tiếp tục với Zalo
          </Button>
        ) : null}
        {!googleEnabled && !zaloEnabled ? (
          <Notice tone="info">
            Đăng nhập tạm thời chưa khả dụng.
            {import.meta.env.DEV ? ' (Thiếu VITE_GOOGLE_CLIENT_ID / VITE_ZALO_APP_ID.)' : ''}
          </Notice>
        ) : null}

        <p className="m-0 text-label text-ink-muted">
          Bằng việc tiếp tục, bạn đồng ý với <Link to="/dieu-khoan">Điều khoản và quyền riêng tư</Link>.
        </p>

        {devLoginEnabled ? (
          <form onSubmit={onDev} className="mt-2 flex flex-col gap-2 border-t border-line pt-4">
            <label htmlFor="dev-email" className="eyebrow">
              Môi trường dev
            </label>
            <input
              id="dev-email"
              type="email"
              required
              value={devEmail}
              onChange={(e) => setDevEmail(e.target.value)}
              placeholder="ban@example.com"
              className="min-h-cta rounded-btn border border-line-strong bg-surface px-3.5 text-body text-ink shadow-card"
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
