"""Provider giả cho test và chạy local không có khóa API."""

from __future__ import annotations

import io
from collections import deque

from PIL import Image

from ..base import AIError, ImageInput, ImageResponse, TextResponse, Usage


class FakeLLM:
    name = "fake"

    def __init__(self, model: str = "fake", responses: list[str | Exception] | None = None):
        self.model = model
        self.responses: deque[str | Exception] = deque(responses or [])
        self.calls: list[dict] = []

    def complete(self, *, system: str, messages: list[dict], images: list[ImageInput], max_tokens: int) -> TextResponse:
        self.calls.append({"system": system, "messages": list(messages), "images": len(images)})
        if not self.responses:
            raise AIError("fake LLM has no scripted response")
        r = self.responses.popleft()
        if isinstance(r, Exception):
            raise r
        return TextResponse(text=r, usage=Usage(tokens_in=100, tokens_out=50), provider=self.name, model=self.model)


class FakeImage:
    name = "fake"

    def __init__(self, model: str = "fake", fail_times: int = 0):
        self.model = model
        self.fail_times = fail_times
        self.calls = 0
        self.qualities: list[str | None] = []

    def edit(self, *, prompt: str, images: list[ImageInput], n: int = 1, quality: str | None = None, mask: bytes | None = None) -> ImageResponse:
        self.calls += 1
        self.qualities.append(quality)
        self.masks = [*getattr(self, "masks", []), mask]
        if self.fail_times > 0:
            self.fail_times -= 1
            raise AIError("fake transient failure", retryable=True)
        size = (64, 64)
        if images:
            size = Image.open(io.BytesIO(images[0].data)).size
        buf = io.BytesIO()
        Image.new("RGB", size, (94, 140, 79)).save(buf, format="PNG")
        return ImageResponse(
            images=[buf.getvalue()] * n, usage=Usage(images_out=n), provider=self.name, model=self.model
        )


class DemoLLM:
    """Trả kết quả P1/P2 mẫu (tỉ lệ theo kích thước ảnh) để chạy thử giao diện khi chưa có khóa API.

    Chỉ dùng ở APP_ENV=dev — không phải phân tích thật.
    """

    name = "demo"

    def __init__(self, model: str = "demo"):
        self.model = model

    def complete(self, *, system: str, messages: list[dict], images: list[ImageInput], max_tokens: int) -> TextResponse:
        import json
        import re

        prompt = messages[0]["content"]
        if "development path" in system:
            body = _demo_plan()
        elif "Viết hướng dẫn lộ trình" in prompt:
            body = _demo_guide()
        elif "Viết kết quả cho người chơi" in prompt:
            body = {"material_review_vi": "(Dữ liệu mẫu) Phôi khỏe, thân có độ uốn tự nhiên; gốc hơi mảnh so với chiều cao.",
                    "style_reason_vi": "(Dữ liệu mẫu) Trực uốn tận dụng đường cong sẵn có của thân.",
                    "roadmap_vi": {"year_1": ["Cắt tạo khung, uốn dây"], "year_3": ["Định tầng tán, thay chậu"], "year_5": ["Duy trì dáng"]},
                    "species_care_vi": ["Si ưa nắng, chịu cắt tỉa tốt."],
                    "disclaimer_vi": "Ảnh là minh hoạ định hướng; kết quả thực tế phụ thuộc chăm sóc và điều kiện trồng."}
        elif "competition judge" in system:
            body = {"trunk_fidelity": 8, "proportions": 7, "silhouette": 7, "branch_structure": 7, "negative_space": 7,
                    "species_realism": 7, "timeline_plausibility": 7, "photo_realism": 7, "hard_fail": [],
                    "fix_instructions": "", "summary_en": "(demo) four foliage pads, apex slightly left, oval brown pot"}
        elif "visual analyst" in system:
            m = re.search(r"\((\d+)x(\d+) px\)", prompt)
            w, h = (int(m.group(1)), int(m.group(2))) if m else (1024, 1536)
            body = _demo_analysis(w, h)
        else:
            m = re.search(r'"image_width": (\d+),\s*"image_height": (\d+)', prompt)
            w, h = (int(m.group(1)), int(m.group(2))) if m else (1024, 1536)
            styles = re.findall(r"^- ([a-z_]+): ", prompt, flags=re.MULTILINE)
            body = _demo_design(w, h, styles)
        return TextResponse(text=json.dumps(body, ensure_ascii=False), usage=Usage(), provider=self.name, model=self.model)


