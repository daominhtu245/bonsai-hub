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
const Share = lazy(() => import('@/pages/Share'));
const Garden = lazy(() => import('@/pages/Garden'));
const Buy = lazy(() => import('@/pages/Buy'));
const Account = lazy(() => import('@/pages/Account'));
const Admin = lazy(() => import('@/pages/Admin'));

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
              <Route path="/vuon" element={guard(<Garden />)} />
              <Route path="/mua-luot" element={guard(<Buy />)} />
              <Route path="/chia-se/:jobId" element={guard(<Share />)} />
              <Route path="/tai-khoan" element={guard(<Account />)} />
              <Route path="/admin" element={guard(<Admin />)} />
              <Route path="*" element={<ComingSoon title="Không tìm thấy trang" />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </CaptureProvider>
    </AuthProvider>
  );
}
