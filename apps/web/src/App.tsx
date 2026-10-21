import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/components/RequireAuth';
import { AuthProvider } from '@/lib/auth';
import { CaptureProvider } from '@/lib/capture';
import ComingSoon from '@/pages/ComingSoon';
import Home from '@/pages/Home';
import Login, { ZaloCallback } from '@/pages/Login';

const DesignSystem = lazy(() => import('@/pages/DesignSystem'));
const Capture = lazy(() => import('@/pages/Capture'));
const TreeInfo = lazy(() => import('@/pages/TreeInfo'));
const Analyzing = lazy(() => import('@/pages/Analyzing'));
const Choose = lazy(() => import('@/pages/Choose'));
const Result = lazy(() => import('@/pages/Result'));

const guard = (el: JSX.Element) => <RequireAuth>{el}</RequireAuth>;

export default function App() {
  return (
    <AuthProvider>
      <CaptureProvider>
        <BrowserRouter>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/he-thong-thiet-ke" element={<DesignSystem />} />
              <Route path="/dang-nhap" element={<Login />} />
              <Route path="/dang-nhap/zalo" element={<ZaloCallback />} />
              <Route path="/chup" element={guard(<Capture />)} />
              <Route path="/chup/thong-tin" element={guard(<TreeInfo />)} />
              <Route path="/phan-tich/:jobId" element={guard(<Analyzing />)} />
              <Route path="/chon/:jobId" element={guard(<Choose />)} />
              <Route path="/ket-qua/:jobId" element={guard(<Result />)} />
              <Route path="/vuon" element={<ComingSoon title="Vườn của tôi" />} />
              <Route path="/mua-luot" element={<ComingSoon title="Mua lượt" />} />
              <Route path="*" element={<ComingSoon title="Không tìm thấy trang" />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </CaptureProvider>
    </AuthProvider>
  );
}
