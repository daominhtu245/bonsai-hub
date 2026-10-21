import { ApiError, api, tokenStore } from './api';

export type JobStatus =
  | 'queued' | 'analyzing' | 'designing' | 'awaiting_choice' | 'rendering_final'
  | 'judging' | 'rendering_stages' | 'writing_guide' | 'done' | 'failed';

export interface StepState {
  state: 'running' | 'done';
  [k: string]: unknown;
}

export interface JobProgress {
  steps?: Partial<Record<'species' | 'trunk' | 'branches' | 'front' | 'design' | 'render' | 'judge' | 'repair', StepState>>;
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

export const PHASE_A_DONE: JobStatus[] = ['awaiting_choice', 'failed'];
export const TERMINAL: JobStatus[] = ['awaiting_choice', 'done', 'failed'];

export const jobsApi = {
  species: () => api<Species[]>('/species'),
  createTree: (body: TreeCreate) => api<{ id: string }>('/trees', { method: 'POST', json: body }),
  createJob: (treeId: string, body: { style?: string; goal?: string } = {}) =>
    api<Job>(`/trees/${treeId}/jobs`, { method: 'POST', json: body }),
  get: (id: string) => api<Job>(`/jobs/${id}`),
  choose: (id: string, optionId: string) => api<Job>(`/jobs/${id}/choose`, { method: 'POST', json: { option_id: optionId } }),
};

function parseBlock(block: string): { event: string; data: string } | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  return data.length ? { event, data: data.join('\n') } : null;
}

/**
 * Theo dõi tiến độ job qua SSE (fetch để gửi được header Authorization).
 * Tự kết nối lại khi rớt mạng; dừng khi tới trạng thái kết thúc hoặc khi gọi hàm trả về.
 */
export function watchJob(id: string, onEvent: (e: JobEvent) => void, onError: (e: ApiError) => void): () => void {
  const ctrl = new AbortController();
  let failures = 0;
  const base = import.meta.env.VITE_API_BASE ?? '/api/v1';

  const run = async () => {
    while (!ctrl.signal.aborted) {
      let ended = false;
      try {
        const token = tokenStore.get();
        const res = await fetch(`${base}/jobs/${id}/events`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new ApiError(res.status, 'Mất kết nối với máy chủ.');
        failures = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const block = parseBlock(buf.slice(0, idx));
            buf = buf.slice(idx + 2);
            if (block?.event === 'job') {
              const ev = JSON.parse(block.data) as JobEvent;
              onEvent(ev);
              if (TERMINAL.includes(ev.status)) ended = true;
            }
          }
        }
      } catch (e) {
        if (ctrl.signal.aborted) return;
        failures++;
        if (e instanceof ApiError && (e.status === 401 || e.status === 404)) {
          onError(e);
          return;
        }
        if (failures >= 5) {
          onError(new ApiError(0, 'Mất kết nối. Bạn kiểm tra mạng rồi mở lại trang này nhé.'));
          return;
        }
      }
      if (ended) return;
      await new Promise((r) => setTimeout(r, Math.min(10000, 1500 * 2 ** failures)));
    }
  };
  void run();
  return () => ctrl.abort();
}
