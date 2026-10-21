from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Cấu hình api. Không chứa khóa AI — khóa đó chỉ có ở worker."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "dev"
    database_url: str = "postgresql+psycopg://bonsai:bonsai@localhost:5432/bonsai"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "dev-secret-change-me"
    jwt_ttl_hours: int = 720
    jwt_algorithm: str = "HS256"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    google_client_id: str | None = None
    zalo_app_id: str | None = None
    zalo_app_secret: str | None = None

    r2_endpoint: str | None = None
    # Endpoint trình duyệt dùng cho URL ký sẵn, khi khác endpoint nội bộ (vd. MinIO local: http://localhost:9000).
    r2_public_endpoint: str | None = None
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None
    r2_bucket: str = "bonsai-private"
    presign_ttl_seconds: int = 3600
    max_upload_bytes: int = 20 * 1024 * 1024

    public_base_url: str = "http://localhost:8080"
    admin_emails: Annotated[list[str], NoDecode] = []

    # VietQR: tài khoản nhận tiền (BIN theo danh sách napas, vd. 970436 = Vietcombank)
    bank_bin: str | None = None
    bank_account: str | None = None
    bank_account_name: str | None = None
    bank_name: str | None = None
    sepay_api_key: str | None = None
    casso_secure_token: str | None = None
    payment_ttl_hours: int = 24

    trial_credits: int = 1
    phase_a_daily_limit: int = 10

    @field_validator("cors_origins", "admin_emails", mode="before")
    @classmethod
    def _split_origins(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @property
    def is_dev(self) -> bool:
        return self.app_env == "dev"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if not s.is_dev and s.jwt_secret == "dev-secret-change-me":
        raise RuntimeError("JWT_SECRET must be set outside dev")
    return s
