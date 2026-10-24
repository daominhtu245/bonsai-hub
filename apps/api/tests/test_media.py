from bonsai_api.db.models import DesignJob

from test_week5 import _done_job, bucket  # noqa: F401 (fixture)


def test_art_styles_are_generated_once_and_cached(db, client, login, bucket):  # noqa: F811
    headers, job = _done_job(db, client, login, bucket)
    out = client.get(f"/api/v1/jobs/{job.id}/art?style=pencil", headers=headers).json()
    assert set(out) == {"S0", "S4"}
    keys = [k for k in bucket if "/art/" in k]
    assert sorted(k.rsplit("/", 1)[1] for k in keys) == ["S0_pencil.webp", "S4_pencil.webp"]
    before = dict(bucket)
    client.get(f"/api/v1/jobs/{job.id}/art?style=pencil", headers=headers)
    assert {k: v for k, v in bucket.items() if "/art/" in k} == {k: v for k, v in before.items() if "/art/" in k}
    assert client.get(f"/api/v1/jobs/{job.id}/art?style=oil", headers=headers).status_code == 422
    other, _ = login("other@example.com")
    assert client.get(f"/api/v1/jobs/{job.id}/art?style=ink", headers=other).status_code == 404


def test_video_and_cutout_are_queued(db, client, login, bucket, monkeypatch):  # noqa: F811
    headers, job = _done_job(db, client, login, bucket)
    sent = []
    monkeypatch.setattr("bonsai_api.queue.enqueue", lambda *a, **kw: sent.append((a, kw)) or True)
    assert client.get(f"/api/v1/jobs/{job.id}/video", headers=headers).json()["state"] == "none"
    r = client.post(f"/api/v1/jobs/{job.id}/video", headers=headers)
    assert r.status_code == 202 and r.json()["state"] == "running"
    assert client.post(f"/api/v1/jobs/{job.id}/video", headers=headers).json()["state"] == "running"  # không gửi lại
    assert [a[0] for a, _ in sent] == ["bonsai_worker.tasks.media.timelapse"]
    j = db.get(DesignJob, job.id)
    db.refresh(j)
    j.progress = {**j.progress, "media": {"video": {"state": "done", "key": "trees/t/timelapse.mp4", "content_type": "video/mp4"}}}
    db.commit()
    v = client.get(f"/api/v1/jobs/{job.id}/video", headers=headers).json()
    assert v["state"] == "done" and v["url"] and v["content_type"] == "video/mp4"
    assert client.post(f"/api/v1/jobs/{job.id}/cutout", headers=headers).json()["state"] == "running"
    monkeypatch.setattr("bonsai_api.queue.enqueue", lambda *a, **kw: False)
    j = db.get(DesignJob, job.id)
    db.refresh(j)
    j.progress = {**j.progress, "media": {}}
    db.commit()
    assert client.post(f"/api/v1/jobs/{job.id}/cutout", headers=headers).status_code == 503
