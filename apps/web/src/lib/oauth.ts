// Đăng nhập Google (Google Identity Services) và Zalo (OAuth v4 + PKCE).

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const ZALO_APP_ID = import.meta.env.VITE_ZALO_APP_ID as string | undefined;
const ZALO_KEY = 'bonsai.zalo-pkce';

export const googleEnabled = Boolean(GOOGLE_CLIENT_ID);
export const zaloEnabled = Boolean(ZALO_APP_ID);

interface GoogleId {
  initialize(opts: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup' }): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let gsiPromise: Promise<GoogleId> | null = null;

function loadGsi(): Promise<GoogleId> {
  gsiPromise ??= new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google.accounts.id);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google ? resolve(window.google.accounts.id) : reject(new Error('gsi')));
    s.onerror = () => {
      gsiPromise = null;
      reject(new Error('gsi'));
    };
    document.head.appendChild(s);
  });
  return gsiPromise;
}

/** Vẽ nút Google chính thức vào `el`; gọi `onCredential` với ID token. */
export async function renderGoogleButton(el: HTMLElement, onCredential: (idToken: string) => void): Promise<void> {
  if (!GOOGLE_CLIENT_ID) throw new Error('google not configured');
  const gid = await loadGsi();
  gid.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => onCredential(r.credential), ux_mode: 'popup' });
  gid.renderButton(el, { theme: 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', locale: 'vi', width: el.clientWidth || 320 });
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(len = 64): string {
  return base64url(crypto.getRandomValues(new Uint8Array(len))).slice(0, len);
}

export function zaloRedirectUri(): string {
  return `${location.origin}/dang-nhap/zalo`;
}

/** Chuyển sang trang cấp quyền của Zalo. */
export async function startZaloLogin(next: string): Promise<void> {
  if (!ZALO_APP_ID) throw new Error('zalo not configured');
  const verifier = randomString(64);
  const state = randomString(24);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem(ZALO_KEY, JSON.stringify({ verifier, state, next }));
  const url = new URL('https://oauth.zaloapp.com/v4/permission');
  url.search = new URLSearchParams({
    app_id: ZALO_APP_ID,
    redirect_uri: zaloRedirectUri(),
    code_challenge: base64url(digest),
    state,
  }).toString();
  location.assign(url.toString());
}

/** Đọc lại verifier đã lưu; trả null nếu state không khớp (chống CSRF). */
export function takeZaloPkce(state: string | null): { verifier: string; next: string } | null {
  const raw = sessionStorage.getItem(ZALO_KEY);
  sessionStorage.removeItem(ZALO_KEY);
  if (!raw || !state) return null;
  try {
    const saved = JSON.parse(raw) as { verifier: string; state: string; next: string };
    return saved.state === state ? { verifier: saved.verifier, next: saved.next } : null;
  } catch {
    return null;
  }
}
