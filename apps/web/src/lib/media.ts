import { api } from './api';

/** Nội dung từ kết quả (apps/api/bonsai_api/routers/media.py + tools/drawing): tranh vẽ, video, cây tách nền, bản vẽ kỹ thuật. */

export type ArtStyle = 'pencil' | 'ink';
export interface MediaState { state: 'none' | 'running' | 'done' | 'failed'; url: string | null; content_type: string | null; width: number | null; height: number | null }
export interface DrawingRow { no: number; action: 'cut' | 'wire' | 'grow'; title_vi: string; detail_vi: string; gauge_mm: number | null; length_cm: number | null }
export interface Drawing { svg: string; rows: DrawingRow[]; width: number; height: number; photo_url: string }

export const mediaApi = {
  art: (jobId: string, style: ArtStyle) => api<Record<string, string>>(`/jobs/${jobId}/art?style=${style}`),
  video: (jobId: string) => api<MediaState>(`/jobs/${jobId}/video`),
  makeVideo: (jobId: string) => api<MediaState>(`/jobs/${jobId}/video`, { method: 'POST' }),
  cutout: (jobId: string) => api<MediaState>(`/jobs/${jobId}/cutout`),
  makeCutout: (jobId: string) => api<MediaState>(`/jobs/${jobId}/cutout`, { method: 'POST' }),
  drawing: (jobId: string) => api<Drawing>(`/tools/drawing/${jobId}`),
};

/** Bắt đầu tạo (nếu chưa) rồi hỏi lại mỗi `every` ms tới khi xong / lỗi. Trả hàm hủy. */
export function pollMedia(
  start: () => Promise<MediaState>, get: () => Promise<MediaState>, onState: (m: MediaState) => void, onError: (e: Error) => void, every = 3000,
): () => void {
  let stopped = false;
  let timer = 0;
  const tick = (p: Promise<MediaState>) =>
    p.then((m) => {
      if (stopped) return;
      onState(m);
      if (m.state === 'running') timer = window.setTimeout(() => tick(get()), every);
    }).catch((e: Error) => !stopped && onError(e));
  tick(start());
  return () => { stopped = true; window.clearTimeout(timer); };
}

/** Tải ảnh có ký URL về dạng object URL (để vẽ lên canvas mà không bị "tainted"). */
export async function blobUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Không tải được ảnh.');
  return URL.createObjectURL(await res.blob());
}
