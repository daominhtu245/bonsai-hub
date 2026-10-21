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
    credits_left: 1,
    ...patch,
  };
}
