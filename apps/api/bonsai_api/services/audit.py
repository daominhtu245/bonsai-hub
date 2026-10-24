"""Ghi nhật ký thao tác admin (bảng admin_audit). Gọi trước commit để cùng transaction với thay đổi."""

from sqlalchemy.orm import Session

from ..db.models import AdminAudit, User


def audit(db: Session, admin: User | None, action: str, target_type: str | None = None, target_id: object = None,
          **detail) -> None:
    db.add(AdminAudit(admin_email=admin.email if admin else None, action=action, target_type=target_type,
                      target_id=str(target_id) if target_id is not None else None, detail=detail or None))
