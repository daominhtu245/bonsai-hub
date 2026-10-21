# Bonsai AI — Bộ Prompt Hệ Thống (v0.2)

> Mục đích: bộ prompt chuẩn cho pipeline "ảnh phôi → bản vẽ → ảnh tương lai".
> Nguyên tắc: **mỗi bước một prompt, đầu ra có cấu trúc (JSON), bước sau chỉ đọc JSON của bước trước**.
> Không để model sinh ảnh "tự suy nghĩ" về thẩm mỹ: thẩm mỹ được quyết định ở P2 (Design), model ảnh chỉ thực thi.

```
P1 Analyze (VLM) ──JSON──▶ P2 Design (LLM + Rule Engine) ──JSON──▶ Code vẽ SVG sketch
                                                     │
                                                     ▼
                                      P3 Render (Image model, có ảnh gốc + sketch)
                                                     │  sinh N=3–4 ứng viên
                                                     ▼
                              P4 Judge (VLM) + kiểm tra cấu trúc bằng CV ──▶ chọn ảnh tốt nhất
```

Ngôn ngữ: prompt cho model viết bằng **tiếng Anh** (model hiểu thuật ngữ bonsai tốt hơn); nội dung trả cho người dùng sinh bằng tiếng Việt ở bước cuối.

---

## 0. Từ điển dùng chung (đưa vào code, chèn vào prompt qua biến)

### 0.1 Thế cây (style dictionary)

| key | Tên Việt | Tên Nhật | Mô tả cho prompt (EN) |
|---|---|---|---|
| `chokkan` | Trực | Chokkan | formal upright: straight vertical trunk, strong taper, apex directly above base |
| `moyogi` | Trực uốn / Trực biến | Moyogi | informal upright: S-curved trunk, apex above base, branches on outside of curves |
| `shakan` | Xiêu | Shakan | slanting: trunk leans 60–80°, apex not above base, roots stronger on opposite side |
| `kengai` | Huyền | Kengai | full cascade: trunk falls below pot rim |
| `han_kengai` | Bán huyền | Han-kengai | semi-cascade: trunk drops to about pot rim level |
| `bunjingi` | Văn nhân | Bunjingi | literati: tall thin trunk, few branches, foliage only near top, elegant movement |
| `fukinagashi` | Phong xuy | Fukinagashi | windswept: all branches swept to one side |
| `sokan` | Song thụ / Phu thê | Sokan | twin trunk: one thicker taller main trunk + smaller secondary trunk from same base |
| `sekijoju` | Bám đá | Sekijoju | root-over-rock |
| `vn_truc_quan_tu` | Trực quân tử | — | Vietnamese "gentleman upright": straight dignified trunk, layered tiers, calm symmetry-leaning balance |
| `vn_long` | Thế long (rồng) | — | Vietnamese dragon style: trunk with strong serpentine twists, dynamic movement, rising apex |

> Thế Việt Nam cần nghệ nhân duyệt lại mô tả. Bổ sung dần: tam đa, ngũ phúc, mẫu tử…

### 0.2 Loài (species dictionary) — chỉ mô tả thị giác, phục vụ render

| key | Tên Việt | Mô tả cho prompt (EN) | Tốc độ dày thân (gợi ý ban đầu, cần kiểm chứng) |
|---|---|---|---|
| `si` | Si | ficus with small glossy oval leaves, smooth grey bark, aerial roots possible | nhanh |
| `sanh` | Sanh | ficus with small dense leaves, light grey smooth bark, strong surface roots | nhanh |
| `mai_chieu_thuy` | Mai chiếu thủy | Wrightia religiosa: tiny oval leaves, small white fragrant flowers in clusters, slender twiggy branching | trung bình |
| `tung_la_han` | Tùng la hán | Podocarpus macrophyllus: narrow strap-like dark green leaves in tufts, fibrous brown bark | chậm |
| `linh_sam` | Linh sam | very small rounded leaves, rough dark textured bark, fine dense ramification | chậm |

> Tên khoa học của si/sanh/linh sam để trống có chủ đích, điền sau khi xác minh với nghệ nhân/tài liệu. Mỗi loài nên có thêm 3–5 ảnh tham chiếu (reference images) đưa kèm vào P3.

