import hmac
import json
import time
import uuid
from collections.abc import Iterator

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select

from ..db.models import Payment
from ..db.session import get_sessionmaker
from ..security import DB, CurrentUser
from ..services.payments import (
    PACKAGE_BY_CODE, PACKAGES, BankNotConfigured, apply_bank_txn, create_payment, expire_if_stale, parse_casso,
    parse_sepay, vietqr_url,
)
from ..ratelimit import per_ip
from ..settings import get_settings

router = APIRouter(tags=["payments"])


class PackageOut(BaseModel):
    code: str
    name_vi: str
    credits: int
    amount_vnd: int
    note_vi: str
    popular: bool
    nursery: bool


class PaymentIn(BaseModel):
    package_code: str


class PaymentOut(BaseModel):
    id: uuid.UUID
    package_code: str
    amount_vnd: int
    transfer_code: str
    transfer_code_display: str
    status: str
    qr_url: str | None
    bank_name: str | None
    bank_account: str | None
    bank_account_name: str | None
    credits_left: int


def _out(p: Payment, credits: int) -> PaymentOut:
    s = get_settings()
    try:
        qr = vietqr_url(p.amount_vnd, p.transfer_code)
    except BankNotConfigured:
        qr = None
    return PaymentOut(
        id=p.id, package_code=p.package_code, amount_vnd=p.amount_vnd, transfer_code=p.transfer_code,
        transfer_code_display=f"{p.transfer_code[:6]} {p.transfer_code[6:]}", status=p.status.value, qr_url=qr,
        bank_name=s.bank_name, bank_account=s.bank_account, bank_account_name=s.bank_account_name, credits_left=credits,
    )


@router.get("/packages", response_model=list[PackageOut])
def packages():
    return [PackageOut(**p.__dict__) for p in PACKAGES]


@router.post("/payments", response_model=PaymentOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(per_ip("payments", 20, 3600))])
def new_payment(body: PaymentIn, user: CurrentUser, db: DB):
    package = PACKAGE_BY_CODE.get(body.package_code)
    if package is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Gói không tồn tại.")
    if not (get_settings().bank_bin and get_settings().bank_account):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Thanh toán chưa được cấu hình. Bạn quay lại sau nhé.")
    return _out(create_payment(db, user, package), user.credits)


def _own_payment(db, payment_id: uuid.UUID, user) -> Payment:
    p = db.get(Payment, payment_id)
    if p is None or p.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy đơn.")
    expire_if_stale(db, p)
    return p


@router.get("/payments", response_model=list[PaymentOut])
def list_payments(user: CurrentUser, db: DB):
    rows = db.execute(select(Payment).where(Payment.user_id == user.id).order_by(Payment.created_at.desc()).limit(50)).scalars()
    return [_out(p, user.credits) for p in rows]


@router.get("/payments/{payment_id}", response_model=PaymentOut)
def get_payment(payment_id: uuid.UUID, user: CurrentUser, db: DB):
    p = _own_payment(db, payment_id, user)
    db.refresh(user)
    return _out(p, user.credits)


def _payment_stream(payment_id: uuid.UUID, poll: float, max_seconds: float) -> Iterator[str]:
    started, last = time.monotonic(), None
    yield "retry: 3000\n\n"
    while time.monotonic() - started < max_seconds:
        with get_sessionmaker()() as db:
            p = db.get(Payment, payment_id)
            snap = {"status": p.status.value if p else "cancelled"}
        if snap != last:
            last = snap
            yield f"event: payment\ndata: {json.dumps(snap)}\n\n"
            if snap["status"] != "pending":
                return
        else:
            yield ": ping\n\n"
        time.sleep(poll)


POLL_SECONDS = 2.0


@router.get("/payments/{payment_id}/events")
def payment_events(payment_id: uuid.UUID, user: CurrentUser, db: DB):
    _own_payment(db, payment_id, user)
    return StreamingResponse(_payment_stream(payment_id, POLL_SECONDS, 30 * 60), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _eq(a: str | None, b: str | None) -> bool:
    return bool(a and b) and hmac.compare_digest(a.encode(), b.encode())


@router.post("/webhooks/bank", include_in_schema=False)
async def bank_webhook(
    request: Request,
    db: DB,
    authorization: str | None = Header(default=None),
    secure_token: str | None = Header(default=None),
):
    """SePay: header `Authorization: Apikey <key>`. Casso: header `Secure-Token: <token>`. Gọi lại nhiều lần vẫn an toàn."""
    s = get_settings()
    body = await request.json()
    if authorization and authorization.lower().startswith("apikey ") and _eq(authorization[7:].strip(), s.sepay_api_key):
        txns = parse_sepay(body)
    elif _eq(secure_token, s.casso_secure_token):
        txns = parse_casso(body)
    else:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid signature")
    results = [apply_bank_txn(db, t) for t in txns]
    return {"success": True, "results": results}

