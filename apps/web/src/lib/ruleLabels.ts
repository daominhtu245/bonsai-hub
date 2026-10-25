/** Nhãn tiếng Việt cho khóa và mã trong bộ luật (packages/pipeline/bonsai_pipeline/rules/*.yaml) — nghệ nhân đọc, không cần biết mã. */

export const KEY_LABEL: Record<string, string> = {
  // chung
  version: 'Số hiệu bản', note: 'Ghi chú', default: 'Mặc định',
  // tỉ lệ
  proportions: 'Tỉ lệ', height_to_base_diameter: 'Chiều cao / đường kính gốc', first_branch_height_ratio: 'Độ cao cành đầu (phần chiều cao cây)',
  pot_length_to_tree_height: 'Dài chậu / chiều cao cây', pot_depth_to_base_diameter: 'Sâu chậu / đường kính gốc',
  branch_to_trunk_caliper_max: 'Cành to tối đa (phần đường kính thân)', next_branch_spacing: 'Khoảng cách cành kế tiếp',
  nebari_visible_above_soil: 'Rễ nổi lộ trên mặt đất',
  growth: 'Thời gian & tốc độ lớn', max_thicken_pct_per_year: 'Thân dày thêm tối đa (%/năm)', years_to_final: 'Số năm tới dáng hoàn chỉnh',
  slow: 'Chậm', medium: 'Vừa', fast: 'Nhanh',
  // thân, rễ
  trunk: 'Thân', taper: 'Độ thon', lean_toward_viewer: 'Nghiêng về người xem', curves: 'Khúc uốn',
  lower_trunk_visible_from_front: 'Nửa dưới thân nhìn rõ từ mặt tiền', twin_trunk_split: 'Song thụ tách thân', front_selection: 'Chọn mặt tiền theo',
  roots: 'Rễ', flare: 'Gốc loe', forbidden: 'Cấm',
  // cành
  branches: 'Cành', order: 'Thứ tự cành', back_branch_never_lowest: 'Cành sau không bao giờ thấp nhất', spread_angle_deg: 'Góc tỏa 3 cành đầu (độ)',
  first_two_forward_of_midline: 'Hai cành đầu nhích ra trước', from_outside_of_curves: 'Cành mọc ở lưng khúc uốn', size: 'Kích thước',
  continuous_to_apex: 'Cành liên tục tới ngọn', one_per_level: 'Mỗi độ cao một cành', secondary: 'Nhánh cấp 2', old_tree_look: 'Dáng cây già',
  // ngọn, tán
  apex: 'Ngọn', single: 'Một ngọn', over_base: 'Ngọn thẳng trên gốc (thế)', continues_trunk_flow: 'Ngọn tiếp chuyển động của thân',
  silhouette: 'Dáng tán', shape: 'Hình', balance: 'Cân bằng', negative_space: 'Khoảng trống', foliage_to_scale: 'Lá tương xứng', look: 'Vẻ ngoài',
  // chậu
  pot: 'Chậu', placement: 'Vị trí cây trong chậu', shape_by_style: 'Dáng chậu theo thế', color: 'Màu chậu', pot_subdued_not_competing: 'Chậu không lấn át cây',
  in_pot_only: 'Chỉ được có trong chậu', flowering_or_fruiting: 'Cây hoa / quả', conifer_or_evergreen: 'Cây lá kim / thường xanh', massive_trunk: 'Thân rất to',
  style_specifics: 'Đặc điểm từng thế', trunk_angle_deg: 'Góc nghiêng thân so với phương thẳng đứng (độ)', first_branch_ratio: 'Độ cao cành đầu', first_branch: 'Cành đầu',
  crown: 'Tán', foliage: 'Lá', deadwood: 'Lũa (jin, shari)', trunks: 'Số thân', secondary_max_diameter_ratio: 'Thân phụ to tối đa (phần thân chính)',
  secondary_max_height_ratio: 'Thân phụ cao tối đa (phần thân chính)', display_faults: 'Lỗi khi trưng bày',
  // thế cây
  chokkan: 'Trực', moyogi: 'Trực uốn', shakan: 'Xiêu', kengai: 'Huyền', han_kengai: 'Bán huyền', bunjingi: 'Văn nhân', fukinagashi: 'Phong xuy',
  sokan: 'Song thụ', sekijoju: 'Bám đá', vn_truc_quan_tu: 'Trực quân tử', vn_long: 'Thế long',
  // bảng chấm
  fidelity_hard_fail: 'Lỗi loại thẳng (sai so với phôi / thiết kế)', criteria: 'Tiêu chí chấm', weight: 'Trọng số', check: 'Xem xét',
  pass_score: 'Điểm đạt (thang 100)', checks: 'Ngưỡng đo tự động', vn_notes: 'Cảm nhận truyền thống', presentation_faults: 'Lỗi trình bày',
  pad_cover_min: 'Lá tối thiểu trong mỗi tầng', pads_missing_max: 'Tỉ lệ tầng thiếu lá tối đa', outside_foliage_max: 'Lá ngoài thiết kế tối đa',
  removed_same_max: 'Ngưỡng "cành cắt vẫn còn"', apex_off_max: 'Ngọn lệch tối đa (phần chiều cao ảnh)',
  trunk_nebari: 'Thân & rễ', foliage_pads: 'Tầng lá', proportions_c: 'Tỉ lệ', pot_harmony: 'Chậu hài hòa', realism_age: 'Độ già hợp lý', overall: 'Tổng thể',
  // loài
  name_vi: 'Tên', scientific: 'Tên khoa học', render_hints: 'Gợi ý khi vẽ ảnh', pruning: 'Cắt tỉa', defoliation: 'Tuốt lá', wiring: 'Uốn dây',
  repot_years: 'Thay chậu (năm)', root_pruning: 'Cắt rễ', styles_fit: 'Thế hợp', aerial_roots: 'Rễ khí sinh', light: 'Ánh sáng', soil_ph: 'Độ pH đất',
  young: 'Cây non', old: 'Cây già',
  // thế Việt
  dang: 'Dáng', the: 'Thế', angle_deg: 'Góc (độ)', maps_to: 'Tương ứng thế', meaning: 'Ý nghĩa', structure: 'Bố cục', numbers: 'Số liệu',
  tiers: 'Số tầng', branches_n: 'Số cành', first_branch_length_to_height: 'Cành 1 dài / chiều cao', child_max_diameter_ratio: 'Thân con to tối đa',
  child_max_height_ratio: 'Thân con cao tối đa', parent_branches: 'Số cành thân cha', size_ratio: 'Tỉ lệ cỡ hai thân', evaluation_vn: 'Tiêu chí truyền thống',
  truc: 'Trực', xieu: 'Xiêu', hoanh: 'Hoành', huyen: 'Huyền', co: 'Cổ', ky: 'Kỳ', my: 'Mỹ', van: 'Văn',
};