### 0.3 Bộ luật tỉ lệ (rule set — dùng trong Rule Engine và chèn vào P2, P4)

```yaml
proportions:
  height_to_base_diameter: [5, 7]        # lý tưởng ~6
  first_branch_height_ratio: [0.25, 0.4] # ~1/3 chiều cao
  pot_length_to_tree_height: [0.6, 0.75] # ~2/3 (thế đứng); thế huyền dùng chậu sâu
  pot_depth_to_base_diameter: [0.8, 1.2]
silhouette:
  shape: scalene_triangle                 # tam giác không cân
  apex_lean: toward_viewer_slightly
  negative_space: required                # khoảng thở giữa các tầng tán
branches:
  order: alternate_left_right_back        # xen kẽ trái - phải - sau
  thickness: decreasing_upwards
  length: decreasing_upwards
  forbidden:
    - bar_branches        # 2 cành mọc đối cùng độ cao
    - eye_poke_branches   # cành chĩa thẳng về người xem (phần dưới)
    - crossing_branches
    - inside_of_curve_branches
    - reverse_taper       # đoạn thân trên to hơn dưới
trunk:
  taper: required
  front_selection: [best_nebari, best_taper, visible_movement]
```

---

## P1 — ANALYZE (Vision LLM)

**Model gợi ý:** Claude / Gemini / GPT có vision. **Input:** 1–4 ảnh (ưu tiên 4 mặt) + thông tin người dùng nhập (loài nếu biết, chiều cao thực nếu biết).

### System prompt
```
You are a senior bonsai master and a precise visual analyst.
Your job is ONLY to describe what physically exists in the photo of raw bonsai material (a pre-bonsai / "phôi").
Never invent branches, roots or features that are not visible. If something is unclear, mark it "uncertain".
Measure in pixels relative to the image, and estimate real-world size only if a reference object or user-given height exists.
Return ONLY valid JSON matching the schema. No prose.
```

### User prompt (template)
```
Analyze this bonsai raw material.
User-provided info: species="{species_or_unknown}", real_height_cm={height_or_null}.
Images: {n_images} views (front candidates).

Return JSON:
{
  "image_quality": {"usable": bool, "issues": ["blurry"|"cluttered_background"|"base_hidden"|"tilted_camera"|...]},
  "species": {"guess": "<key from list: si|sanh|mai_chieu_thuy|tung_la_han|linh_sam|other>", "confidence": 0-1},
  "trunk": {
    "base_point_px": [x,y], "apex_point_px": [x,y],
    "height_px": int, "base_diameter_px": int,
    "taper": "good|weak|reverse",
    "movement": "straight|gentle_curve|s_curve|strong_twist|leaning",
    "lean_angle_deg": number,
    "notable": ["deadwood","scar","hollow","aerial_roots",...]
  },
  "nebari": {"quality": "good|average|poor|hidden", "spread_side": "left|right|even|unknown"},
  "branches": [
    {"id": "b1", "start_px": [x,y], "direction": "left|right|back|front|up",
     "thickness": "thick|medium|thin", "height_ratio": 0-1, "issues": ["bar_branch"|"crossing"|"eye_poke"|"inside_curve"|...]}
  ],
  "best_front_view_index": int,
  "summary_vi": "<2-3 câu mô tả phôi bằng tiếng Việt>"
}
```

> Nếu `image_quality.usable = false` → dừng pipeline, trả hướng dẫn chụp lại.

---

## P2 — DESIGN (LLM suy luận + Rule Engine)

Đây là bước **"hiểu cái đẹp"**. Code Rule Engine tính trước các con số (tỉ lệ, vị trí cành 1/3…), LLM chỉ chọn và giải thích trong khuôn khổ đó.

### System prompt
```
You are a bonsai design master (Japanese classical + Vietnamese traditional styles).
You design a realistic future for THIS specific raw material, respecting what it physically has.
Principles (must follow):
{rule_set_yaml}
Rules of honesty:
- Choose only styles the existing trunk can realistically achieve. A straight trunk cannot become a dragon twist without years of heavy wiring — say so.
- Respect biology: timeline must match species growth speed ({growth_speed}).
- Prefer working with the trunk's natural movement over fighting it.
Return ONLY valid JSON.
```

