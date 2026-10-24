"""Gói lượt + VietQR + đối soát webhook ngân hàng (SePay / Casso). Cộng lượt idempotent."""

from __future__ import annotations

import logging
import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import quote, urlencode

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db.models import CreditReason, Payment, PaymentStatus, User, UserRole
from ..settings import get_settings
from .credits import apply_credit

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Package:
    code: str
    name_vi: str
    credits: int
    amount_vnd: int
    note_vi: str
    popular: bool = False
    nursery: bool = False


# docs/architecture.md §6: lẻ 49.000 đ; người chơi 199.000 đ/5 lượt; nhà vườn 1.490.000 đ/50 lượt.
PACKAGES = [
    Package("le", "Lẻ", 1, 49_000, "Thử với một cây"),
    Package("player", "Người chơi", 5, 199_000, "39.800 đ mỗi lượt", popular=True),
    Package("nursery", "Nhà vườn", 50, 1_490_000, "29.800 đ mỗi lượt · ảnh có logo và SĐT", nursery=True),
]
PACKAGE_BY_CODE = {p.code: p for p in PACKAGES}

PREFIX = "BONSAI"
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
# Ngân hàng hay bỏ dấu cách / thêm chữ vào nội dung: chấp nhận "BONSAI 8F3K2", "BONSAI8F3K2", "...bonsai-8f3k2...".
_CODE_RE = re.compile(rf"{PREFIX}[\s\-_.]*([{_CODE_ALPHABET}]{{5}})", re.IGNORECASE)


class BankNotConfigured(Exception):
    pass


def new_transfer_code() -> str:
    return f"{PREFIX} " + "".join(secrets.choice(_CODE_ALPHABET) for _ in range(5))


def normalize_code(code: str) -> str:
    return code.replace(" ", "").upper()


def extract_code(content: str) -> str | None:
    m = _CODE_RE.search(content or "")
    return f"{PREFIX}{m.group(1).upper()}" if m else None


def vietqr_url(amount: int, transfer_code: str) -> str:
    s = get_settings()
    if not (s.bank_bin and s.bank_account):
        raise BankNotConfigured()
    q = {"amount": amount, "addInfo": transfer_code}
    if s.bank_account_name:
        q["accountName"] = s.bank_account_name
    return f"https://img.vietqr.io/image/{s.bank_bin}-{quote(s.bank_account)}-compact2.png?{urlencode(q)}"


def create_payment(db: Session, user: User, package: Package) -> Payment:
    for _ in range(5):
        p = Payment(user_id=user.id, amount_vnd=package.amount_vnd, package_code=package.code, credits=package.credits,
                    transfer_code=normalize_code(new_transfer_code()), status=PaymentStatus.pending)
        db.add(p)
        try:
            db.commit()
            return p
        except IntegrityError:  # trùng mã (rất hiếm) → sinh lại
            db.rollback()
    raise RuntimeError("could not allocate a transfer code")


def expire_if_stale(db: Session, p: Payment) -> None:
    ttl = timedelta(hours=get_settings().payment_ttl_hours)
    if p.status == PaymentStatus.pending and p.created_at < datetime.now(UTC) - ttl:
        p.status = PaymentStatus.expired
        db.commit()


@dataclass
class BankTxn:
    provider: str
    txn_id: str
    content: str
    amount: int
    raw: dict


def parse_sepay(body: dict) -> list[BankTxn]:
    if body.get("transferType", "in") != "in":
        return []
    return [BankTxn("sepay", str(body["id"]), body.get("content") or body.get("description") or "",
                    int(body.get("transferAmount") or 0), body)]


def parse_casso(body: dict) -> list[BankTxn]:
    data = body.get("data") or []
    if isinstance(data, dict):
        data = [data]
    out = []
    for t in data:
        amount = int(t.get("amount") or 0)
        if amount <= 0:
            continue  # tiền ra
        out.append(BankTxn("casso", str(t.get("id") or t.get("tid")), t.get("description") or "", amount, t))
    return out


def apply_bank_txn(db: Session, txn: BankTxn) -> str:
    """Trả kết quả: credited | duplicate | unmatched | underpaid | not_pending."""
    if db.execute(select(Payment.id).where(Payment.provider_txn_id == f"{txn.provider}:{txn.txn_id}")).first():
        return "duplicate"
    code = extract_code(txn.content)
    if code is None:
        log.info("bank txn %s:%s has no transfer code", txn.provider, txn.txn_id)
        return "unmatched"
    payment = db.execute(select(Payment).where(Payment.transfer_code == code).with_for_update()).scalar_one_or_none()
    if payment is None:
        return "unmatched"
    if payment.status != PaymentStatus.pending and payment.status != PaymentStatus.expired:
        return "not_pending"
    if txn.amount < payment.amount_vnd:
        payment.raw = {"underpaid": txn.raw, "received": txn.amount}
        db.commit()
        log.warning("payment %s underpaid: %s < %s", payment.id, txn.amount, payment.amount_vnd)
        return "underpaid"
    package = PACKAGE_BY_CODE[payment.package_code]
    credits = payment.credits or package.credits  # số lượt chốt lúc tạo đơn (đơn cũ: theo gói)
    payment.status = PaymentStatus.paid
    payment.paid_at = datetime.now(UTC)
    payment.provider = txn.provider
    payment.provider_txn_id = f"{txn.provider}:{txn.txn_id}"
    payment.raw = txn.raw
    apply_credit(db, payment.user_id, credits, CreditReason.purchase, str(payment.id))
    if package.nursery:
        user = db.get(User, payment.user_id)
        if user.role == UserRole.player:
            user.role = UserRole.nursery
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return "duplicate"
    return "credited"
