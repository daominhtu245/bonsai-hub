import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './auth';

/** Tính năng quản trị bật / tắt (apps/api/bonsai_api/services/features.py). Không có provider (test, trang lẻ) = mọi tính năng mở. */

export type FeatureKey =
  | 'art_styles' | 'timelapse' | 'tech_drawing' | 'worksheet' | 'room_place' | 'tree_tools' | 'read_aloud'
  | 'diary_rewards' | 'reality' | 'passport' | 'assistant' | 'health_check' | 'weather' | 'mai_tet' | 'rescue' | 'menh'
  | 'market' | 'price_index' | 'partner_pots' | 'consults' | 'public_profiles' | 'care'
  | 'challenges' | 'design_votes' | 'skill_levels' | 'referral';

type Flags = Partial<Record<FeatureKey, boolean>>;
const CACHE = 'bonsai.features';
const Ctx = createContext<Flags | null>(null);

function cached(): Flags {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? '{}') as Flags;
  } catch {
    return {};
  }
}

export function FeaturesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [flags, setFlags] = useState<Flags>(cached);
  const who = user.status === 'ready' ? user.data.id : user.status;
  useEffect(() => {
    if (who === 'loading') return;
    api<Flags>('/features').then((f) => {
      setFlags(f);
      try { localStorage.setItem(CACHE, JSON.stringify(f)); } catch { /* bộ nhớ trình duyệt bị chặn */ }
    }).catch(() => null);
  }, [who]);
  return <Ctx.Provider value={flags}>{children}</Ctx.Provider>;
}

/** true nếu tính năng mở với người đang dùng (chưa tải xong: theo lần trước, mặc định mở). */
export function useFeature(key: FeatureKey): boolean {
  const flags = useContext(Ctx);
  return flags?.[key] ?? true;
}

export function useFeatures(): (key: FeatureKey) => boolean {
  const flags = useContext(Ctx);
  return (key) => flags?.[key] ?? true;
}

/** Bọc một trang: tính năng đóng thì hiện thông báo thay vì trang. */
export function FeatureGate({ k, children }: { k: FeatureKey | FeatureKey[]; children: ReactNode }) {
  const on = useFeatures();
  const keys = Array.isArray(k) ? k : [k];
  if (keys.some(on)) return <>{children}</>;
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col items-center justify-center gap-4 px-gutter text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-ink-muted"><Lock size={24} aria-hidden="true" /></span>
      <h1 className="m-0 text-h2">Tính năng sắp mở</h1>
      <Link to="/tien-ich" className="inline-flex min-h-touch items-center gap-1 text-caption font-medium"><ArrowLeft size={16} aria-hidden="true" />Về Tiện ích</Link>
    </div>
  );
}