### User prompt (template)
```
Analysis of the raw material:
{p1_json}

Pre-computed targets from rule engine:
{rule_engine_json}   // vd: target_height_px, first_branch_y_px, candidate_apex_px, pot_size

Allowed styles: {style_keys_with_descriptions}
User preference (optional): style="{user_style_or_any}", goal="{display|sale|gift}"

Produce 2-3 design options, ranked by suitability:
{
  "options": [
    {
      "style_key": "...",
      "suitability": 0-1,
      "why_vi": "<vì sao thế này hợp với phôi, tiếng Việt>",
      "front": "view index + rotation note",
      "apex": {"point_px": [x,y], "lean": "slightly_left|slightly_right|forward"},
      "keep_branches": [{"id":"b1","role":"first_branch|second_branch|back_branch|apex"}],
      "remove_branches": [{"id":"b3","reason_vi":"..."}],
      "new_branches_needed": [{"at_px":[x,y],"direction":"...","note_vi":"cần nuôi cành mới tại đây"}],
      "silhouette": {"width_px": int, "height_px": int, "pads": int},
      "pot": {"shape":"rectangle|oval|round|cascade_deep","color":"unglazed_brown|glazed_blue|...","position":"off_center_left|off_center_right|center"},
      "stages": "<see P2b — stage plan is generated in a second call after the user picks this option>",
      "care_steps_vi": ["Bước 1: ...", "Bước 2: ..."]
    }
  ]
}
```

### Từ JSON → bản vẽ SVG (code, không dùng AI)
- Ảnh gốc làm nền, giảm độ sáng 30%.
- `remove_branches` → nét **đỏ** + ký hiệu kéo cắt.
- `keep_branches` + khung cành tương lai → nét **xanh lá**.
- `silhouette` → đường tam giác tán nét đứt; `apex` → chấm tròn.
- `new_branches_needed` → mũi tên vàng.
- Xuất SVG (cho người dùng) + PNG (đưa vào P3 làm sketch điều kiện).

---

## P3 — RENDER (Image edit model)

**Model gợi ý:** Nano Banana (Gemini image) / GPT Image cho MVP; về sau SDXL/Flux + ControlNet (lineart/scribble) + LoRA theo loài để kiểm soát tốt hơn.
**Input bắt buộc:** ảnh gốc (mặt tiền) + PNG sketch + 1–3 ảnh tham chiếu loài.

### P3a — Ảnh tương lai (photoreal), template theo mốc năm
```
Edit the FIRST image (original photo). Show the SAME tree after {years} years of professional bonsai training,
following the design sketch in the SECOND image. The remaining images are species references only — do not copy their trunks.

HARD CONSTRAINTS — do not violate:
1. Keep the exact same trunk: same base position, same trunk line and curves, same lean.
   Base thickness may increase by at most {max_thicken_pct}% over {years} years.
2. Keep the camera angle, framing, background and lighting identical to the original.
3. Do NOT add new trunks. Do NOT move or straighten the trunk.
4. Branches marked RED in the sketch are removed (show a small healed scar if {years} >= 2).
5. Follow GREEN lines for branch positions and the dashed outline for the canopy silhouette.

DESIGN:
- Style: {style_description}.
- Apex at the marked dot, leaning {apex_lean}.
- First branch on the {first_branch_side} at about one-third of the tree height; branches alternate left, right, back,
  getting thinner and shorter toward the top.
- Foliage: {species_foliage_description}, arranged in {pads} distinct foliage pads with clear negative space between them.
- Overall silhouette: asymmetric (scalene) triangle.
- Pot: {pot_description}, tree placed {pot_position}. {repot_note}

REALISM FOR {years} YEARS:
- {timeline_text}
- Foliage density and ramification must be believable for {years} years of {species_name} ({growth_speed} grower).
  Do not make it look like a 50-year-old masterpiece.

STYLE OF OUTPUT: photorealistic photo, natural daylight, sharp focus, same aspect ratio as the original.
No text, no watermark, no illustration or painting look, no extra objects.
```

Biến gợi ý:
- `max_thicken_pct`: chậm 5%/năm, trung bình 10%/năm, nhanh 15%/năm (giả định ban đầu, hiệu chỉnh bằng dữ liệu thật).
- `repot_note`: mốc 1 năm có thể giữ chậu ươm; từ mốc 3 năm đổi sang chậu bonsai.

