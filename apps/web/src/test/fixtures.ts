import type { Job } from '@/lib/jobs';

export const user = { id: 'u1', name: 'Chú Ba', email: 'a@b.vn', avatar_url: null, role: 'player', credits: 1 };

export function job(patch: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    tree_id: 't1',
    tree_nickname: 'Si sân sau',
    status: 'awaiting_choice',
    error_code: null,
    progress: {},
    created_at: '2026-10-21T10:00:00Z',
    front_photo: { id: 'p1', url: 'https://r2/p1.webp', width: 1000, height: 1500 },
    analysis: {
      usable: true, issues: [], species_key: 'si', species_confidence: 0.92, summary_vi: 'Thân uốn nhẹ hình chữ S.',
      branch_count: 5, height_cm: 45, base_diameter_cm: 4.2, lower_apex_cm: 8,
    },
    options: [
      { id: 'o1', rank: 1, style_key: 'moyogi', name_vi: 'Trực uốn', name_jp: 'Moyogi', suitability: 0.9,
        why_vi: 'Thân đã có độ uốn tự nhiên. Giữ cành trái.', care_steps_vi: ['Bước 1'], remove_reasons_vi: ['Cành đối'],
        new_branch_notes_vi: [], counts: { cut: 2, keep: 3, new: 1, chop_apex: true }, sketch_svg_url: 'https://r2/s1.svg' },
      { id: 'o2', rank: 2, style_key: 'shakan', name_vi: 'Xiêu', name_jp: 'Shakan', suitability: 0.7,
        why_vi: 'Cần nghiêng chậu khoảng 20°.', care_steps_vi: [], remove_reasons_vi: [], new_branch_notes_vi: [],
        counts: { cut: 1, keep: 4, new: 0 }, sketch_svg_url: 'https://r2/s2.svg' },
    ],
    chosen_option_id: null,
    result: null,
    credits_left: 1,
    ...patch,
  };
}

/** Dữ liệu màn Tự thiết kế (GET /jobs/{id}/studio) dùng chung cho các test. */
export const studio = {
  species_key: 'si',
  photo_url: 'https://r2/p.webp', width: 1000, height: 1500,
  trunk: { base_point_px: [500, 1300], apex_point_px: [520, 300], height_px: 1000, base_diameter_px: 120 },
  branches: [
    { id: 'b1', start_px: [480, 1000], end_px: [300, 950], direction: 'left', thickness: 'thick', height_ratio: 0.3 },
    { id: 'b2', start_px: [520, 990], end_px: [700, 940], direction: 'right', thickness: 'medium', height_ratio: 0.31 },
  ],
  candidate_apex_px: [515, 400], first_branch_y_range_px: [900, 1050],
  styles: [{ key: 'moyogi', name_vi: 'Trực uốn', suggested: true }, { key: 'chokkan', name_vi: 'Trực', suggested: false }],
  templates: [{ rank: 1, style_key: 'moyogi', removed: ['b2'], apex: [515, 400], pads: 3, silhouette: { width_px: 600, height_px: 520, pads: 3 }, pot: { shape: 'oval', color: 'x', position: 'center' } }],
  draft: null,
};
