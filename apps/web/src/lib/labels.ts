import { api, ApiError, tokenStore, uploadPhoto } from './api';

export type LabelStatus = 'pending' | 'draft' | 'reviewed' | 'rejected' | 'failed';
export type SegClass = 'trunk' | 'branch' | 'root';

export interface LabelRow {
  id: string;
  status: LabelStatus;
  source: 'upload' | 'job';
  thumb_url: string | null;
  objects: number;
  accepted: number;
  draft_source: 'sam' | 'geometry' | null;
  error: string | null;
}

export interface LabelList {
  counts: Record<LabelStatus, number>;
  eligible_jobs: number;
  items: LabelRow[];
}

export interface LabelObject {
  id: string;
  cls: SegClass;
  accepted: boolean;
  source?: string | null;
}

export interface LabelDetail {
  id: string;
  status: LabelStatus;
  image_url: string;
  width: number;
  height: number;
  objects: LabelObject[];
  draft_source: 'sam' | 'geometry' | null;
  summary_vi: string | null;
  next_id: string | null;
}

const BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

export const labelsApi = {
  list: (status?: LabelStatus) => api<LabelList>(`/admin/labels${status ? `?status=${status}` : ''}`),
  get: (id: string) => api<LabelDetail>(`/admin/labels/${id}`),
  fromJobs: (limit = 50) => api<{ created: number }>('/admin/labels/from-jobs', { method: 'POST', json: { limit } }),
  /** Tải ảnh lên (URL ký sẵn), rồi tạo mục gán nhãn; worker tạo mask nháp. */
  async upload(files: File[], onProgress?: (done: number) => void) {
    const keys: string[] = [];
    for (const f of files) {
      keys.push(await uploadPhoto(f));
      onProgress?.(keys.length);
    }
    return api<{ created: number }>('/admin/labels', { method: 'POST', json: { keys } });
  },
  save: (id: string, body: { status?: 'draft' | 'reviewed' | 'rejected'; objects?: LabelObject[] }) =>
    api<LabelDetail>(`/admin/labels/${id}`, { method: 'PUT', json: body }),
  putMask: (id: string, objId: string, png: Blob, cls?: SegClass) =>
    api<LabelObject>(`/admin/labels/${id}/objects/${objId}/mask${cls ? `?cls=${cls}` : ''}`, {
      method: 'PUT',
      body: png,
      headers: { 'Content-Type': 'image/png' },
    }),
  redraft: (id: string) => api<{ status: string }>(`/admin/labels/${id}/redraft`, { method: 'POST' }),
  /** PNG mask qua api (cùng origin) để vẽ lên canvas rồi xuất lại được. */
  async maskBitmap(id: string, objId: string): Promise<ImageBitmap> {
    const token = tokenStore.get();
    const res = await fetch(`${BASE}/admin/labels/${id}/objects/${objId}/mask`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError(res.status, 'Không tải được mask.');
    return createImageBitmap(await res.blob());
  },
};