### P3b — Bản vẽ phong cách nghệ nhân (tuỳ chọn, để đăng mạng / in)
```
Using the FIRST image (original photo) and the design sketch in the SECOND image, create a bonsai design drawing
of the SAME tree's final form ({style_description}).
Keep the trunk line, base and lean exactly as in the original photo.
Drawing style: traditional bonsai design sketch, fine ink lines with light grey wash shading on off-white paper,
foliage pads drawn as clean cloud shapes, pot drawn in simple outline. Side view, centered composition, generous margins.
No text, no signature, no color except subtle grey wash.
```

### P3c — Prompt sửa lỗi (khi P4 đánh trượt)
```
The previous result failed these checks: {failed_checks}.
Regenerate from the original photo again. Fix ONLY these issues, keep everything else from the instructions:
{fix_instructions}
```

---

## P4 — JUDGE (Vision LLM chấm điểm) + kiểm tra cấu trúc bằng CV

### 4.1 Kiểm tra cấu trúc (code, chạy trước — rẻ, khách quan)
- Segment thân (SAM / YOLO-seg) ở ảnh gốc và ảnh sinh.
- Tính IoU vùng thân từ gốc lên 60% chiều cao: **IoU < 0.75 → loại** (AI đã "chế" thân).
- So vị trí điểm gốc (base point): lệch > 3% chiều rộng ảnh → loại.
- So tỉ lệ khung hình, độ lệch màu nền (đảm bảo không đổi background).

### 4.2 VLM judge
#### System prompt
```
You are a strict bonsai competition judge. Compare the ORIGINAL raw material photo with the GENERATED future image.
Score honestly. A pretty image that changed the trunk is a FAIL.
Return ONLY JSON.
```
#### User prompt
```
Design intent: {p2_option_json}
Rules: {rule_set_yaml}
Target years: {years}; species: {species_name}

Score 1-10 each:
{
  "trunk_fidelity": int,          // cùng thân, cùng gốc, cùng độ nghiêng
  "proportions": int,             // tỉ lệ chiều cao/gốc, cành 1 ở ~1/3
  "silhouette": int,              // tam giác không cân, đỉnh rõ
  "branch_structure": int,        // xen kẽ, thon dần, không cành lỗi
  "negative_space": int,
  "species_realism": int,         // lá, vỏ, hoa đúng loài
  "timeline_plausibility": int,   // có hợp lý với số năm không
  "photo_realism": int,           // không lỗi AI, không méo
  "hard_fail": ["trunk_changed"|"extra_trunk"|"background_changed"|"wrong_species"|"text_artifact"|...],
  "fix_instructions": "<EN, specific, for regeneration>",
  "total": float                  // trung bình có trọng số
}
```
Trọng số gợi ý: trunk_fidelity ×2, proportions ×1.5, timeline_plausibility ×1.5, còn lại ×1.

**Luật chọn:** loại mọi ảnh có `hard_fail`; chọn ảnh `total` cao nhất; nếu tất cả < 6.5 → chạy P3c tối đa 2 vòng, sau đó trả kết quả tốt nhất kèm cảnh báo.

---

## P5 — OUTPUT cho người dùng (tiếng Việt)

```
Viết kết quả cho người chơi bonsai Việt Nam, giọng thân thiện, chuyên môn, ngắn gọn.
Dữ liệu: {p1_json}, {chosen_option_json}, {judge_json}
Gồm:
1. Nhận xét phôi (2-3 câu): điểm mạnh, điểm yếu.
2. Thế được chọn và vì sao.
3. Lộ trình: năm 1 / năm 3 / năm 5 — việc cần làm (cắt, uốn, nuôi cành, thay chậu).
4. Lưu ý chăm sóc theo loài.
5. Dòng cuối bắt buộc: "Ảnh là minh hoạ định hướng; kết quả thực tế phụ thuộc chăm sóc và điều kiện trồng."
```

---

## P2b — STAGE PLAN (lộ trình các giai đoạn)

Chạy sau khi người dùng chọn 1 phương án ở P2. Giai đoạn được chia theo **mốc kỹ thuật làm vườn**, không chia đều theo năm, vì người chơi cần biết "đang ở bước nào, làm gì, khi nào sang bước sau".

