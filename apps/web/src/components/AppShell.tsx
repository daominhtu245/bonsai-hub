import { Suspense, useEffect } from 'react';
import { Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { BottomNav } from './BottomNav';

/** Khung chung cho các trang chính: thanh dưới gắn một lần (không nháy khi chuyển trang), trang mới hiện dần,
 *  đi tới trang mới thì cuộn lên đầu (bấm Quay lại thì giữ vị trí). */
export function AppShell() {
  const { pathname } = useLocation();
  const nav = useNavigationType();
  useEffect(() => {
    if (nav !== 'POP') window.scrollTo(0, 0);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="app-shell pb-[var(--nav-h)]">
      <Suspense fallback={<div className="min-h-dvh" />}>
        <div key={pathname} className="page-enter">
          <Outlet />
        </div>
      </Suspense>
      <BottomNav />
    </div>
  );
}
