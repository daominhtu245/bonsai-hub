import { api } from './api';

/** Chợ phôi / cây, chậu đối tác, chỉ số giá (apps/api/bonsai_api/routers/market.py). Không giữ tiền: liên hệ trực tiếp. */

export type ListingKind = 'phoi' | 'cay' | 'nuoi_ho';
export type ListingStatus = 'active' | 'sold' | 'hidden';
export const KIND_VI: Record<ListingKind, string> = { phoi: 'Phôi', cay: 'Cây thành phẩm', nuoi_ho: 'Bán kèm nuôi hộ' };

export interface Listing {
  id: string; code: string; url: string; title: string; description: string | null; species_key: string | null; species_vi: string | null;
  kind: ListingKind; price_vnd: number | null; height_cm: number | null; trunk_cm: number | null; province: string | null; province_vi: string | null;
  contact_phone: string | null; status: ListingStatus; featured: boolean; photo_url: string | null; views: number; seller: string;
  seller_slug: string | null; created_at: string; job_id?: string | null; tree_id?: string | null;
  previews?: { kind: 'render' | 'sketch'; style_vi: string | null; url: string }[];
}
export interface MyListings { plan_until: string | null; free_active: number; featured_max: number; items: Listing[] }
export interface ListingInput {
  title: string; description?: string; species_key?: string; kind: ListingKind; price_vnd?: number; height_cm?: number; trunk_cm?: number;
  province?: string; contact_phone?: string; tree_id?: string; job_id?: string; photo_key?: string;
}
export interface PriceRow { species_key: string; species_vi: string; region: 'north' | 'central' | 'south' | null; samples: number; per_cm_low: number; per_cm_median: number; per_cm_high: number }
export interface PartnerPot { id: number; name: string; maker: string | null; shape: string; color: string | null; length_cm: number | null; price_vnd: number | null; url: string | null; image_url: string | null; active: boolean }
export type PotInput = Omit<PartnerPot, 'id'>;

const BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';
const qs = (o: Record<string, string | number | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join('&')}` : '';
};

export const marketApi = {
  browse: (f: { species?: string; province?: string; kind?: ListingKind; q?: string; offset?: number } = {}) => api<Listing[]>(`/public/listings${qs(f)}`),
  get: (code: string) => api<Listing>(`/public/listings/${code}`),
  qrUrl: (code: string) => `${BASE}/public/listings/${code}/qr.svg`,
  mine: () => api<MyListings>('/me/listings'),
  create: (body: ListingInput) => api<Listing>('/listings', { method: 'POST', json: body }),
  patch: (id: string, body: Partial<{ title: string; description: string; price_vnd: number; status: ListingStatus; featured: boolean; contact_phone: string }>) =>
    api<Listing>(`/listings/${id}`, { method: 'PATCH', json: body }),
  remove: (id: string) => api<void>(`/listings/${id}`, { method: 'DELETE' }),
  priceIndex: (species?: string) => api<PriceRow[]>(`/public/price-index${qs({ species })}`),
  pots: (jobId: string) => api<PartnerPot[]>(`/jobs/${jobId}/pots`),
  adminPots: () => api<PartnerPot[]>('/admin/partner-pots'),
  createPot: (body: PotInput) => api<PartnerPot>('/admin/partner-pots', { method: 'POST', json: body }),
  updatePot: (id: number, body: PotInput) => api<PartnerPot>(`/admin/partner-pots/${id}`, { method: 'PUT', json: body }),
  deletePot: (id: number) => api<void>(`/admin/partner-pots/${id}`, { method: 'DELETE' }),
};

export const vnd = (n: number | null | undefined) => (n == null ? 'Liên hệ' : `${n.toLocaleString('vi-VN')} đ`);
/** Link Zalo theo số điện thoại (zalo.me/0909…). */
export const zaloUrl = (phone: string) => `https://zalo.me/${phone.replace(/[^\d]/g, '')}`;
