import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { toolsApi } from '@/lib/tools';

const KEY = 'bonsai.ref';

/** Link giới thiệu (?ref=MÃ): nhớ mã, đăng nhập xong thì tự nhập một lần. */
export function ReferralCapture() {
  const { user } = useAuth();
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('ref');
    if (code) try { localStorage.setItem(KEY, code.slice(0, 12)); } catch { /* chế độ riêng tư */ }
  }, []);
  useEffect(() => {
    if (user.status !== 'ready') return;
    let code: string | null = null;
    try { code = localStorage.getItem(KEY); } catch { return; }
    if (!code) return;
    toolsApi.claimReferral(code).catch(() => null).finally(() => { try { localStorage.removeItem(KEY); } catch { /* bỏ qua */ } });
  }, [user.status]);
  return null;
}
