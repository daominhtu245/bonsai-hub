import uuid

import pytest

from bonsai_api.db.models import User
from bonsai_api.services.credits import (
    InsufficientCredits,
    apply_credit,
    ledger_balance,
    refund_render,
    spend_for_render,
)
from bonsai_api.db.models import CreditReason


def _user(db, login):
    _, body = login()
    return db.get(User, uuid.UUID(body["user"]["id"]))


def test_spend_refund_is_idempotent(db, login):
    user = _user(db, login)
    job = uuid.uuid4()
    assert spend_for_render(db, user.id, job)
    assert not spend_for_render(db, user.id, job)  # gọi lại cùng job không trừ 2 lần
    db.commit()
    assert user.credits == 0
    assert refund_render(db, user.id, job)
    assert not refund_render(db, user.id, job)
    db.commit()
    db.refresh(user)
    assert user.credits == 1 == ledger_balance(db, user.id)


def test_refund_without_charge_is_noop(db, login):
    user = _user(db, login)
    assert not refund_render(db, user.id, uuid.uuid4())


def test_cannot_go_negative(db, login):
    user = _user(db, login)
    spend_for_render(db, user.id, uuid.uuid4())
    db.commit()
    with pytest.raises(InsufficientCredits):
        spend_for_render(db, user.id, uuid.uuid4())


def test_purchase_idempotent_by_payment(db, login):
    user = _user(db, login)
    assert apply_credit(db, user.id, 5, CreditReason.purchase, "pay-1")
    assert not apply_credit(db, user.id, 5, CreditReason.purchase, "pay-1")
    db.commit()
    db.refresh(user)
    assert user.credits == 6 == ledger_balance(db, user.id)
