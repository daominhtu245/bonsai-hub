import { ApiError, api } from './api';
import { watchSse } from './sse';

export type JobStatus =
  | 'queued' | 'analyzing' | 'designing' | 'awaiting_choice' | 'rendering_final'
  | 'judging' | 'rendering_stages' | 'writing_guide' | 'done' | 'failed';

export interface StepState {
  state: 'running' | 'done';
  [k: string]: unknown;
}

export interface JobProgress {
  steps?: Partial<Record<string, StepState>>;
}

export interface DesignOptionView {
  id: string;
  rank: number;
  style_key: string;
  name_vi: string;
  name_jp: string | null;
  suitability: number;
  why_vi: string;
  care_steps_vi: string[];
  remove_reasons_vi: string[];
  new_branch_notes_vi: string[];
  counts: { cut?: number; keep?: number; new?: number; chop_apex?: boolean };
  sketch_svg_url: string | null;
}

export interface Job {
  id: string;
  tree_id: string;
  tree_nickname: string | null;
  status: JobStatus;
  error_code: string | null;
  progress: JobProgress;
  created_at: string;
  front_photo: { id: string; url: string; width: number | null; height: number | null } | null;
  photos?: { id: string; url: string; is_front: boolean }[];
  can_retry?: boolean;
  analysis: {
    usable: boolean;
    issues: string[];
    species_key: string | null;
    species_confidence: number | null;
    summary_vi: string;
    branch_count: number;
    height_cm: number | null;
    base_diameter_cm: number | null;
    lower_apex_cm: number | null;
  } | null;
  options: DesignOptionView[];
  chosen_option_id: string | null;
  result: { final_url: string; years: number | null; low_confidence: boolean; chosen_style_vi: string | null } | null;
  credits_left: number;
}

export interface JobEvent {
  status: JobStatus;
  progress: JobProgress;
  error_code: string | null;
}

export interface Species {
  key: string;
  name_vi: string;
  growth_speed: string;
}

export interface TreeCreate {
  nickname?: string;
  species_key?: string;
  real_height_cm?: number;
  photos: { key: string; view_index: number; is_front: boolean }[];
}

export type Region = 'north' | 'central' | 'south';

export const TERMINAL: JobStatus[] = ['awaiting_choice', 'done', 'failed'];

export const jobsApi = {
  species: () => api<Species[]>('/species'),
  createTree: (body: TreeCreate) => api<{ id: string }>('/trees', { method: 'POST', json: body }),
  createJob: (treeId: string, body: { style?: string; goal?: string; region?: Region; front_photo_id?: string } = {}) =>
    api<Job>(`/trees/${treeId}/jobs`, { method: 'POST', json: body }),
  get: (id: string) => api<Job>(`/jobs/${id}`),
  choose: (id: string, optionId: string) => api<Job>(`/jobs/${id}/choose`, { method: 'POST', json: { option_id: optionId } }),
};

/** Theo dõi tiến độ job qua SSE; dừng ở trạng thái kết thúc. */
export function watchJob(id: string, onEvent: (e: JobEvent) => void, onError: (e: ApiError) => void): () => void {
  return watchSse<JobEvent>(`/jobs/${id}/events`, 'job', onEvent, (e) => TERMINAL.includes(e.status), onError);
}

export interface StageView {
  code: 'S0' | 'S1' | 'S2' | 'S3' | 'S4';
  short_vi: string;
  name_vi: string;
  time_from_start: string | null;
  image_url: string | null;
  fallback_sketch: boolean;
  guide: {
    title_vi: string;
    see_vi: string;
    actions_vi: string[];
    best_time_vi: string;
    care_vi: string[];
    ready_signs_vi: string[];
    common_mistakes_vi: string[];
  } | null;
  done_tasks: number[];
}

export interface ResultView {
  job_id: string;
  tree_id: string;
  tree_nickname: string | null;
  style_vi: string | null;
  style_jp: string | null;
  low_confidence: boolean;
  years: number | null;
  front_photo: { id: string; url: string; width: number | null; height: number | null } | null;
  sketch_svg_url: string | null;
  stages: StageView[];
  report: {
    material_review_vi?: string;
    style_reason_vi?: string;
    roadmap_vi?: Record<string, string[]>;
    species_care_vi?: string[];
  } | null;
  disclaimer_vi: string;
  my_rating: 1 | -1 | null;
}

export const resultApi = {
  get: (id: string) => api<ResultView>(`/jobs/${id}/result`),
  toggleTask: (id: string, stage_code: string, task_index: number, done: boolean) =>
    api<void>(`/jobs/${id}/tasks`, { method: 'PUT', json: { stage_code, task_index, done } }),
  feedback: (id: string, rating: 1 | -1) => api<void>(`/jobs/${id}/feedback`, { method: 'POST', json: { rating } }),
};
