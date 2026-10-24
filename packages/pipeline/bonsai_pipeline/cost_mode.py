"""Chế độ chi phí (admin bật/tắt; docs/decisions.md #29).

standard (A): AI chỉ làm phần cần AI — đọc ảnh + thiết kế (P1, P2) và sinh ảnh. Lộ trình (P2b), hướng dẫn (P6),
    tổng quan (P5) lấy từ bộ luật + thư viện hướng dẫn viết sẵn; ảnh kết quả được khóa thân/nền, đo trung thực
    trên máy rồi P4 chấm theo bảng chấm (bật lại 25/10/2026 sau phản hồi "đẹp nhưng sai", ~$0,02–0,04/lượt);
    1 ảnh kết quả chất lượng medium, ảnh giai đoạn chất lượng low.
economy (B): như A nhưng mọi ảnh chất lượng low, LLM dùng LLM_ECONOMY_MODEL.
full: quy trình đầy đủ ban đầu (3 ứng viên + VLM chấm + LLM viết lộ trình/hướng dẫn) — giữ để so sánh, không hiện ở admin.
"""

from __future__ import annotations

from dataclasses import dataclass

DEFAULT_MODE = "standard"


@dataclass(frozen=True)
class CostProfile:
    key: str
    llm_economy: bool  # dùng LLM_ECONOMY_MODEL
    llm_effort: str  # mức suy nghĩ cho P1/P2
    s4_candidates: int
    s4_quality: str
    stage_quality: str
    stage_retries: int  # sinh lại ảnh giai đoạn khi CV báo lỗi
    repair_rounds: int  # P3c sửa ảnh kết quả khi CV báo lỗi
    vlm_judge: bool  # P4 chấm ảnh bằng LLM
    llm_roadmap: bool  # P2b/P6/P5 bằng LLM (False → bộ luật + thư viện)


PROFILES: dict[str, CostProfile] = {
    "standard": CostProfile("standard", llm_economy=False, llm_effort="low", s4_candidates=1, s4_quality="medium",
                            stage_quality="low", stage_retries=1, repair_rounds=1, vlm_judge=True, llm_roadmap=False),
    "economy": CostProfile("economy", llm_economy=True, llm_effort="low", s4_candidates=1, s4_quality="low",
                           stage_quality="low", stage_retries=0, repair_rounds=0, vlm_judge=False, llm_roadmap=False),
    "full": CostProfile("full", llm_economy=False, llm_effort="medium", s4_candidates=3, s4_quality="medium",
                        stage_quality="medium", stage_retries=2, repair_rounds=2, vlm_judge=True, llm_roadmap=True),
}
ADMIN_MODES = ("standard", "economy")


def get_profile(mode: str | None) -> CostProfile:
    return PROFILES.get(mode or DEFAULT_MODE, PROFILES[DEFAULT_MODE])
