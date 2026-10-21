from dataclasses import dataclass


@dataclass(frozen=True)
class ExternalIdentity:
    provider: str  # google | zalo | dev
    subject: str
    email: str | None = None
    name: str | None = None
    avatar_url: str | None = None


class IdentityError(Exception):
    """Token/mã đăng nhập không hợp lệ."""
