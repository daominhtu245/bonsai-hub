from urllib.parse import parse_qs, urlparse


def _presign(client, headers, **kw):
    body = {"content_type": "image/jpeg", "size_bytes": 2_000_000} | kw
    return client.post("/api/v1/uploads/presign", json=body, headers=headers)


def test_presign_put_url(client, login):
    headers, body = login()
    r = _presign(client, headers)
    assert r.status_code == 200
    out = r.json()
    assert out["key"].startswith(f"uploads/{body['user']['id']}/") and out["key"].endswith(".jpg")
    q = parse_qs(urlparse(out["url"]).query)
    assert q["X-Amz-Expires"] == ["3600"] and "X-Amz-Signature" in q
    assert out["headers"] == {"Content-Type": "image/jpeg"}


def test_presign_limits(client, login):
    headers, _ = login()
    assert _presign(client, headers, size_bytes=50_000_000).status_code == 413
    assert _presign(client, headers, content_type="application/pdf").status_code == 422
    assert client.post("/api/v1/uploads/presign", json={"content_type": "image/png", "size_bytes": 1}).status_code == 401


def test_create_list_get_tree(client, login, enqueued):
    headers, _ = login()
    keys = [_presign(client, headers).json()["key"] for _ in range(2)]
    r = client.post(
        "/api/v1/trees",
        headers=headers,
        json={"nickname": "Si gốc lũa", "species_key": "si", "real_height_cm": 45,
              "photos": [{"key": keys[0], "view_index": 0}, {"key": keys[1], "view_index": 1, "is_front": True}]},
    )
    assert r.status_code == 201, r.text
    tree = r.json()
    assert [p["is_front"] for p in tree["photos"]] == [False, True]
    assert enqueued == [("bonsai_worker.tasks.preprocess.normalize_tree_photos", (tree["id"],))]

    listed = client.get("/api/v1/trees", headers=headers).json()
    assert [t["id"] for t in listed] == [tree["id"]]
    assert all("X-Amz-Signature" in p["url"] for p in listed[0]["photos"])

    other, _ = login("khac@example.com")
    assert client.get(f"/api/v1/trees/{tree['id']}", headers=other).status_code == 404
    assert client.get(f"/api/v1/trees/{tree['id']}", headers=headers).status_code == 200


def test_tree_rejects_foreign_keys_and_unknown_species(client, login):
    headers, _ = login()
    other, _ = login("khac@example.com")
    foreign = _presign(client, other).json()["key"]
    r = client.post("/api/v1/trees", headers=headers, json={"photos": [{"key": foreign, "view_index": 0}]})
    assert r.status_code == 400
    mine = _presign(client, headers).json()["key"]
    r = client.post("/api/v1/trees", headers=headers,
                    json={"species_key": "thong", "photos": [{"key": mine, "view_index": 0}]})
    assert r.status_code == 400
    r = client.post("/api/v1/trees", headers=headers, json={"photos": []})
    assert r.status_code == 422


def test_catalog(client):
    species = client.get("/api/v1/species").json()
    assert {s["key"] for s in species} == {"si", "sanh", "mai_chieu_thuy", "tung_la_han", "linh_sam"}
    styles = {s["key"]: s for s in client.get("/api/v1/styles").json()}
    assert styles["moyogi"]["name_vi"] == "Trực uốn" and styles["vn_long"]["name_jp"] is None
