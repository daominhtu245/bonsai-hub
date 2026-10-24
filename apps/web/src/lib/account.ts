import { ApiError, api, type User } from './api';
import { watchSse } from './sse';

export interface GardenTree {
  tree_id: string;
  nickname: string | null;
  species_key: string | null;
  thumbnail_url: string | null;
  job_id: string | null;
  job_status: string | null;
  style_vi: string | null;
  stage_code: string | null;
  stage_name_vi: string | null;
  stages_done: number;
  next_task_vi: string | null;
}

export interface Package {
  code: string;
  name_vi: string;
  credits: number;
  amount_vnd: number;
  note_vi: string;
  popular: boolean;
  nursery: boolean;
}

export interface Payment {
  id: string;
  package_code: string;
  amount_vnd: number;
  transfer_code: string;
  transfer_code_display: string;
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
  qr_url: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_account_name: string | null;
  credits_left: number;
}

export interface Share {
  code: string;
  url: string;
  images: Record<'9x16' | '1x1', string>;
  can_brand: boolean;
}

export const vnd = (n: number) => `${n.toLocaleString('vi-VN')} đ`;

export interface CreditRow {
  at: string;
  delta: number;
  label: string;
  job_id: string | null;
}

export interface ProgressPhoto {
  id: string;
  url: string | null;
  taken_at: string;
  ready: boolean;
  reward?: number;
}

export interface Announcement {
  text: string;
  tone: 'info' | 'success' | 'warn';
}

export const accountApi = {
  garden: () => api<{ trees: GardenTree[]; credits: number }>('/garden'),
  deleteTree: (treeId: string) => api<void>(`/trees/${treeId}`, { method: 'DELETE' }),
  share: (jobId: string, branded: boolean) => api<Share>(`/jobs/${jobId}/share`, { method: 'POST', json: { branded } }),
  packages: () => api<Package[]>('/packages'),
  createPayment: (package_code: string) => api<Payment>('/payments', { method: 'POST', json: { package_code } }),
  payment: (id: string) => api<Payment>(`/payments/${id}`),
  payments: () => api<Payment[]>('/payments'),
  updateProfile: (body: { name?: string | null; garden_name?: string | null; phone?: string | null; consent_training?: boolean; notify_zalo?: boolean;
    birth_year?: number | null; province?: string | null; bio?: string | null; public_slug?: string | null; specialties?: string[] }) =>
    api<User>('/me', { method: 'PATCH', json: body }),
  deleteAccount: () => api<void>('/me', { method: 'DELETE', json: { confirm: true } }),
  redeemCode: (code: string) => api<{ credits_added: number; credits: number }>('/me/gift-code', { method: 'POST', json: { code } }),
  credits: () => api<CreditRow[]>('/me/credits'),
  announcement: () => api<Announcement | null>('/announcement'),
  exportLinks: (jobId: string) => api<{ xlsx_url: string; ics_url: string }>(`/jobs/${jobId}/exports`, { method: 'POST' }),
  progress: (treeId: string) => api<ProgressPhoto[]>(`/trees/${treeId}/progress`),
  addProgress: (treeId: string, key: string) => api<ProgressPhoto>(`/trees/${treeId}/progress`, { method: 'POST', json: { key } }),
  deleteProgress: (treeId: string, photoId: string) => api<void>(`/trees/${treeId}/progress/${photoId}`, { method: 'DELETE' }),
};

export function watchPayment(id: string, onStatus: (s: Payment['status']) => void, onError: (e: ApiError) => void) {
  return watchSse<{ status: Payment['status'] }>(`/payments/${id}/events`, 'payment', (e) => onStatus(e.status), (e) => e.status !== 'pending', onError);
}

/** Tải ảnh (URL ký sẵn, khác origin) về máy: fetch → blob → <a download>. */
export async function downloadImage(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new ApiError(res.status, 'Không tải được ảnh, bạn thử lại nhé.');
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
