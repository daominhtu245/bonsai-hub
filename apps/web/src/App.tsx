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
const Studio = lazy(() => import('@/pages/Studio'));
const Result = lazy(() => import('@/pages/Result'));
const ResultPrint = lazy(() => import('@/pages/ResultPrint'));
const CreditHistory = lazy(() => import('@/pages/CreditHistory'));
const Share = lazy(() => import('@/pages/Share'));
const Garden = lazy(() => import('@/pages/Garden'));
const Buy = lazy(() => import('@/pages/Buy'));
const Account = lazy(() => import('@/pages/Account'));
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'));
const AdminJobs = lazy(() => import('@/pages/admin/Jobs'));
const AdminJobDetail = lazy(() => import('@/pages/admin/JobDetail'));
const AdminUsers = lazy(() => import('@/pages/admin/Users'));
const AdminUserDetail = lazy(() => import('@/pages/admin/UserDetail'));
const AdminPayments = lazy(() => import('@/pages/admin/Payments'));
const AdminSystem = lazy(() => import('@/pages/admin/System'));
const AdminAudit = lazy(() => import('@/pages/admin/Audit'));
const LabelEditor = lazy(() => import('@/pages/admin/LabelEditor'));
const adminPages = () => import('@/pages/admin/pages');
const AdminCosts = lazy(() => adminPages().then((m) => ({ default: m.CostsPage })));
const AdminPrompts = lazy(() => adminPages().then((m) => ({ default: m.PromptsPage })));
const AdminCatalog = lazy(() => adminPages().then((m) => ({ default: m.CatalogPage })));
const AdminFeedback = lazy(() => adminPages().then((m) => ({ default: m.FeedbackPage })));
const AdminAiMode = lazy(() => adminPages().then((m) => ({ default: m.AiModePage })));
const AdminLabels = lazy(() => adminPages().then((m) => ({ default: m.LabelsPage })));
const opsPages = () => import('@/pages/admin/OpsPages');
const AdminOps = lazy(() => opsPages().then((m) => ({ default: m.OpsPage })));
const AdminGiftCodes = lazy(() => opsPages().then((m) => ({ default: m.GiftCodesPage })));
const AdminBroadcast = lazy(() => opsPages().then((m) => ({ default: m.BroadcastPage })));
const Terms = lazy(() => import('@/pages/Terms'));

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
              <Route path="/tu-thiet-ke/:jobId" element={guard(<Studio />)} />
              <Route path="/ket-qua/:jobId" element={guard(<Result />)} />
              <Route path="/ket-qua/:jobId/in" element={guard(<ResultPrint />)} />
              <Route path="/vuon" element={guard(<Garden />)} />
              <Route path="/mua-luot" element={guard(<Buy />)} />
              <Route path="/chia-se/:jobId" element={guard(<Share />)} />
              <Route path="/tai-khoan" element={guard(<Account />)} />
              <Route path="/tai-khoan/luot" element={guard(<CreditHistory />)} />
              <Route path="/admin" element={guard(<AdminLayout />)}>
                <Route index element={<AdminDashboard />} />
                <Route path="phien" element={<AdminJobs />} />
                <Route path="phien/:jobId" element={<AdminJobDetail />} />
                <Route path="nguoi-dung" element={<AdminUsers />} />
                <Route path="nguoi-dung/:userId" element={<AdminUserDetail />} />
                <Route path="thanh-toan" element={<AdminPayments />} />
                <Route path="he-thong" element={<AdminSystem />} />
                <Route path="nhat-ky" element={<AdminAudit />} />
                <Route path="chi-phi" element={<AdminCosts />} />
                <Route path="prompt" element={<AdminPrompts />} />
                <Route path="danh-muc" element={<AdminCatalog />} />
                <Route path="phan-hoi" element={<AdminFeedback />} />
                <Route path="che-do-ai" element={<AdminAiMode />} />
                <Route path="gan-nhan" element={<AdminLabels />} />
                <Route path="gan-nhan/:labelId" element={<LabelEditor />} />
                <Route path="van-hanh" element={<AdminOps />} />
                <Route path="ma-qua-tang" element={<AdminGiftCodes />} />
                <Route path="thong-bao" element={<AdminBroadcast />} />
              </Route>
              <Route path="/dieu-khoan" element={<Terms />} />
              <Route path="*" element={<ComingSoon title="Không tìm thấy trang" />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </CaptureProvider>
    </AuthProvider>
  );
}
