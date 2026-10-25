import { api } from './api';
import type { FeatureKey } from './features';

/** Quản trị tính năng + nội dung cộng đồng (apps/api/bonsai_api/routers/features.py, admin_community.py). */

export type FeatureState = 'on' | 'staff' | 'off';
export interface FeatureRow { key: FeatureKey; label_vi: string; group_vi: string; state: FeatureState; usage_30d: number | null }
export interface FeaturesAdmin { items: FeatureRow[]; testers: string[] }
export interface Who { id: string; name: string; email: string | null; locked?: boolean }
export interface ListingAdmin {
  id: string; code: string; title: string; price_vnd: number | null; status: 'active' | 'sold' | 'hidden'; views: number; featured: boolean; seller: Who | null;
  photo_url: string | null; created_at: string; description?: string | null; kind?: string; province?: string | null; species_key?: string | null;
  contact_phone?: string | null; height_cm?: number | null; trunk_cm?: number | null; reports?: number;
}
export interface ProfileAdmin { id: string; slug: string; name: string | null; email: string | null; role: string; bio: string | null; specialties: string[] }
export interface StolenAdmin { tree_id: string; nickname: string | null; passport_code: string | null; stolen_at: string; owner: Who | null }
export interface ConsultAdmin { id: string; question: string; status: 'open' | 'answered' | 'refunded'; credits: number; verdict: string | null; rating: number | null; asker: Who | null; artisan: Who | null; hours_open: number; created_at: string }
export interface ConsultsAdmin { summary: { open: number; overdue_soon: number }; artisans: { artisan: Who | null; answered: number; rating: number | null }[]; items: ConsultAdmin[] }
export interface CareAdmin { id: string; kind: 'care' | 'grow'; status: string; owner: Who | null; nursery: Who | null; start_date: string | null; end_date: string | null; created_at: string }
export interface AssistantLog {
  summary: { total_30d: number; gaps: number; ai_failed: number };
  items: Array<{ id: string; created_at: string; method?: string; gap: boolean; ai_failed: boolean; question?: string; answer?: string; symptoms?: string[]; findings?: string[]; photo_url?: string | null; status?: string }>;
}

export type InboxTone = 'danger' | 'warn' | 'info';
export interface InboxItem { key: string; title: string; tone: InboxTone; to: string; count: number; preview: Array<{ label: string; sub: string; to: string }> }
export interface Inbox { items: InboxItem[]; urgent: number; badges: Record<string, number> }
export interface SearchHit { kind: 'user' | 'job' | 'listing' | 'payment'; label: string; sub: string; to: string }
export type ReportStatus = 'open' | 'actioned' | 'dismissed';
export interface ReportAdmin {
  id: string; kind: 'listing' | 'profile'; kind_vi: string; reason: string; reason_vi: string; note: string | null; status: ReportStatus;
  resolution: string | null; resolved_by: string | null; resolved_at: string | null; created_at: string; reporter: Who | null; owner: Who | null;
  target: { title: string; code: string | null; status: string; price_vnd?: number | null; description: string | null; photo_url: string | null; public_url: string | null; hidden: boolean } | null;
  reports_on_target: number;
}
export interface ReportsAdmin { summary: Record<ReportStatus, number>; items: ReportAdmin[] }
export interface UserRelated {
  admin_note: string | null; public_slug: string | null; province: string | null;
  trees: Array<{ id: string; nickname: string | null; species_key: string | null; passport_code: string | null; stolen: boolean; created_at: string }>;
  listings: Array<{ id: string; code: string; title: string; status: string; price_vnd: number | null; views: number; created_at: string }>;
  consults: Array<{ id: string; question: string; status: string; role: 'asker' | 'artisan'; rating: number | null; created_at: string }>;
  care: Array<{ id: string; kind: string; status: string; role: 'owner' | 'nursery'; created_at: string }>;
  reports_against: Array<{ id: string; kind_vi: string; reason_vi: string; status: ReportStatus; note: string | null; created_at: string }>;
  reports_made: number;
}
export interface CommunityCounts { listings: number; listings_hidden: number; consults: number; care: number; profiles: number; stolen: number }

export const adminCommunityApi = {
  inbox: () => api<Inbox>('/admin/inbox'),
  search: (q: string) => api<SearchHit[]>(`/admin/search?q=${encodeURIComponent(q)}`),
  reports: (status: ReportStatus | 'all') => api<ReportsAdmin>(`/admin/reports?status=${status}`),
  resolveReport: (id: string, action: 'hide' | 'hide_lock' | 'dismiss', note?: string) =>
    api<{ resolved: number }>(`/admin/reports/${id}/resolve`, { method: 'POST', json: { action, note } }),
  resolveFeedback: (id: string, resolved: boolean, note?: string) =>
    api<{ resolved_at: string | null; admin_note: string | null }>(`/admin/feedback/${id}/resolve`, { method: 'POST', json: { resolved, note } }),
  userRelated: (id: string) => api<UserRelated>(`/admin/users/${id}/related`),
  setUserNote: (id: string, note: string) => api<{ admin_note: string | null }>(`/admin/users/${id}/note`, { method: 'PUT', json: { note } }),
  messageUser: (id: string, body: { title: string; body: string; path: string }) => api<void>(`/admin/users/${id}/message`, { method: 'POST', json: body }),
  communityCounts: () => api<CommunityCounts>('/admin/community/counts'),
  clearStolen: (treeId: string) => api<void>(`/admin/stolen-trees/${treeId}/clear`, { method: 'POST' }),
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
