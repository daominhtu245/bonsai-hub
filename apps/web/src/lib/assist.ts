import { api } from './api';

/** Trợ lý chăm cây (apps/api/bonsai_api/routers/assist.py): đoán sâu bệnh, hỏi đáp, thời tiết. */

export interface Finding {
  key: string; name_vi: string; kind: 'pest' | 'disease' | 'abiotic'; likelihood: 'low' | 'medium' | 'high'; likelihood_vi: string;
  reason_vi: string | null; signs_vi: string | null; treat_now_vi: string[]; prevent_vi: string[]; see_expert_if_vi: string | null;
}
export interface HealthResult { method: 'symptoms' | 'ai'; usable: boolean; healthy: boolean; findings: Finding[]; issue_vi?: string | null; photo_unusable?: boolean; ai_failed?: boolean }
export interface HealthCheck { id: string; status: 'queued' | 'done' | 'failed'; symptoms: string[]; result: HealthResult | null; photo_url: string | null; created_at: string }
export interface Answer { answer_vi: string; topics: string[]; method: 'offline' | 'ai'; suggest_expert: boolean; ai_failed?: boolean }
export interface AssistantQuestion { id: string; question: string; status: 'queued' | 'done' | 'failed'; answer: Answer | null; created_at: string }
export interface WeatherAlert { date: string; kind: 'heavy_rain' | 'heat' | 'cold' | 'wind'; title_vi: string; advice_vi: string; value: number }
export interface Weather { province: string; province_vi: string; days: { date: string; max_c: number; min_c: number; rain_mm: number; wind_kmh: number }[]; alerts: WeatherAlert[] }

export const assistApi = {
  symptoms: () => api<{ code: string; label_vi: string }[]>('/tools/health/symptoms'),
  check: (body: { photo_key?: string; symptoms: string[]; tree_id?: string }) => api<HealthCheck>('/health-checks', { method: 'POST', json: body }),
  getCheck: (id: string) => api<HealthCheck>(`/health-checks/${id}`),
  ask: (question: string, treeId?: string) => api<AssistantQuestion>('/assistant/questions', { method: 'POST', json: { question, tree_id: treeId } }),
  getQuestion: (id: string) => api<AssistantQuestion>(`/assistant/questions/${id}`),
  weather: (province: string) => api<Weather>(`/tools/weather?province=${province}`),
};

/** Hỏi lại tới khi xong (worker gọi AI). Trả hàm hủy. */
export function pollUntilDone<T extends { status: string }>(get: () => Promise<T>, onValue: (v: T) => void, every = 2500, maxTries = 40): () => void {
  let stop = false;
  let timer = 0;
  let n = 0;
  const tick = () => get().then((v) => {
    if (stop) return;
    onValue(v);
    if (v.status === 'queued' && ++n < maxTries) timer = window.setTimeout(tick, every);
  }).catch(() => null);
  timer = window.setTimeout(tick, every);
  return () => { stop = true; window.clearTimeout(timer); };
}