export const TERM_LABEL: Record<string, string> = {
  // cành cấm
  bar_branches: 'Cành ngang nhau hai bên', eye_poke_branches: 'Cành chĩa vào người xem', crossing_branches: 'Cành bắt chéo',
  inside_of_curve_branches: 'Cành ở bụng khúc uốn', whorled_or_wheel_spoke_branches: 'Cành mọc vòng', parallel_branches: 'Cành song song',
  thin_branch_with_heavy_foliage: 'Cành mảnh tán nặng', thick_branches_on_thin_trunk: 'Cành to trên thân mảnh', reverse_taper: 'Thân thon ngược',
  crossing_roots: 'Rễ bắt chéo', root_pointing_at_viewer: 'Rễ chĩa vào người xem',
  // thân
  required: 'Bắt buộc', required_never_reverse: 'Bắt buộc, không thon ngược', slight: 'Nhẹ', tighten_toward_apex: 'Nhỏ dần lên ngọn',
  no_c_shape_doubling_back: 'Không gập chữ C', no_bulge_toward_viewer: 'Không ưỡn về người xem', avoid_too_many_s_curves_in_moyogi: 'Trực uốn không quá nhiều khúc',
  at_base_only: 'Chỉ từ gốc', best_nebari: 'Rễ đẹp nhất', best_taper: 'Thon đẹp nhất', visible_movement: 'Thấy chuyển động thân', scars_to_back: 'Sẹo ra sau',
  // cành
  left_or_right: 'Trái hoặc phải', opposite_side_higher: 'Bên kia, cao hơn', back_higher_still: 'Phía sau, cao hơn nữa',
  longest_thickest_at_bottom_decreasing_upward: 'Dưới dài to nhất, nhỏ dần lên', alternate_horizontal_forming_pad: 'So le, nằm ngang, tạo tầng',
  wire_downward: 'Uốn hướng xuống', one_third_of_remaining_height: '1/3 quãng còn lại', about_one_third: 'Khoảng 1/3',
  // tán, chậu
  scalene_triangle: 'Tam giác lệch', static_near_symmetric: 'Tĩnh, gần đối xứng', dynamic_asymmetric: 'Động, bất đối xứng',
  required_see_through: 'Bắt buộc, nhìn xuyên qua', mature_tree_in_nature: 'Như cây già ngoài thiên nhiên',
  behind_midline_off_center_opposite_visual_weight: 'Sau đường giữa, lệch ngược phía tán nặng', rectangle: 'Chữ nhật', oval_or_round: 'Bầu dục / tròn',
  rectangle_or_oval: 'Chữ nhật / bầu dục', deep_round_or_hexagonal: 'Sâu, tròn / lục giác', medium_deep_round: 'Tròn, sâu vừa', small_round_shallow: 'Tròn nhỏ, nông',
  deep_rectangle: 'Chữ nhật sâu', glazed_complementing_flowers: 'Men màu hợp hoa', unglazed_earth: 'Không men, màu đất', tree: 'Cây', soil: 'Đất', moss: 'Rêu',
  natural_rock: 'Đá tự nhiên', visible_wire_marks: 'Hằn dây', fresh_large_scars_on_front: 'Sẹo mới ở mặt tiền', unrelated_objects_in_pot: 'Vật lạ trong chậu',
  // đặc điểm từng thế
  s_curves_tightening_upward: 'Khúc chữ S nhỏ dần lên ngọn', at_each_bend_outside: 'Ở lưng mỗi khúc uốn', stronger_on_side_opposite_lean: 'Khỏe hơn ở phía ngược chiều nghiêng',
  opposite_to_lean: 'Ngược chiều nghiêng', falls_below_pot_bottom: 'Đổ thấp hơn đáy chậu', above_pot_rim: 'Ở trên miệng chậu', tall: 'Cao',
  drops_to_pot_rim_never_below_pot_bottom: 'Đổ tới miệng chậu, không thấp hơn đáy chậu', medium_deep: 'Sâu vừa', tall_slender_crooked: 'Cao, mảnh, khúc khuỷu',
  none_on_lower_trunk: 'Không cành ở thân dưới', top_only: 'Chỉ ở phần ngọn', optional_jin_shari: 'Có thể có lũa (jin, shari)', leaning: 'Nghiêng',
  all_swept_one_side: 'Mọi cành dạt về một phía', two_from_same_base: 'Hai thân chung một gốc', single_shared: 'Một tán chung', over_rock_into_pot: 'Ôm đá, rễ cắm xuống chậu',
  // bảng chấm
  trunk_changed: 'Thân bị đổi', trunk_too_thick: 'Thân to quá mức', removed_branch_present: 'Cành phải cắt vẫn còn',
  extra_trunk_or_major_branch: 'Mọc thêm thân / cành lớn', wrong_species_foliage: 'Sai loại lá', camera_or_background_changed: 'Đổi góc chụp / nền',
  pot_style_wrong: 'Chậu khác thiết kế', pads_missing: 'Thiếu tầng lá', foliage_outside_design: 'Lá ngoài thiết kế', apex_off: 'Ngọn lệch',
  text_artifact: 'Có chữ / vết lạ', pasted_look: 'Trông như dán ghép',
  movement_natural: 'Chuyển động tự nhiên', nebari_radial_flare: 'Rễ tỏa đều', front_correct: 'Mặt tiền đúng', first_branch_height: 'Độ cao cành đầu',
  alternation_left_right_back: 'So le trái – phải – sau', decreasing_size: 'Nhỏ dần lên', no_forbidden_branches: 'Không có cành cấm',
  pad_count_matches_design: 'Đúng số tầng thiết kế', single_apex: 'Một ngọn', apex_position_matches_design: 'Ngọn đúng vị trí',
  slight_lean_to_viewer: 'Hơi nghiêng về người xem', height_to_trunk: 'Cao / thân', branch_to_trunk_caliper: 'Cành / thân', canopy_width: 'Độ rộng tán',
  pot_size_ratio: 'Cỡ chậu', shape_matches_style: 'Dáng chậu hợp thế', color_subdued: 'Màu chậu trầm', placement_off_center: 'Đặt lệch tâm',
  ramification_believable_for_years: 'Độ phân cành hợp số năm', no_masterpiece_look_too_early: 'Không già quá sớm', style_reads_clearly: 'Thế rõ ràng',
  natural_mature_tree_impression: 'Cảm giác cây già tự nhiên', visible_wire: 'Lộ dây', fresh_scars_on_front: 'Sẹo mới mặt tiền',
  pot_overpowers_tree: 'Chậu lấn át cây', clutter_in_pot: 'Chậu bừa bộn',
};

