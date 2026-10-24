// Câu chữ dùng chung cho các màn phiên A.

export const SPECIES_NAME: Record<string, string> = {
  si: 'Si',
  sanh: 'Sanh',
  mai_chieu_thuy: 'Mai chiếu thủy',
  tung_la_han: 'Tùng la hán',
  linh_sam: 'Linh sam',
  other: 'Loài khác',
};

export const PHOTO_ISSUE: Record<string, string> = {
  blurry: 'ảnh bị mờ',
  cluttered_background: 'nền phía sau rối',
  base_hidden: 'không thấy rõ gốc',
  tilted_camera: 'máy bị nghiêng',
  not_a_tree: 'không thấy cây trong ảnh',
  too_dark: 'ảnh tối',
  dark: 'ảnh tối',
  too_small: 'ảnh quá nhỏ',
  overexposed: 'ảnh bị cháy sáng',
  low_contrast: 'ảnh quá mờ nhạt',
};


export function phaseAError(code: string | null, issues: string[] = []): { title: string; body: string; recapture: boolean } {
  switch (code) {
    case 'unusable_photo': {
      const reasons = issues.map((i) => PHOTO_ISSUE[i]).filter(Boolean);
      return {
        title: 'Ảnh chưa đủ rõ để phân tích',
        body: reasons.length ? `Ảnh ${reasons.map((r) => r.replace(/^ảnh /, '')).join(', ')}. Bạn chụp lại theo khung hướng dẫn nhé.` : 'Bạn chụp lại theo khung hướng dẫn nhé.',
        recapture: true,
      };
    }
    case 'invalid_image':
    case 'no_photos':
      return { title: 'Ảnh bị lỗi', body: 'Không đọc được ảnh. Bạn chụp hoặc chọn lại ảnh khác nhé.', recapture: true };
    default:
      return { title: 'Chưa phân tích được', body: 'Hệ thống AI đang bận. Bạn thử lại sau ít phút — phân tích không tốn lượt.', recapture: false };
  }
}
