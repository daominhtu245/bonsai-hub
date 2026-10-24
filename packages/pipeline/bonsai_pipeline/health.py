"""Chụp lá đoán sâu bệnh (docs/ideas.md E3).

- Không có AI: chấm theo dấu hiệu người dùng tick (bảng rules/pests.yaml).
- Có AI (prompt H1): model nhìn ảnh + dấu hiệu, chỉ được CHỌN mã trong bảng (kèm khả năng + lý do). Cách xử lý luôn lấy
  nguyên văn từ bảng — model không tự viết thuốc / liều (luật cứng kiểm mã).
"""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, Field

from .adapters.base import ImageInput
from .adapters.llm_client import LLMClient
from .dictionaries import rule_doc
from .phase_a import PromptTemplate
from .prompts import render
from .steps import StepRecord

Likelihood = Literal["low", "medium", "high"]
LIKELIHOOD_VI = {"low": "Có thể", "medium": "Khá giống", "high": "Rất giống"}


class Pick(BaseModel):
    key: str
    likelihood: Likelihood
    reason_vi: str = Field(max_length=300)


class H1Out(BaseModel):
    usable: bool  # ảnh có đủ rõ lá / cành để nhận xét không
    issue_vi: str | None = None  # ảnh chưa dùng được thì vì sao
    picks: list[Pick] = Field(default_factory=list, max_length=3)
    healthy: bool = False


def table() -> dict:
    return rule_doc("pests")


def symptoms() -> list[dict]:
    return [{"code": k, "label_vi": v} for k, v in (table().get("symptoms") or {}).items()]


def _finding(key: str, likelihood: Likelihood, reason: str | None) -> dict:
    it = table()["items"][key]
    return {"key": key, "name_vi": it["name_vi"], "kind": it.get("kind"), "likelihood": likelihood, "likelihood_vi": LIKELIHOOD_VI[likelihood],
            "reason_vi": reason, "signs_vi": it.get("signs_vi"), "treat_now_vi": list(it.get("treat_now_vi") or []),
            "prevent_vi": list(it.get("prevent_vi") or []), "see_expert_if_vi": it.get("see_expert_if_vi")}


def from_symptoms(codes: list[str]) -> dict:
    """Không AI: điểm = tỉ lệ dấu hiệu khớp, ưu tiên mục có nhiều dấu hiệu khớp."""
    chosen = set(codes)
    scored = []
    for key, it in (table().get("items") or {}).items():
        sym = set(it.get("symptoms") or [])
        hit = len(sym & chosen)
        if hit:
            scored.append((hit / len(sym) + 0.1 * hit, key))
    scored.sort(reverse=True)
    out = []
    for score, key in scored[:3]:
        lk: Likelihood = "high" if score >= 0.9 else "medium" if score >= 0.5 else "low"
        out.append(_finding(key, lk, None))
    return {"method": "symptoms", "usable": True, "healthy": False, "findings": out}


def _hard_rules(v: H1Out) -> list[str]:
    keys = set((table().get("items") or {}).keys())
    bad = [p.key for p in v.picks if p.key not in keys]
    return [f"picks.key must be one of {sorted(keys)}; got {bad}"] if bad else []


def run_h1(llm: LLMClient, prompt: PromptTemplate, photo: bytes, codes: list[str], species_vi: str | None) -> tuple[dict, StepRecord]:
    t = table()
    catalog = {k: {"name_vi": v["name_vi"], "signs_vi": v.get("signs_vi"), "symptoms": v.get("symptoms")} for k, v in t["items"].items()}
    variables = {
        "catalog_json": json.dumps(catalog, ensure_ascii=False),
        "symptoms_json": json.dumps([t["symptoms"][c] for c in codes if c in t["symptoms"]], ensure_ascii=False),
        "species_vi": species_vi or "chưa rõ",
    }
    res = llm.complete_json(system=render(prompt.system or "", variables), user=render(prompt.user, variables), schema=H1Out,
                            images=[ImageInput(photo)], max_tokens=2000, hard_rules=_hard_rules)
    v = res.value
    out = {"method": "ai", "usable": v.usable, "issue_vi": v.issue_vi, "healthy": v.healthy,
           "findings": [_finding(p.key, p.likelihood, p.reason_vi) for p in v.picks] if v.usable else []}
    return out, StepRecord.from_trace("H1", res.trace, prompt_version=prompt.version_tag, ok=True, output=res.raw)
