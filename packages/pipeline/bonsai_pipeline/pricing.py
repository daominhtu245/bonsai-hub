"""Đơn giá để tính `cost_usd` cho mỗi bước (docs/architecture.md §6).

Giá thay đổi theo thời gian: cập nhật bảng này, không sửa logic tính.
Khóa là tiền tố tên model, khớp tiền tố dài nhất.
"""

from dataclasses import dataclass

from .adapters.base import Usage


@dataclass(frozen=True)
class Price:
    in_per_mtok: float = 0.0
    out_per_mtok: float = 0.0
    per_image: float = 0.0


PRICES: dict[str, Price] = {
    "claude-sonnet-5-5": Price(2.0, 10.0),
    "claude-opus-5-5": Price(4.0, 20.0),
    "claude-haiku-5-5": Price(0.10, 0.50),
    "gemini-flash": Price(0.30, 2.50),
    "gemini-2.5-flash-image": Price(1.50, 0.0, 0.0336),
    "gemini-3-pro-image": Price(2.0, 0.0, 0.134),
    "gpt-image-1": Price(5.0, 0.0, 0.042),
    "fake": Price(0.0, 0.0, 0.0),
}


def price_for(model: str) -> Price:
    best = ""
    for key in PRICES:
        if model.startswith(key) and len(key) > len(best):
            best = key
    return PRICES.get(best, Price())


def cost_usd(model: str, usage: Usage) -> float:
    p = price_for(model)
    cost = (
        usage.tokens_in * p.in_per_mtok / 1_000_000
        + usage.tokens_out * p.out_per_mtok / 1_000_000
        + usage.images_out * p.per_image
    )
    return round(cost, 6)
