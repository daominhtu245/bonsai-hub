"""Nhắc việc theo thời tiết (docs/ideas.md E2): dự báo 3 ngày từ Open-Meteo (miễn phí, không cần khóa) → cảnh báo
mưa to / nắng nóng / rét / gió mạnh kèm việc nên làm. Ngưỡng + lời khuyên ở pests.weather_alerts (nghệ nhân chỉnh)."""

from __future__ import annotations

from dataclasses import asdict, dataclass

import httpx

from .dictionaries import rule_doc

URL = "https://api.open-meteo.com/v1/forecast"
DAILY = "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max"


@dataclass
class Alert:
    date: str
    kind: str  # heavy_rain | heat | cold | wind
    title_vi: str
    advice_vi: str
    value: float


def fetch(lat: float, lon: float, client: httpx.Client | None = None, days: int = 3) -> dict:
    params = {"latitude": lat, "longitude": lon, "daily": DAILY, "timezone": "Asia/Ho_Chi_Minh", "forecast_days": days}
    c = client or httpx.Client(timeout=10)
    try:
        r = c.get(URL, params=params)
        r.raise_for_status()
        return r.json()["daily"]
    finally:
        if client is None:
            c.close()


def alerts(daily: dict) -> list[Alert]:
    cfg = rule_doc("pests").get("weather_alerts") or {}
    out: list[Alert] = []
    days = daily.get("time") or []
    for i, d in enumerate(days):
        def val(k):
            v = (daily.get(k) or [None] * len(days))[i]
            return float(v) if v is not None else None

        checks = [
            ("heavy_rain", val("precipitation_sum"), lambda v, c: v >= c["mm"]),
            ("heat", val("temperature_2m_max"), lambda v, c: v >= c["max_c"]),
            ("cold", val("temperature_2m_min"), lambda v, c: v <= c["min_c"]),
            ("wind", val("wind_speed_10m_max"), lambda v, c: v >= c["kmh"]),
        ]
        for kind, v, hit in checks:
            c = cfg.get(kind)
            if c and v is not None and hit(v, c):
                out.append(Alert(d, kind, c["title_vi"], c["advice_vi"], v))
    return out


def summary(daily: dict) -> list[dict]:
    days = daily.get("time") or []
    return [{"date": d, "max_c": daily["temperature_2m_max"][i], "min_c": daily["temperature_2m_min"][i],
             "rain_mm": daily["precipitation_sum"][i], "wind_kmh": daily["wind_speed_10m_max"][i]} for i, d in enumerate(days)]


def as_dicts(items: list[Alert]) -> list[dict]:
    return [asdict(a) for a in items]