### Khung giai đoạn chuẩn (điều chỉnh theo loài và tốc độ sinh trưởng)

| Stage | Tên | Thời điểm (gợi ý) | Hình ảnh thể hiện |
|---|---|---|---|
| S0 | Hiện trạng | Hôm nay | Ảnh gốc |
| S1 | Tạo khung | Ngay sau buổi cắt & uốn đầu tiên | Thân giữ nguyên, cành đỏ đã bị cắt, cành giữ lại được uốn dây, tán thưa |
| S2 | Phục hồi & nuôi cành | 6–12 tháng | Vết cắt đang liền, cành mọc dài tự do để lấy sức, chưa đẹp nhưng khoẻ |
| S3 | Định tầng tán | 2–3 năm | Cành đã cắt ngắn lại, bắt đầu phân nhánh, tán thành tầng, có thể đã thay chậu bonsai |
| S4 | Hoàn thiện | 4–6+ năm | Ảnh kết quả cuối cùng (đã duyệt ở P3a/P4) |

### System prompt
```
You are a bonsai master planning the realistic development path of one tree.
The START (original photo analysis) and the END (approved final design) are fixed. Plan the stages in between.
Each stage must be physically reachable from the previous one:
- Trunk base position never moves; trunk thickness only increases; removed branches never come back.
- Foliage grows outward first (S2), then is cut back and refined (S3). Do not show a refined canopy before it is earned.
- Durations must fit species growth speed ({growth_speed}) and Vietnamese climate ({region}: north|central|south).
Return ONLY valid JSON.
```

### User prompt (template)
```
Analysis: {p1_json}
Chosen design: {p2_option_json}
Final image description (from judge): {final_judge_summary}

Return:
{
  "stages": [
    {
      "id": "S1",
      "name_vi": "Tạo khung",
      "time_from_start": "0 tháng",
      "visual_state_en": "<precise description for image render: what is cut, what is wired, foliage density %, trunk thickness change %, pot>",
      "foliage_density_pct": 0-100,
      "trunk_thicken_pct_vs_original": number,
      "actions_vi": ["Cắt bỏ cành b3, b5 sát thân, bôi keo liền sẹo", "Uốn dây nhôm 2.5mm cành b1 xuống 20°", "..."],
      "best_season_vi": "Cuối đông – đầu xuân, trước khi cây ra chồi",
      "care_vi": ["Tưới...", "Bón...", "Để nơi..."],
      "ready_for_next_signs_vi": ["Vết cắt đã liền mép", "Cành mới dài > 15cm"],
      "common_mistakes_vi": ["Tháo dây quá muộn gây hằn vỏ", "..."],
      "duration_to_next": "6–12 tháng"
    }
  ]
}
```

---

## P3d — RENDER CÁC GIAI ĐOẠN TRUNG GIAN

### Nguyên tắc nhất quán (quan trọng nhất)
Nếu render từng giai đoạn độc lập, mỗi ảnh sẽ "trôi" (thân khác, góc khác), và chuỗi ảnh mất tính tin cậy. Vì vậy:

1. **Neo hai đầu:** chỉ render giai đoạn giữa SAU KHI đã có ảnh cuối S4 được duyệt.
2. **Render theo chuỗi:** S1 dựa trên (ảnh gốc + sketch); S2 dựa trên (S1 + ảnh S4); S3 dựa trên (S2 + ảnh S4).
   Mỗi bước luôn có ảnh trước đó làm "khung xương" và ảnh cuối làm "đích".
3. **S1 ưu tiên chỉnh sửa có kiểm soát:** chỉ xoá các cành đỏ (inpainting) và thêm dây uốn. Không để model vẽ lại toàn cây.
4. **Kiểm tra đơn điệu bằng CV giữa các bước liên tiếp:**
   - Điểm gốc lệch < 2% chiều rộng ảnh.
   - Diện tích mask thân S(k) ≥ S(k-1) (thân chỉ to lên).
   - Vùng cành đã cắt ở S1 không xuất hiện lại.
   - Nền, góc chụp giữ nguyên (so histogram vùng nền).
   Nếu vi phạm → sinh lại bước đó (tối đa 2 lần).

