// Client cho bảng điều khiển quản trị (apps/api/bonsai_api/routers/admin_*.py).
import { ApiError, api, tokenStore } from './api';

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

type Params = Record<string, string | number | boolean | null | undefined>;

export function qs(params: Params): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ---------- tổng quan ----------
export interface Kpi { value: number; previous: number }
export interface DayRow { day: string; users: number; jobs_a: number; jobs_paid: number; jobs_failed: number; revenue_vnd: number; ai_cost_vnd: number }
export interface Dashboard {
  days: number;
  usd_vnd_rate: number;
  kpis: Record<
    'users_new' | 'jobs_a' | 'jobs_paid' | 'jobs_done' | 'conversion' | 'fail_rate' | 'revenue_vnd' | 'ai_cost_vnd' | 'gross_margin_vnd' | 'ai_cost_per_paid_vnd' | 'feedback_positive',
    Kpi
  >;
  series: DayRow[];
  funnel: { users: number; analysed: number; chose: number; done: number; shared: number };
  median_phase_a_s: number | null;
  median_phase_b_s: number | null;
}

// ---------- phiên ----------
export type JobStatus =
  | 'queued' | 'analyzing' | 'designing' | 'awaiting_choice' | 'rendering_final' | 'judging' | 'rendering_stages' | 'writing_guide' | 'done' | 'failed';
export interface JobRow {
  id: string;
  created_at: string;
  status: JobStatus;
  error_code: string | null;
  user_id: string;
  user_email: string | null;
  tree_nickname: string | null;
  species_key: string | null;
  style_key: string | null;
  paid: boolean;
  cost_usd: number;
  cost_mode: string | null;
  prompt_version: string | null;
  duration_s: number | null;
  stuck: boolean;
}
export interface StepRow {
  id: number; step_code: string; provider: string; model: string; prompt_version: string | null;
  tokens_in: number; tokens_out: number; images_out: number; cost_usd: number; latency_ms: number;
  ok: boolean; error: string | null; output: Record<string, unknown> | null; created_at: string;
}
export interface RenderRow {
  id: string; stage_code: string; attempt: number; url: string; model: string; selected: boolean;
  total_score: number | null; cv_checks: Record<string, unknown> | null; judge: Record<string, unknown> | null; created_at: string;
}
export interface JobDetail {
  job: JobRow;
  inputs: Record<string, unknown> | null;
  progress: Record<string, unknown>;
  analysis: Record<string, unknown> | null;
  targets: Record<string, unknown> | null;
  report: Record<string, unknown> | null;
  error: string | null;
  charge_ref: string | null;
  share_code: string | null;
  photos: { id: string; url: string; is_front: boolean; width: number | null; height: number | null }[];
  cutout: { image_url: string; sketch_url: string; box: number[] | null } | null;
  options: { id: string; rank: number; style_key: string; suitability: number; chosen: boolean; sketch_svg_url: string | null; design: Record<string, unknown>; counts: Record<string, unknown> | null }[];
  renders: RenderRow[];
  stages: { code: string; time_from_start: string | null; plan: Record<string, unknown> | null; guide_vi: Record<string, unknown> | null; image_id: string | null }[];
  steps: StepRow[];
  feedback: { rating: number; reason_tags: string[]; comment: string | null; created_at: string }[];
  ledger: { delta: number; reason: string; ref_id: string | null; created_at: string }[];
  can_retry: 'phase_a' | 'phase_b' | null;
  can_refund: boolean;
}

// ---------- người dùng ----------
export type Role = 'player' | 'nursery' | 'admin';
export interface UserRow {
  id: string; email: string | null; name: string | null; phone: string | null; garden_name: string | null;
  auth_provider: string; role: Role; credits: number; consent_training: boolean; deleted: boolean; created_at: string;
  trees: number; jobs: number; paid_jobs: number; revenue_vnd: number; last_active_at: string | null;
}
export interface AuditRow { id: number; admin_email: string | null; action: string; target_type?: string | null; target_id?: string | null; detail: Record<string, unknown> | null; created_at: string }
export interface UserDetail {
  user: UserRow;
  consent_at: string | null;
  deleted_at: string | null;
  notify_zalo: boolean;
  push_devices: number;
  ai_cost_usd: number;
  ledger: { id: number; delta: number; reason: string; ref_id: string | null; created_at: string }[];
  ledger_balance: number;
  payments: { id: string; package_code: string; amount_vnd: number; status: PaymentStatus; transfer_code: string; created_at: string; paid_at: string | null }[];
  jobs: { id: string; created_at: string; status: JobStatus; tree_nickname: string | null; paid: boolean; cost_usd: number }[];
  audit: AuditRow[];
}

