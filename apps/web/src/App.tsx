import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom';
import { RequireAuth } from '@/components/RequireAuth';
import { ReferralCapture } from '@/components/ReferralCapture';
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
const RoomPlace = lazy(() => import('@/pages/RoomPlace'));
const TechDrawing = lazy(() => import('@/pages/TechDrawing'));
const Worksheet = lazy(() => import('@/pages/Worksheet'));
const VotePage = lazy(() => import('@/pages/community/Vote'));
const ChallengesPage = lazy(() => import('@/pages/community/Challenges'));
const ChallengeDetailPage = lazy(() => import('@/pages/community/ChallengeDetail'));
const PassportPublicPage = lazy(() => import('@/pages/community/PassportPublic'));
const AdminChallenges = lazy(() => import('@/pages/admin/Challenges'));
const MarketPage = lazy(() => import('@/pages/market/Market'));
const ListingPublicPage = lazy(() => import('@/pages/market/ListingPublic'));
const ListingTagPage = lazy(() => import('@/pages/market/ListingTag'));
const MyListingsPage = lazy(() => import('@/pages/market/MyListings'));
const PriceIndexPage = lazy(() => import('@/pages/market/PriceIndex'));
const AdminPots = lazy(() => import('@/pages/admin/PartnerPots'));
const ArtisanConsults = lazy(() => import('@/pages/artisan/Consults'));
const ArtisansPage = lazy(() => import('@/pages/expert/Artisans'));
const PersonPage = lazy(() => import('@/pages/expert/Person'));
const expertPages = () => import('@/pages/expert/Consults');
const AskConsultPage = lazy(() => expertPages().then((m) => ({ default: m.AskConsultPage })));
const MyConsultsPage = lazy(() => expertPages().then((m) => ({ default: m.MyConsultsPage })));
const ConsultDetailPage = lazy(() => expertPages().then((m) => ({ default: m.ConsultDetailPage })));
const carePages = () => import('@/pages/expert/Care');
const CareListPage = lazy(() => carePages().then((m) => ({ default: m.CareListPage })));
const CareNewPage = lazy(() => carePages().then((m) => ({ default: m.CareNewPage })));
const CareDetailPage = lazy(() => carePages().then((m) => ({ default: m.CareDetailPage })));
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
const ArtisanReview = lazy(() => import('@/pages/artisan/Review'));
const UtilitiesHub = lazy(() => import('@/pages/utilities/Hub'));
const MaiTet = lazy(() => import('@/pages/utilities/MaiTet'));
const MenhPage = lazy(() => import('@/pages/utilities/Menh'));
const RescuePage = lazy(() => import('@/pages/utilities/Rescue'));
const ArtisanRules = lazy(() => import('@/pages/artisan/Rules'));
const ArtisanStats = lazy(() => import('@/pages/artisan/Stats'));

const guard = (el: JSX.Element) => <RequireAuth>{el}</RequireAuth>;

function ChallengeStudio() {
  const { challengeId = '' } = useParams();
  return <Studio challengeId={challengeId} />;
}

export default function App() {
  return (
    <AuthProvider>
      <CaptureProvider>
        <BrowserRouter>
          <ReferralCapture />
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
              <Route path="/ket-qua/:jobId/dat-vao-phong" element={guard(<RoomPlace />)} />
              <Route path="/ket-qua/:jobId/ban-ve-ky-thuat" element={guard(<TechDrawing />)} />
              <Route path="/ket-qua/:jobId/phieu-tap-ve" element={guard(<Worksheet />)} />
              <Route path="/vuon" element={guard(<Garden />)} />
              <Route path="/chon-dang" element={guard(<VotePage />)} />
              <Route path="/thu-thach" element={guard(<ChallengesPage />)} />
              <Route path="/thu-thach/:challengeId" element={guard(<ChallengeDetailPage />)} />
              <Route path="/thu-thach/:challengeId/thiet-ke" element={guard(<ChallengeStudio />)} />
              <Route path="/so-cay/:code" element={<PassportPublicPage />} />
              <Route path="/cho" element={<MarketPage />} />
              <Route path="/tin/:code" element={<ListingPublicPage />} />
              <Route path="/tin/:code/the" element={<ListingTagPage />} />
              <Route path="/tin-cua-toi" element={guard(<MyListingsPage />)} />
              <Route path="/tien-ich/gia" element={<PriceIndexPage />} />
              <Route path="/nghe-nhan" element={<ArtisansPage />} />
              <Route path="/nguoi/:slug" element={<PersonPage />} />
              <Route path="/hoi-nghe-nhan" element={guard(<MyConsultsPage />)} />
              <Route path="/hoi-nghe-nhan/moi" element={guard(<AskConsultPage />)} />
              <Route path="/hoi-nghe-nhan/:consultId" element={guard(<ConsultDetailPage />)} />
              <Route path="/cham-ho" element={guard(<CareListPage />)} />
              <Route path="/cham-ho/moi" element={guard(<CareNewPage />)} />
              <Route path="/cham-ho/:requestId" element={guard(<CareDetailPage />)} />
              <Route path="/tien-ich" element={<UtilitiesHub />} />
              <Route path="/tien-ich/mai-tet" element={<MaiTet />} />
              <Route path="/tien-ich/hop-menh" element={<MenhPage />} />
              <Route path="/tien-ich/cap-cuu" element={<RescuePage />} />
              <Route path="/mua-luot" element={guard(<Buy />)} />
              <Route path="/chia-se/:jobId" element={guard(<Share />)} />
              <Route path="/tai-khoan" element={guard(<Account />)} />
              <Route path="/tai-khoan/luot" element={guard(<CreditHistory />)} />
              <Route path="/admin" element={guard(<AdminLayout />)}>
                <Route index element={<AdminDashboard />} />
                <Route path="phien" element={<AdminJobs />} />
                <Route path="cham-diem" element={<ArtisanReview />} />
                <Route path="bo-luat" element={<ArtisanRules />} />
                <Route path="thong-ke-cham" element={<ArtisanStats />} />
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
                <Route path="thu-thach" element={<AdminChallenges />} />
                <Route path="chau-doi-tac" element={<AdminPots />} />
                <Route path="hoi-dap" element={<ArtisanConsults />} />
                <Route path="hoi-dap/:consultId" element={<ArtisanConsults />} />
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
