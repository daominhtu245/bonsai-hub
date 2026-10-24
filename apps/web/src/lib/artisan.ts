import { api } from './api';

/** Khu nghệ nhân: bộ luật có phiên bản + chấm ảnh / thiết kế (apps/api/bonsai_api/routers/artisan.py). */

export type RuleDocKey = 'rule_set' | 'styles_vn' | 'species' | 'judging';

export interface RuleVersion {
  version: number;
  note: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  activated_by: string | null;
  activated_at: string | null;
}

export interface RuleSummary {
  doc: RuleDocKey;
  title_vi: string;
  active_version: number | null;
  versions: number;
  updated_at: string | null;
  updated_by: string | null;
}

export interface RuleDocDetail {
  doc: RuleDocKey;
  title_vi: string;
  active: RuleVersion | null;
  content: Record<string, unknown>;
  versions: RuleVersion[];
}

export interface Criterion {
  weight: number;
  check?: string[];
}

export interface JudgingSheet {
  version: number | null;
  criteria: Record<string, Criterion>;
  fidelity_hard_fail: string[];
  pass_score: number;
  presentation_faults: string[];
}

export type ReviewKind = 'image' | 'design';

export interface ReviewItem {
  kind: ReviewKind;
  job_id: string;
  render_id: string | null;
  option_id: string | null;
  photo_url: string;
  photo_size: [number, number] | null;
  result_url: string | null;
  collage_url: string | null;
  sketch_svg_url: string | null;
  style_vi: string | null;
  species_vi: string | null;
  years: number | null;
  why_vi: string | null;
  counts: Record<string, number | boolean>;
  remaining: number;
}

export interface ReviewOut {
  id: number;
  kind: ReviewKind;
  job_id: string;
  total: number | null;
  passed: boolean;
  hard_fails: string[];
  scores: Record<string, number>;
  comment: string | null;
  created_at: string;
  ai_total: number | null;
  ai_hard_fail: string[] | null;
  ai_summary: string | null;
}

export interface ReviewIn {
  kind: ReviewKind;
  render_id?: string | null;
  option_id?: string | null;
  scores: Record<string, number>;
  hard_fails: string[];
  passed: boolean;
  comment?: string;
}

export interface KindStats {
  count: number;
  targets: number;
  pass_rate: number | null;
  avg_total: number | null;
  by_criterion: Record<string, { avg: number | null; n: number }>;
  hard_fails: Array<[string, number]>;
  ai_agreement?: { pairs: number; same_verdict: number | null; mean_abs_diff: number | null };
}

export interface ArtisanStats {
  image: KindStats;
  design: KindStats;
  reviewers: { name: string; count: number }[];
}

export const artisanApi = {
  rules: () => api<RuleSummary[]>('/artisan/rules'),
  rule: (doc: RuleDocKey) => api<RuleDocDetail>(`/artisan/rules/${doc}`),
  ruleVersion: (doc: RuleDocKey, v: number) => api<RuleVersion & { content: Record<string, unknown> }>(`/artisan/rules/${doc}/versions/${v}`),
  validate: (doc: RuleDocKey, content: unknown) => api<{ errors: string[] }>(`/artisan/rules/${doc}/validate`, { method: 'POST', json: { content } }),
  saveRule: (doc: RuleDocKey, content: unknown, note: string, activate: boolean) =>
    api<RuleDocDetail>(`/artisan/rules/${doc}`, { method: 'POST', json: { content, note, activate } }),
  activate: (doc: RuleDocKey, v: number) => api<RuleDocDetail>(`/artisan/rules/${doc}/versions/${v}/activate`, { method: 'POST' }),
  judging: () => api<JudgingSheet>('/artisan/judging'),
  next: (kind: ReviewKind, skip: string[] = []) =>
    api<ReviewItem | null>(`/artisan/reviews/next?kind=${kind}${skip.map((s) => `&skip=${s}`).join('')}`),
  review: (body: ReviewIn) => api<ReviewOut>('/artisan/reviews', { method: 'POST', json: body }),
  mine: () => api<ReviewOut[]>('/artisan/reviews'),
  stats: () => api<ArtisanStats>('/artisan/stats'),
};
