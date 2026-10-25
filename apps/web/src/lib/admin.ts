import { ApiError, api } from './api';

export interface PromptRow {
  id: number;
  step_code: string;
  version: string;
  kind: string;
  description: string | null;
  template: { system: string | null; user: string };
  active: boolean;
  created_at: string;
}

export interface Costs {
  days: { day: string; cost_usd: number; jobs: number; paid_jobs: number; failed_jobs: number }[];
  steps: { step_code: string; calls: number; cost_usd: number; avg_latency_ms: number; fail_rate: number }[];
  total_usd: number;
  avg_cost_per_paid_job_usd: number | null;
}

export interface FailedJob {
  id: string;
  status: string;
  error_code: string | null;
  error: string | null;
  created_at: string;
  charged: boolean;
}

export interface FeedbackRow {
  id?: string;
  user_id?: string;
  resolved_at?: string | null;
  admin_note?: string | null;
  job_id: string;
  rating: 1 | -1;
  reason_tags: string[];
  comment: string | null;
  style_key: string | null;
  user_email: string | null;
  created_at: string;
}

export interface SpeciesRefs {
  key: string;
  name_vi: string;
  refs: { key: string; url: string }[];
}

export type CostMode = 'standard' | 'economy';
export type AiSettings = {
  cost_mode: CostMode;
  analysis_mode: 'api' | 'hybrid';
  design_mode: 'api' | 'rules';
  cutout_mode: 'on' | 'off';
  stage_mode: 'ai' | 'derive';
  assist_mode: 'ai' | 'offline';
  cutout_model: string | null;
  seg_model_ready: boolean;
  app_env: string;
};

export const adminApi = {
  settings: () => api<AiSettings>('/admin/settings'),
  saveSettings: (patch: Partial<Omit<AiSettings, 'seg_model_ready' | 'app_env' | 'cutout_model'>>) => api<AiSettings>('/admin/settings', { method: 'PUT', json: patch }),
  prompts: () => api<PromptRow[]>('/admin/prompts'),
  createPrompt: (body: { step_code: string; system: string | null; user: string; description?: string }) =>
    api<PromptRow>('/admin/prompts', { method: 'POST', json: body }),
  activate: (id: number) => api<PromptRow>(`/admin/prompts/${id}/activate`, { method: 'POST' }),
  costs: (days = 14) => api<Costs>(`/admin/costs?days=${days}`),
  failed: () => api<FailedJob[]>('/admin/jobs/failed'),
  feedback: (rating?: 1 | -1, openOnly = false) =>
    api<FeedbackRow[]>(`/admin/feedback?${new URLSearchParams({ ...(rating ? { rating: String(rating) } : {}), ...(openOnly ? { open_only: 'true' } : {}) })}`),
  gift: (email: string, credits: number, batch: string) =>
    api<{ email: string; credited: boolean; credits: number }>('/admin/credits/gift', { method: 'POST', json: { email, credits, batch } }),
  species: () => api<SpeciesRefs[]>('/admin/species'),
  removeRef: (key: string, ref: string) => api<SpeciesRefs>(`/admin/species/${key}/refs`, { method: 'DELETE', json: { key: ref } }),
  async addRef(key: string, file: File): Promise<SpeciesRefs> {
    const p = await api<{ key: string; url: string; headers: Record<string, string> }>(`/admin/species/${key}/refs/presign`, {
      method: 'POST',
      json: { content_type: file.type },
    });
    const res = await fetch(p.url, { method: 'PUT', headers: p.headers, body: file });
    if (!res.ok) throw new ApiError(res.status, 'Tải ảnh lên chưa được.');
    return api<SpeciesRefs>(`/admin/species/${key}/refs`, { method: 'POST', json: { key: p.key } });
  },
};
