import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { adminCommunityApi, type Inbox } from '@/lib/adminCommunity';

const POLL_MS = 60_000;
const Ctx = createContext<{ inbox: Inbox | null; refresh: () => void }>({ inbox: null, refresh: () => undefined });

/** Hộp việc dùng chung cho thanh bên (số đếm), bảng điều khiển và tiêu đề tab; tải lại mỗi phút và khi đổi trang. */
export function InboxProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const { pathname } = useLocation();
  const refresh = useCallback(() => {
    if (enabled) adminCommunityApi.inbox().then(setInbox).catch(() => null);
  }, [enabled]);
  useEffect(refresh, [refresh, pathname]);
  useEffect(() => {
    if (!enabled) return undefined;
    const t = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(t);
  }, [enabled, refresh]);
  useEffect(() => {
    const n = inbox?.urgent ?? 0;
    document.title = n ? `(${n}) Quản trị · Bonsai AI` : 'Quản trị · Bonsai AI';
  }, [inbox?.urgent]);
  return <Ctx.Provider value={{ inbox, refresh }}>{children}</Ctx.Provider>;
}

export const useInbox = () => useContext(Ctx);