def _demo_analysis(w: int, h: int) -> dict:
    def p(x, y):
        return [round(w * x), round(h * y)]

    return {
        "image_quality": {"usable": True, "issues": []},
        "species": {"guess": "si", "confidence": 0.9},
        "trunk": {"base_point_px": p(0.5, 0.86), "apex_point_px": p(0.52, 0.2), "height_px": round(h * 0.66),
                  "base_diameter_px": round(w * 0.14), "taper": "good", "movement": "s_curve", "lean_angle_deg": 4,
                  "notable": []},
        "nebari": {"quality": "average", "spread_side": "left"},
        "branches": [
            {"id": "b1", "start_px": p(0.48, 0.66), "end_px": p(0.3, 0.62), "direction": "left", "thickness": "thick", "height_ratio": 0.3, "issues": []},
            {"id": "b2", "start_px": p(0.52, 0.655), "end_px": p(0.7, 0.62), "direction": "right", "thickness": "medium", "height_ratio": 0.31, "issues": ["bar_branch"]},
            {"id": "b3", "start_px": p(0.53, 0.53), "end_px": p(0.68, 0.48), "direction": "right", "thickness": "medium", "height_ratio": 0.5, "issues": []},
            {"id": "b4", "start_px": p(0.51, 0.43), "direction": "back", "thickness": "thin", "height_ratio": 0.65, "issues": []},
            {"id": "b5", "start_px": p(0.515, 0.3), "direction": "front", "thickness": "thin", "height_ratio": 0.85, "issues": ["eye_poke"]},
        ],
        "best_front_view_index": 0,
        "summary_vi": "(Dữ liệu mẫu) Phôi si thân uốn nhẹ hình chữ S, rễ nổi lệch trái, 5 cành.",
    }


def _demo_design(w: int, h: int, styles: list[str]) -> dict:
    def p(x, y):
        return [round(w * x), round(h * y)]

    base = {
        "front": "0",
        "keep_branches": [{"id": "b1", "role": "first_branch"}, {"id": "b3", "role": "second_branch"}, {"id": "b4", "role": "back_branch"}],
        "remove_branches": [{"id": "b2", "reason_vi": "Mọc đối với cành b1 cùng độ cao."}, {"id": "b5", "reason_vi": "Chĩa thẳng về người xem."}],
        "new_branches_needed": [{"at_px": p(0.505, 0.4), "direction": "left", "note_vi": "Nuôi một cành trái cho tầng tán thứ ba."}],
        "silhouette": {"width_px": round(w * 0.6), "height_px": round(h * 0.35), "pads": 4},
        "pot": {"shape": "oval", "color": "unglazed_brown", "position": "off_center_left"},
        "care_steps_vi": ["Bước 1: cắt b2, b5 sát thân, bôi keo liền sẹo.", "Bước 2: uốn dây cành b1 xuống khoảng 20°."],
    }
    preferred = [s for s in ("moyogi", "shakan", "bunjingi", "fukinagashi") if s in styles] or styles
    whys = ["(Dữ liệu mẫu) Thân đã có độ uốn tự nhiên; hạ ngọn để tỉ lệ vững hơn.",
            "(Dữ liệu mẫu) Cần nghiêng chậu khoảng 20°.", "(Dữ liệu mẫu) Bỏ gần hết cành dưới, giữ tán trên cao."]
    return {"options": [
        {**base, "style_key": s, "suitability": round(0.9 - 0.15 * i, 2), "why_vi": whys[i],
         "apex": {"point_px": p(0.515, 0.33), "lean": "slightly_left"}}
        for i, s in enumerate(preferred[:3])
    ]}


