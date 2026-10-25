import type { GardenTree } from './account';
import { SPECIES_NAME } from './copy';

/** Mỗi cây trong vườn dẫn tới đâu, trạng thái hiển thị và lời mời làm tiếp. */
export function destination(t: GardenTree): { to: string; status: string; cta: string | null; badge: string | null } {
  const id = t.job_id;
  switch (t.job_status) {
    case 'done':
      return { to: `/ket-qua/${id}`, status: [t.style_vi, t.stage_code && `${t.stage_code} ${t.stage_name_vi}`].filter(Boolean).join(' · '), cta: null, badge: null };
    case 'awaiting_choice':
      return { to: `/chon/${id}`, status: 'Đã phân tích · chưa chọn thế', cta: 'Chọn thế để tạo ảnh', badge: 'Chờ chọn thế' };
    case 'failed':
      return t.style_vi
        ? { to: `/ket-qua/${id}`, status: `${t.style_vi} · tạo ảnh chưa thành công`, cta: 'Đã hoàn lượt', badge: 'Chưa thành công' }
        : { to: `/phan-tich/${id}`, status: 'Phân tích chưa xong', cta: 'Xem cách chụp lại', badge: 'Chụp lại' };
    case null:
      return { to: '/chup', status: 'Chưa phân tích', cta: null, badge: 'Chưa phân tích' };
    case 'queued':
    case 'analyzing':
    case 'designing':
      return { to: `/phan-tich/${id}`, status: 'Đang phân tích…', cta: null, badge: 'Đang phân tích' };
    default:
      return { to: `/ket-qua/${id}`, status: 'Đang tạo ảnh tương lai…', cta: null, badge: 'Đang tạo ảnh' };
  }
}

export const treeName = (t: GardenTree) =>
  t.nickname || (t.species_key ? `Phôi ${SPECIES_NAME[t.species_key]?.toLowerCase() ?? ''}`.trim() : 'Cây chưa đặt tên');

export const daysSince = (iso: string | null | undefined) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);

/** Cây đã có lộ trình mà lâu chưa chụp ảnh tiến độ → nhắc chụp (nhật ký). */
export const DIARY_NUDGE_DAYS = 30;
export function photoOverdue(t: GardenTree): number | null {
  if (t.job_status !== 'done') return null;
  const d = daysSince(t.last_photo_at ?? t.created_at);
  return d !== null && d >= DIARY_NUDGE_DAYS ? d : null;
}

/** Cây nên làm trước: còn việc trong lộ trình, rồi tới cây chờ chọn thế. */
export function focusTree(trees: GardenTree[]): GardenTree | null {
  return trees.find((t) => t.next_task_vi) ?? trees.find((t) => t.job_status === 'awaiting_choice') ?? null;
}
