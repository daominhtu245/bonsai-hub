import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import Home from '@/pages/Home';
import ComingSoon from '@/pages/ComingSoon';
import Login, { ZaloCallback } from '@/pages/Login';

const DesignSystem = lazy(() => import('@/pages/DesignSystem'));

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/he-thong-thiet-ke" element={<DesignSystem />} />
            <Route path="/dang-nhap" element={<Login />} />
            <Route path="/dang-nhap/zalo" element={<ZaloCallback />} />
            <Route path="/chup" element={<ComingSoon title="Chụp ảnh phôi" />} />
            <Route path="/vuon" element={<ComingSoon title="Vườn của tôi" />} />
            <Route path="*" element={<ComingSoon title="Không tìm thấy trang" />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
