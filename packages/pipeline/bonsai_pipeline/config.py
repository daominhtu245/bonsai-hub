from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class AISettings(BaseSettings):
    """Cấu hình AI — chỉ đọc trong tiến trình worker (khóa API không có ở api/web)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_provider: str = "anthropic"
    llm_model: str = "claude-sonnet-5-5"
    llm_fallback_provider: str | None = "gemini"
    llm_fallback_model: str | None = "gemini-flash-latest"
    llm_effort: str = "medium"
    llm_economy_model: str | None = None  # chế độ tiết kiệm (admin bật); trống → dùng llm_model
    llm_max_tokens: int = 16000

    image_provider: str = "gemini"
    image_model: str = "gemini-2.5-flash-image"
    image_fallback_provider: str | None = "openai"
    image_fallback_model: str | None = "gpt-image-1"

    anthropic_api_key: str | None = None
    gemini_api_key: str | None = None
    openai_api_key: str | None = None

    json_max_retries: int = 2
    image_max_retries: int = 3


@lru_cache
def get_ai_settings() -> AISettings:
    return AISettings()