### Prompt S1 — Tạo khung (sửa có kiểm soát)
```
Edit the FIRST image (original photo) minimally.
1. Remove ONLY the branches marked RED in the SECOND image (sketch). Fill the removed area with the original background.
   Leave small fresh pruning cuts with sealing paste on the trunk where branches were removed.
2. Apply bonsai training wire (aluminium, brown/copper color) spirally on the branches marked GREEN,
   bending them to the positions shown in the sketch.
3. Keep everything else pixel-identical: trunk, base, roots, remaining foliage, pot, background, lighting, camera.
Foliage density about {foliage_density_pct}% of the original (sparse after pruning).
Photorealistic, no text.
```

### Prompt S2, S3 — Giai đoạn giữa (chuỗi)
```
FIRST image: the tree at the previous stage ({prev_stage_name}). Use it as the exact structural base.
SECOND image: the approved final result. Use it only as the direction of development, NOT as the current look.
THIRD image (optional): species reference.

Show the SAME tree at stage "{stage_name_en}", {time_from_start} after the start.

HARD CONSTRAINTS:
- Same trunk line, same base position, same camera, same background and lighting as the FIRST image.
- Trunk base thickness = original +{trunk_thicken_pct}% (thicker than previous stage, thinner than final).
- Branches removed earlier must not reappear.
- {pot_rule}   // vd: "Same nursery pot as previous stage" | "Now in the bonsai pot shown in the final image"

STATE AT THIS STAGE:
{visual_state_en}
Foliage density about {foliage_density_pct}%. The tree must look clearly LESS refined than the final image
and clearly MORE developed than the previous stage.

Photorealistic photo, same aspect ratio, no text, no watermark.
```

---

## P6 — XUẤT LỘ TRÌNH CHO NGƯỜI DÙNG

Định dạng hiển thị đề xuất: **thanh trượt timeline** S0 → S4 (ảnh đổi theo giai đoạn) + thẻ hướng dẫn mỗi giai đoạn.

```
Viết hướng dẫn lộ trình cho người chơi bonsai Việt Nam từ {stages_json}.
Mỗi giai đoạn gồm đúng các mục:
- Tiêu đề: "Giai đoạn {n}: {name_vi} — {time_from_start}"
- Bạn sẽ thấy gì: 1–2 câu mô tả hình ảnh cây ở giai đoạn này
- Việc cần làm: tối đa 5 gạch đầu dòng, cụ thể (cành nào, dây cỡ nào, góc bao nhiêu)
- Thời điểm tốt nhất: mùa / tháng
- Chăm sóc trong giai đoạn
- Dấu hiệu sẵn sàng sang giai đoạn sau
- Lỗi hay gặp
Giọng văn: thân thiện, chuyên môn, ngắn gọn. Không hứa hẹn chắc chắn.
Cuối cùng: "Ảnh là minh hoạ định hướng; tốc độ thực tế phụ thuộc chăm sóc, khí hậu và sức khoẻ cây."
```

### Mở rộng sau MVP (khuyến nghị)
- **Video "phôi lớn lên"** (timelapse giả lập): dùng 5 ảnh S0–S4 làm keyframe, cho model image-to-video nội suy giữa các khung. Đây là nội dung rất hợp TikTok/Reels và là "wow" rẻ hơn 3D nhiều.
- **Theo dõi tiến độ thật:** người dùng chụp lại cây sau vài tháng → VLM so với stage dự kiến → báo "đang đúng lộ trình / chậm / cần điều chỉnh". Đồng thời đây là nguồn dữ liệu trước–sau thật để hiệu chỉnh tốc độ sinh trưởng.

---

## Checklist dữ liệu cần chuẩn bị song song
- [ ] 50–100 ảnh phôi thật (đủ 5 loài) làm bộ test cố định — chạy lại mỗi khi sửa prompt để so sánh.
- [ ] 30–200 ảnh cây đã hoàn thiện / loài (ảnh tự chụp hoặc có quyền sử dụng) → ảnh tham chiếu + dữ liệu LoRA sau này.
- [ ] Lưu toàn bộ (ảnh gốc, JSON P1/P2, ảnh sinh, điểm P4, đánh giá của người dùng) → đây là dataset để fine-tune về sau.
