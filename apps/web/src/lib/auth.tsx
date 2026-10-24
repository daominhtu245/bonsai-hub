import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, auth, tokenStore, type TokenResponse, type User } from './api';
import type { ViewState } from '@/components/ui';

interface AuthValue {
  /** `empty` = chưa đăng nhập. */
  user: ViewState<User>;
  signIn: (res: TokenResponse) => void;
  setUser: (u: User) => void;
  signOut: () => void;
  refresh: () => void;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ViewState<User>>(() => (tokenStore.get() ? { status: 'loading' } : { status: 'empty' }));

  const refresh = useCallback(() => {
    if (!tokenStore.get()) {
      setUser({ status: 'empty' });
      return;
    }
    // Làm mới ngầm: đang có người dùng thì giữ nguyên trong lúc tải lại (không tháo trang đang mở → mất trạng thái).
    setUser((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }));
    auth
      .me()
      .then((u) => setUser({ status: 'ready', data: u }))
      .catch((e: ApiError) =>
        setUser(e.status === 401 ? { status: 'empty' } : { status: 'error', message: e.message, retry: refresh }),
      );
  }, []);

  useEffect(refresh, [refresh]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      refresh,
      signIn: (res) => {
        tokenStore.set(res.access_token);
        setUser({ status: 'ready', data: res.user });
      },
      setUser: (u) => setUser({ status: 'ready', data: u }),
      signOut: () => {
        tokenStore.set(null);
        setUser({ status: 'empty' });
      },
    }),
    [user, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
