import { api } from './api';

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

export const adminApi = {
  prompts: () => api<PromptRow[]>('/admin/prompts'),
  createPrompt: (body: { step_code: string; system: string | null; user: string; description?: string }) =>
    api<PromptRow>('/admin/prompts', { method: 'POST', json: body }),
  activate: (id: number) => api<PromptRow>(`/admin/prompts/${id}/activate`, { method: 'POST' }),
  costs: (days = 14) => api<Costs>(`/admin/costs?days=${days}`),
  failed: () => api<FailedJob[]>('/admin/jobs/failed'),
};
