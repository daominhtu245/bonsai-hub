"""Hỏi đáp chăm cây (docs/ideas.md E4) — người dùng nói / gõ câu hỏi tiếng Việt.

- Không AI: tìm chủ đề theo từ khóa (tưới, bón, cắt tỉa, uốn dây, tuốt lá, thay chậu, nắng) rồi trả lời từ bảng loài
  (rules/species.yaml) — luôn có câu trả lời, không tốn tiền.
- Có AI (prompt Q1, model rẻ): trả lời ngắn dựa trên dữ kiện loài + cây của người hỏi; không chắc thì nói "nên hỏi nghệ nhân".
"""

from __future__ import annotations

import json
import re
import unicodedata

from pydantic import BaseModel, Field

from .adapters.llm_client import LLMClient
from .dictionaries import species_rules
from .phase_a import PromptTemplate
from .prompts import render
from .steps import StepRecord

# chủ đề → (từ khóa có dấu, trường trong species.yaml, câu mở đầu)
TOPICS: list[tuple[str, tuple[str, ...], str, str]] = [
    ("defoliation", ("tuốt lá", "lặt lá"), "defoliation", "Tuốt lá"),
    ("wiring", ("uốn", "dây", "quấn dây", "nắn"), "wiring", "Uốn dây"),
    ("pruning", ("cắt", "tỉa", "bấm ngọn"), "pruning", "Cắt tỉa"),
    ("repot", ("thay chậu", "thay đất", "sang chậu", "cắt rễ"), "root_pruning", "Thay chậu, cắt rễ"),
    ("light", ("nắng", "ánh sáng", "để đâu", "che"), "light", "Ánh nắng"),
    ("graft", ("ghép",), "graft_season", "Ghép cành"),
]
GENERIC = {
    "water": ("tưới", "nước", "ẩm"),
    "fertilize": ("bón", "phân"),
}
GENERIC_VI = {
    "water": "Tưới khi mặt đất se khô (ấn ngón tay 1–2 cm thấy khô), tưới đẫm tới khi nước chảy ra lỗ chậu; mùa nóng có thể 1–2 lần/ngày, mùa mưa giảm.",
    "fertilize": "Bón ít mà đều trong mùa cây lớn (xuân – thu), giảm khi cây nghỉ hoặc vừa thay chậu, cắt rễ; không bón lúc cây yếu, héo.",
}
_SRC = re.compile(r"\s*\[[^\]]+\]")


def _plain(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower()).replace("đ", "d")
    return "".join(ch for ch in s if unicodedata.category(ch) != "Mn")


def _has(q: str, words: tuple[str, ...], accented: bool) -> bool:
    """Câu có dấu: so từ có dấu ("đầy" ≠ "dây"); gõ không dấu: so bản bỏ dấu."""
    return any(re.search(rf"\b{re.escape(w if accented else _plain(w))}\b", q) for w in words)


def offline_answer(question: str, species_key: str | None) -> dict:
    accented = _plain(question) != question.lower()
    q = question.lower() if accented else _plain(question)
    sp = species_rules().get(species_key or "other") or {}
    name = sp.get("name_vi", "cây")
    parts: list[str] = []
    topics: list[str] = []
    for key, words, field, label in TOPICS:
        if _has(q, words, accented):
            text = sp.get(field)
            if key == "repot" and sp.get("repot_years"):
                yrs = sp["repot_years"]
                yrs = yrs.get("young", yrs) if isinstance(yrs, dict) else yrs
                text = f"thay chậu {yrs[0]}–{yrs[1]} năm/lần" + (f"; {text}" if text else "")
            if text:
                parts.append(f"{label} ({name}): {_SRC.sub('', str(text))}.")
                topics.append(key)
    for key, words in GENERIC.items():
        if _has(q, words, accented):
            parts.append(GENERIC_VI[key])
            topics.append(key)
    if not parts:
        return {"answer_vi": "Mình chưa hiểu rõ câu hỏi. Bạn hỏi cụ thể về tưới, bón, cắt tỉa, uốn dây, tuốt lá hoặc thay chậu nhé — hoặc nhờ nghệ nhân góp ý.",
                "topics": [], "method": "offline", "suggest_expert": True}
    return {"answer_vi": " ".join(parts), "topics": topics, "method": "offline", "suggest_expert": False}


class Q1Out(BaseModel):
    answer_vi: str = Field(max_length=1200)
    confident: bool


def run_q1(llm: LLMClient, prompt: PromptTemplate, question: str, species_key: str | None, tree_context: dict | None) -> tuple[dict, StepRecord]:
    sp = species_rules().get(species_key or "other") or {}
    variables = {"question": question, "species_json": json.dumps(sp, ensure_ascii=False),
                 "tree_json": json.dumps(tree_context or {}, ensure_ascii=False)}
    res = llm.complete_json(system=render(prompt.system or "", variables), user=render(prompt.user, variables), schema=Q1Out, max_tokens=1500)
    v = res.value
    out = {"answer_vi": v.answer_vi, "topics": [], "method": "ai", "suggest_expert": not v.confident}
    return out, StepRecord.from_trace("Q1", res.trace, prompt_version=prompt.version_tag, ok=True, output=res.raw)
