from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth.identity import ExternalIdentity
from ..db.models import AuthProvider, CreditReason, User, UserRole
from ..settings import get_settings
from .credits import apply_credit

_SUBJECT_COLUMN = {"google": User.google_sub, "zalo": User.zalo_id, "dev": User.email}


def get_or_create_user(db: Session, ident: ExternalIdentity) -> tuple[User, bool]:
    """Tìm hoặc tạo user; user mới được tặng lượt dùng thử. Trả (user, created)."""
    col = _SUBJECT_COLUMN[ident.provider]
    user = db.execute(select(User).where(col == ident.subject)).scalar_one_or_none()
    if user is None and ident.email:
        # Cùng email đã đăng nhập bằng cách khác → gộp tài khoản.
        user = db.execute(select(User).where(User.email == ident.email)).scalar_one_or_none()
        if user is not None and ident.provider == "google":
            user.google_sub = ident.subject
    is_admin = bool(ident.email) and ident.email.lower() in {e.lower() for e in get_settings().admin_emails}
    if user is not None:
        if is_admin:
            user.role = UserRole.admin
        user.name = user.name or ident.name
        user.avatar_url = ident.avatar_url or user.avatar_url
        db.commit()
        return user, False

    user = User(auth_provider=AuthProvider(ident.provider), email=ident.email, name=ident.name,
                avatar_url=ident.avatar_url, credits=0, role=UserRole.admin if is_admin else UserRole.player)
    if ident.provider == "google":
        user.google_sub = ident.subject
    elif ident.provider == "zalo":
        user.zalo_id = ident.subject
    db.add(user)
    try:
        db.flush()
        trial = get_settings().trial_credits
        if trial > 0:
            apply_credit(db, user.id, trial, CreditReason.gift, "trial")
        db.commit()
    except IntegrityError:
        # Hai request đăng nhập song song: bản kia đã tạo trước.
        db.rollback()
        return db.execute(select(User).where(col == ident.subject)).scalar_one(), False
    return user, True