// ---------- thanh toán ----------
export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'cancelled';
export interface PaymentRow {
  id: string; created_at: string; paid_at: string | null; user_id: string; user_email: string | null;
  package_code: string; package_name: string; credits: number; amount_vnd: number; transfer_code: string;
  status: PaymentStatus; provider: string | null; provider_txn_id: string | null; underpaid_vnd: number | null;
}
export interface PaymentPage extends Page<PaymentRow> {
  revenue_vnd: number;
  by_package: { package_code: string; package_name: string; orders: number; revenue_vnd: number }[];
  pending: number;
}

// ---------- hệ thống ----------
export interface SystemInfo {
  checked_at: string;
  redis_ok: boolean;
  queues: Record<string, number>;
  workers: string[];
  worker_info: {
    host: string; reported_at: string; seg_model: boolean; sam: boolean;
    llm: { provider: string; model: string; economy_model: string | null; fallback: string | null; effort: string };
    image: { provider: string; model: string; fallback: string | null };
    keys: Record<string, boolean>;
  } | null;
  monitoring: { at: string; alerts: Record<string, string>; queue: number } | null;
  active_jobs: Record<string, number>;
  stuck_jobs: number;
  jobs_24h: number;
  failed_24h: number;
  top_errors_24h: { error_code: string; count: number }[];
  slow_steps_24h: { step_code: string; calls: number; avg_ms: number; p95_ms: number; fail_rate: number }[];
  config: {
    app_env: string; modes: Record<string, string>; usd_vnd_rate: number;
    packages: { code: string; name: string; credits: number; price_vnd: number }[];
    bank_configured: boolean; webhooks: Record<string, boolean>; login: Record<string, boolean>; sentry: boolean;
  };
}

// ---------- danh mục, prompt ----------
export interface CatalogSpecies { key: string; name_vi: string; growth_speed: 'slow' | 'medium' | 'fast'; prompt_desc_en: string; refs: number; trees: number; admin_edited_at: string | null }
export interface CatalogStyle { key: string; name_vi: string; name_jp: string | null; prompt_desc_en: string; chosen: number; admin_edited_at: string | null }
export interface Catalog { species: CatalogSpecies[]; styles: CatalogStyle[] }
export interface PromptStat { prompt_version: string; calls: number; fail_rate: number; avg_cost_usd: number; avg_latency_ms: number; avg_tokens_out: number; first_used: string; last_used: string }

// ---------- vận hành ----------
export interface Ops {
  trial_credits: number;
  phase_a_daily_limit: number;
  usd_vnd_rate: number;
  pause_analysis: boolean;
  pause_render: boolean;
  pause_message: string;
  announcement: { active: boolean; text: string; tone: 'info' | 'success' | 'warn' };
}
export interface PackageAdmin {
  code: string; name_vi: string; credits: number; amount_vnd: number; note_vi: string; popular: boolean; nursery: boolean;
  active: boolean; sold_30d: number;
}
export interface GiftCodeRow {
  code: string; credits: number; max_uses: number | null; used: number; expires_at: string | null; active: boolean;
  note: string | null; created_by: string | null; created_at: string; status: 'active' | 'expired' | 'used_up' | 'disabled';
}
export interface SegmentRow { key: string; label: string; recipients: number }

const BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

