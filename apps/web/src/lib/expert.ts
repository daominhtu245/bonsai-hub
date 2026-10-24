import { api } from './api';

/** Hỏi nghệ nhân, trang công khai, chăm hộ / nuôi hộ (apps/api/bonsai_api/routers/expert.py, care.py). */

export type Verdict = 'ok' | 'fix' | 'rethink';
export const VERDICT_VI: Record<Verdict, string> = { ok: 'Thiết kế ổn', fix: 'Cần sửa vài chỗ', rethink: 'Nên chọn hướng khác' };
export interface Consult {
  id: string; job_id: string; question: string; answer: string | null; verdict: Verdict | null; verdict_vi: string | null;
  status: 'open' | 'answered' | 'refunded'; credits: number; rating: number | null; artisan: string | null; artisan_slug: string | null;
  created_at: string; answered_at: string | null; photo_url?: string | null; sketch_url?: string | null; style_vi?: string | null; design_notes?: string | null;
}
export interface Person {
  slug: string; name: string; role: 'nursery' | 'artisan' | 'admin' | 'player'; bio: string | null; specialties: string[]; province?: string | null; province_vi: string | null;
  answered: number; rating: number | null; contact_phone?: string | null; challenge_votes?: number;
  listings?: { code: string; title: string; price_vnd: number | null; photo_url: string | null }[];
}
export type NurseryRow = Omit<Person, 'listings'> & { listings: number };
export type CareKind = 'care' | 'grow';
export type CareStatus = 'requested' | 'active' | 'done' | 'declined';
export interface CareRequest {
  id: string; kind: CareKind; kind_vi: string; status: CareStatus; status_vi: string; tree_id: string; tree_name: string; job_id: string | null;
  start_date: string | null; end_date: string | null; note: string | null; owner: string; nursery: string; nursery_slug: string | null;
  role: 'owner' | 'nursery'; contact_phone: string | null; created_at: string;
  updates?: { id: number; note: string | null; at: string; photo_url: string | null }[];
}

export const expertApi = {
  price: () => api<{ credits: number; answer_within_hours: number }>('/consults/price'),
  ask: (jobId: string, body: { question: string; option_id?: string; artisan_slug?: string }) => api<Consult>(`/jobs/${jobId}/consults`, { method: 'POST', json: body }),
  mine: () => api<Consult[]>('/me/consults'),
  get: (id: string) => api<Consult>(`/consults/${id}`),
  rate: (id: string, rating: number) => api<void>(`/consults/${id}/rate`, { method: 'POST', json: { rating } }),
  queue: (state: 'open' | 'mine' | 'answered') => api<Consult[]>(`/artisan/consults?state=${state}`),
  claim: (id: string) => api<Consult>(`/artisan/consults/${id}/claim`, { method: 'POST' }),
  answer: (id: string, body: { answer: string; verdict: Verdict }) => api<Consult>(`/artisan/consults/${id}/answer`, { method: 'POST', json: body }),
  artisans: () => api<Person[]>('/public/artisans'),
  nurseries: (province?: string) => api<NurseryRow[]>(`/public/nurseries${province ? `?province=${province}` : ''}`),
  person: (slug: string) => api<Person>(`/public/people/${slug}`),
  careList: () => api<CareRequest[]>('/care-requests'),
  care: (id: string) => api<CareRequest>(`/care-requests/${id}`),
  createCare: (body: { kind: CareKind; nursery_slug: string; tree_id: string; job_id?: string; start_date?: string; end_date?: string; note?: string }) =>
    api<CareRequest>('/care-requests', { method: 'POST', json: body }),
  careAction: (id: string, action: 'accept' | 'decline' | 'done' | 'cancel') => api<CareRequest>(`/care-requests/${id}/action`, { method: 'POST', json: { action } }),
  careUpdate: (id: string, body: { note?: string; photo_key?: string }) => api<{ id: number }>(`/care-requests/${id}/updates`, { method: 'POST', json: body }),
};
