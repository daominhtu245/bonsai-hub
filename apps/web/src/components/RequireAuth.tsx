import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { StateView } from './ui';

/** Chưa đăng nhập → chuyển sang /dang-nhap rồi quay lại đúng trang. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (user.status === 'empty') {
    return <Navigate to={`/dang-nhap?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  }
  return (
    <StateView state={user} skeleton={<div className="min-h-dvh" />} empty={null}>
      {() => <>{children}</>}
    </StateView>
  );
}
