import io

import numpy as np
from PIL import Image

from bonsai_api.db.models import Listing, Tree, TreePhoto
from bonsai_worker.tasks import market

from test_worker import _tree, bucket  # noqa: F401 (fixture)


def _photo(seed):
    rng = np.random.default_rng(seed)
    img = Image.fromarray(rng.integers(80, 230, (50, 34, 3), dtype=np.uint8)).resize((400, 600), Image.Resampling.BICUBIC)
    buf = io.BytesIO()
    img.save(buf, "WEBP")
    return buf.getvalue()


def test_listing_matches_stolen_tree(db, login, bucket, monkeypatch):  # noqa: F811
    from datetime import UTC, datetime

    pushed, alerts = [], []
    monkeypatch.setattr(market, "send_web_push", lambda db, uid, msg, base: pushed.append((uid, msg.path)) or 1)
    monkeypatch.setattr("bonsai_worker.tasks.monitoring.send_telegram", lambda text, **kw: alerts.append(text) or True)
    owner, tree = _tree(db, login, raw_key="trees/t/front.webp")
    bucket["trees/t/front.webp"] = _photo(1)
    db.get(Tree, tree.id).stolen_at = datetime.now(UTC)
    _, seller_body = login("seller@example.com")
    import uuid

    seller = uuid.UUID(seller_body["user"]["id"])
    same = Listing(user_id=seller, code="SAME0001", title="Si đẹp", photo_key="listings/a/photo.webp")
    other = Listing(user_id=seller, code="OTHR0001", title="Sanh", photo_key="listings/b/photo.webp")
    bucket["listings/a/photo.webp"], bucket["listings/b/photo.webp"] = _photo(1), _photo(7)
    db.add_all([same, other])
    db.commit()
    assert market.run_listing_created(db, same.id) == [tree.id]
    assert pushed == [(owner.id, "/tin/SAME0001")] and "SAME0001" in alerts[0]
    assert market.run_listing_created(db, other.id) == []
    # chính chủ cây đăng bán → không báo
    mine = Listing(user_id=owner.id, code="MINE0001", title="Si", photo_key="listings/a/photo.webp")
    db.add(mine)
    db.commit()
    assert market.run_listing_created(db, mine.id) == []
    assert db.get(TreePhoto, tree.photos[0].id).is_front