/** Lý do người dùng chọn khi bấm "Chưa đúng" ở màn Kết quả (mã trùng bảng chấm để gộp thống kê). */
export const FEEDBACK_REASONS: Array<[string, string]> = [
  ['trunk_changed', 'Thân khác cây của tôi'], ['pads_missing', 'Tầng lá không giống thiết kế'], ['removed_branch_present', 'Cành phải cắt vẫn còn'],
  ['wrong_species_foliage', 'Sai loại lá'], ['too_old_unrealistic', 'Già quá, khó đạt'], ['pot_style_wrong', 'Chậu không hợp'], ['pasted_look', 'Trông giả'],
];
for (const [k, v] of FEEDBACK_REASONS) TERM_LABEL[k] ??= v;

export const keyLabel = (k: string) => KEY_LABEL[k] ?? k.replace(/_/g, ' ');
export const termLabel = (v: string) => TERM_LABEL[v] ?? KEY_LABEL[v] ?? v.replace(/_/g, ' ');

/** Tiêu chí chấm (bảng chấm) — nhãn riêng vì "proportions" trùng khóa tỉ lệ. */
export const CRITERION_LABEL: Record<string, string> = {
  trunk_nebari: 'Thân & rễ', branches: 'Cành', foliage_pads: 'Tầng lá', apex: 'Ngọn', proportions: 'Tỉ lệ',
  pot_harmony: 'Chậu hài hòa', realism_age: 'Độ già hợp lý', overall: 'Tổng thể',
};