/** Tải file Excel quản trị (cần header đăng nhập → fetch rồi lưu blob). */
export async function downloadExport(kind: 'jobs' | 'users' | 'payments', params: Params): Promise<void> {
  const token = tokenStore.get();
  const res = await fetch(`${BASE}/admin/export/${kind}.xlsx${qs(params)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'Chưa xuất được file, thử lại sau.');
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `bonsai-${kind}.xlsx`;
  const href = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export const consoleApi = {
  dashboard: (days: number) => api<Dashboard>(`/admin/dashboard${qs({ days })}`),

  jobs: (p: Params) => api<Page<JobRow>>(`/admin/jobs${qs(p)}`),
  job: (id: string) => api<JobDetail>(`/admin/jobs/${id}`),
  jobAction: (id: string, action: 'retry' | 'refund' | 'fail', note?: string) =>
    api<JobDetail>(`/admin/jobs/${id}/${action}`, { method: 'POST', json: { note: note || null } }),

  users: (p: Params) => api<Page<UserRow>>(`/admin/users${qs(p)}`),
  user: (id: string) => api<UserDetail>(`/admin/users/${id}`),
  setRole: (id: string, role: Role) => api<UserDetail>(`/admin/users/${id}/role`, { method: 'PUT', json: { role } }),
  adjustCredits: (id: string, delta: number, note: string) => api<UserDetail>(`/admin/users/${id}/credits`, { method: 'POST', json: { delta, note } }),
  lock: (id: string, locked: boolean, note?: string) => api<UserDetail>(`/admin/users/${id}/lock`, { method: 'PUT', json: { locked, note: note || null } }),
  bulkGift: (emails: string[], credits: number, batch: string) =>
    api<{ credited: string[]; already: string[]; not_found: string[] }>('/admin/users/gift', { method: 'POST', json: { emails, credits, batch } }),

  payments: (p: Params) => api<PaymentPage>(`/admin/payments${qs(p)}`),
  payment: (id: string) => api<{ payment: PaymentRow; raw: Record<string, unknown> | null }>(`/admin/payments/${id}`),
  confirmPayment: (id: string, bank_ref: string, note?: string) =>
    api<{ payment: PaymentRow; raw: Record<string, unknown> | null }>(`/admin/payments/${id}/confirm`, { method: 'POST', json: { bank_ref, note: note || null } }),
  cancelPayment: (id: string, note?: string) =>
    api<{ payment: PaymentRow; raw: Record<string, unknown> | null }>(`/admin/payments/${id}/cancel`, { method: 'POST', json: { note: note || null } }),

  system: () => api<SystemInfo>('/admin/system'),
  audit: (p: Params) => api<Page<AuditRow>>(`/admin/audit${qs(p)}`),

  catalog: () => api<Catalog>('/admin/catalog'),
  saveSpecies: (key: string, body: Pick<CatalogSpecies, 'name_vi' | 'growth_speed' | 'prompt_desc_en'>) =>
    api<Catalog>(`/admin/catalog/species/${key}`, { method: 'PUT', json: body }),
  saveStyle: (key: string, body: Pick<CatalogStyle, 'name_vi' | 'name_jp' | 'prompt_desc_en'>) =>
    api<Catalog>(`/admin/catalog/styles/${key}`, { method: 'PUT', json: body }),
  promptStats: (days = 90) => api<PromptStat[]>(`/admin/prompts/stats${qs({ days })}`),

  ops: () => api<Ops>('/admin/ops'),
  saveOps: (patch: Partial<Ops>) => api<Ops>('/admin/ops', { method: 'PUT', json: patch }),
  packages: () => api<PackageAdmin[]>('/admin/packages'),
  savePackage: (code: string, patch: Partial<Pick<PackageAdmin, 'name_vi' | 'credits' | 'amount_vnd' | 'note_vi' | 'popular' | 'active'>>) =>
    api<PackageAdmin[]>(`/admin/packages/${code}`, { method: 'PUT', json: patch }),
  giftCodes: () => api<GiftCodeRow[]>('/admin/gift-codes'),
  createGiftCode: (body: { code?: string; credits: number; max_uses?: number | null; expires_at?: string | null; note?: string }) =>
    api<GiftCodeRow>('/admin/gift-codes', { method: 'POST', json: body }),
  updateGiftCode: (code: string, patch: { active?: boolean }) => api<GiftCodeRow>(`/admin/gift-codes/${code}`, { method: 'PUT', json: patch }),
  redemptions: (code: string) => api<{ user_id: string; email: string | null; at: string }[]>(`/admin/gift-codes/${code}/redemptions`),
  segments: () => api<SegmentRow[]>('/admin/broadcast/segments'),
  broadcast: (body: { segment: string; title: string; body: string; path: string }) =>
    api<{ recipients: number }>('/admin/broadcast', { method: 'POST', json: body }),
};
