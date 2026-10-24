import { api } from './api';
import type { FeatureKey } from './features';

/** Quản trị tính năng + nội dung cộng đồng (apps/api/bonsai_api/routers/features.py, admin_community.py). */

export type FeatureState = 'on' | 'staff' | 'off';
export interface FeatureRow { key: FeatureKey; label_vi: string; group_vi: string; state: FeatureState; usage_30d: number | null }
export interface FeaturesAdmin { items: FeatureRow[]; testers: string[] }
export interface Who { id: string; name: string; email: string | null }
export interface ListingAdmin { id: string; code: string; title: string; price_vnd: number | null; status: 'active' | 'sold' | 'hidden'; views: number; featured: boolean; seller: Who | null; photo_url: string | null; created_at: string }
export interface ProfileAdmin { id: string; slug: string; name: string | null; email: string | null; role: string; bio: string | null; specialties: string[] }
export interface StolenAdmin { tree_id: string; nickname: string | null; passport_code: string | null; stolen_at: string; owner: Who | null }
export interface ConsultAdmin { id: string; question: string; status: 'open' | 'answered' | 'refunded'; credits: number; verdict: string | null; rating: number | null; asker: Who | null; artisan: Who | null; hours_open: number; created_at: string }
export interface ConsultsAdmin { summary: { open: number; overdue_soon: number }; artisans: { artisan: Who | null; answered: number; rating: number | null }[]; items: ConsultAdmin[] }
export interface CareAdmin { id: string; kind: 'care' | 'grow'; status: string; owner: Who | null; nursery: Who | null; start_date: string | null; end_date: string | null; created_at: string }
export interface AssistantLog {
  summary: { total_30d: number; gaps: number; ai_failed: number };
  items: Array<{ id: string; created_at: string; method?: string; gap: boolean; ai_failed: boolean; question?: string; answer?: string; symptoms?: string[]; findings?: string[]; photo_url?: string | null; status?: string }>;
}

export const adminCommunityApi = {
  features: () => api<FeaturesAdmin>('/admin/features'),
  saveFeatures: (body: { flags?: Partial<Record<FeatureKey, FeatureState>>; testers?: string[] }) => api<FeaturesAdmin>('/admin/features', { method: 'PUT', json: body }),
  listings: (status?: string, q?: string) => api<ListingAdmin[]>(`/admin/listings?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) })}`),
  moderateListing: (id: string, status: 'active' | 'hidden', reason?: string) => api<{ status: string }>(`/admin/listings/${id}/moderate`, { method: 'POST', json: { status, reason } }),
  profiles: () => api<ProfileAdmin[]>('/admin/public-profiles'),
  hideProfile: (userId: string, reason?: string) => api<void>(`/admin/public-profiles/${userId}/hide`, { method: 'POST', json: { reason } }),
  stolen: () => api<StolenAdmin[]>('/admin/stolen-trees'),
  consults: (status?: string) => api<ConsultsAdmin>(`/admin/consults${status ? `?status=${status}` : ''}`),
  consultAction: (id: string, action: 'refund' | 'release', reason?: string) => api<{ status: string }>(`/admin/consults/${id}/action`, { method: 'POST', json: { action, reason } }),
  care: () => api<CareAdmin[]>('/admin/care-requests'),
  assistant: (kind: 'questions' | 'health', onlyGaps: boolean) => api<AssistantLog>(`/admin/assistant?kind=${kind}&only_gaps=${onlyGaps}`),
};