class DemoImage:
    """Ảnh "tương lai" mẫu: ảnh gốc + vài tầng tán vẽ đơn giản ở giữa ảnh (góc ảnh giữ nguyên để qua kiểm tra nền).

    Chỉ dùng ở APP_ENV=dev để chạy thử luồng phiên B khi chưa có khóa API.
    """

    name = "demo"

    def __init__(self, model: str = "demo"):
        self.model = model
        self.calls = 0

    def edit(self, *, prompt: str, images: list[ImageInput], n: int = 1, quality: str | None = None, mask: bytes | None = None) -> ImageResponse:
        from PIL import ImageDraw

        self.calls += 1
        base = Image.open(io.BytesIO(images[0].data)).convert("RGB") if images else Image.new("RGB", (768, 1024), (232, 225, 211))
        w, h = base.size
        draw = ImageDraw.Draw(base)
        import re

        shift = (self.calls % 3 - 1) * 0.02  # mỗi ứng viên hơi khác nhau
        m = re.search(r"Foliage density about (\d+)%", prompt)
        density = int(m.group(1)) / 100 if m else 1.0  # giai đoạn: tán nhỏ hơn ảnh cuối
        pads = [(0.34, 0.6, 0.2, 0.05), (0.66, 0.52, 0.17, 0.045), (0.42, 0.42, 0.14, 0.04), (0.53, 0.3, 0.15, 0.06)]
        for cx, cy, rx, ry in pads:
            cx += shift
            rx, ry = rx * (0.4 + 0.6 * density), ry * (0.4 + 0.6 * density)
            draw.ellipse([w * (cx - rx), h * (cy - ry), w * (cx + rx), h * (cy + ry)], fill=(63, 91, 58))
            draw.ellipse([w * (cx - rx * 0.8), h * (cy - ry * 1.1), w * (cx + rx * 0.8), h * (cy - ry * 0.1)], fill=(94, 140, 79))
        draw.polygon([(w * 0.3, h * 0.86), (w * 0.7, h * 0.86), (w * 0.66, h * 0.93), (w * 0.34, h * 0.93)], fill=(140, 90, 60))
        buf = io.BytesIO()
        base.save(buf, format="PNG")
        return ImageResponse(images=[buf.getvalue()] * n, usage=Usage(images_out=n), provider=self.name, model=self.model)


def _demo_plan() -> dict:
    def st(i, name, time, density, thick, actions):
        return {"id": i, "name_vi": name, "time_from_start": time, "visual_state_en": f"(demo) {name}",
                "foliage_density_pct": density, "trunk_thicken_pct_vs_original": thick, "actions_vi": actions,
                "best_season_vi": "Cuối đông – đầu xuân", "care_vi": ["Tưới khi mặt đất khô"],
                "ready_for_next_signs_vi": ["Cây ra chồi đều"], "common_mistakes_vi": ["Tháo dây muộn gây hằn vỏ"],
                "duration_to_next": "6–12 tháng"}

    return {"stages": [
        st("S1", "Tạo khung", "0 tháng", 40, 0, ["(Dữ liệu mẫu) Cắt b2, b5 sát thân", "Uốn dây nhôm 2,5 mm cành b1"]),
        st("S2", "Phục hồi và nuôi cành", "6–12 tháng", 80, 10, ["Để cành mọc tự do", "Bón phân tan chậm mỗi tháng"]),
        st("S3", "Định tầng tán", "2–3 năm", 70, 30, ["Cắt chừa 2 lá mỗi chồi", "Thay sang chậu gốm"]),
        st("S4", "Hoàn thiện", "4 năm", 85, 50, ["Tỉa chồi 2–3 lần mỗi năm"]),
    ]}


def _demo_guide() -> dict:
    names = [("S0", "Hiện trạng", "Hôm nay"), ("S1", "Tạo khung", "0 tháng"), ("S2", "Phục hồi và nuôi cành", "6–12 tháng"),
             ("S3", "Định tầng tán", "2–3 năm"), ("S4", "Hoàn thiện", "4 năm")]
    return {"stages": [
        {"id": i, "title_vi": f"Giai đoạn {n}: {name} — {time}", "see_vi": f"(Dữ liệu mẫu) Cây ở giai đoạn {name.lower()}.",
         "actions_vi": ["(Dữ liệu mẫu) Việc thứ nhất", "Việc thứ hai"], "best_time_vi": "Cuối đông – đầu xuân",
         "care_vi": ["Tưới đẫm khi mặt đất khô"], "ready_signs_vi": [] if i == "S4" else ["Cây ra chồi đều"],
         "common_mistakes_vi": ["Tháo dây muộn gây hằn vỏ."]}
        for n, (i, name, time) in enumerate(names)
    ], "disclaimer_vi": "Ảnh là minh hoạ định hướng; tốc độ thực tế phụ thuộc chăm sóc, khí hậu và sức khoẻ cây."}
