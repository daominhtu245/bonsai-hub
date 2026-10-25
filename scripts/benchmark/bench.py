"""Bộ đo chất lượng ảnh kết quả (docs/quality-plan.md, Q0): cùng một bộ phôi cố định, mỗi lần đổi prompt / luật / cách
khóa vùng thì chạy lại cả bộ và so tỉ lệ đạt trước / sau.

    # 1. Dựng danh sách phôi (từ ảnh đã tải + ảnh chụp thật bỏ vào data/benchmark/photos/<mã>/)
    .venv/bin/python scripts/benchmark/bench.py seed --n 20          # gợi ý từ data/web (ảnh phôi tách nền đạt)
    .venv/bin/python scripts/benchmark/bench.py check                # kiểm ảnh: mờ, tối, nhỏ, tách nền — không tốn API
    # 2. Chạy (TỐN TIỀN API: ước tính in ra trước, cần --yes)
    .venv/bin/python scripts/benchmark/bench.py run --label p3a-v3 [--base http://127.0.0.1:8080] [--yes]
    # 3. Báo cáo (tự gom điểm nghệ nhân chấm ở /admin/cham-diem nếu đã có)
    .venv/bin/python scripts/benchmark/bench.py report data/benchmark/runs/<lần chạy> [--compare data/benchmark/runs/<lần trước>]

Đăng nhập: máy local (APP_ENV=dev) tự lấy token qua /auth/dev; máy chủ thật đặt BENCH_TOKEN (tài khoản chạy đo) và
ADMIN_TOKEN (quản trị — tặng lượt, đọc chi tiết phiên, điểm nghệ nhân).
"""

from __future__ import annotations

import argparse
import html
import io
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

import numpy as np
import yaml
from PIL import Image, ImageOps

REPO = Path(__file__).resolve().parents[2]
BENCH = REPO / "data" / "benchmark"
CASES = BENCH / "cases.yaml"
PHOTOS = BENCH / "photos"
RUNS = BENCH / "runs"
FAIL_VI = {  # cùng mã với bảng chấm (rules/judging.yaml) và fidelity.py
    "trunk_changed": "Thân bị đổi", "trunk_too_thick": "Thân to quá mức", "removed_branch_present": "Cành phải cắt vẫn còn",
    "extra_trunk_or_major_branch": "Mọc thêm thân / cành lớn", "wrong_species_foliage": "Sai loại lá", "camera_or_background_changed": "Đổi góc chụp / nền",
    "pot_style_wrong": "Chậu khác thiết kế", "pads_missing": "Thiếu tầng lá", "foliage_outside_design": "Lá ngoài thiết kế", "apex_off": "Ngọn lệch",
    "text_artifact": "Có chữ / vết lạ", "pasted_look": "Trông như dán ghép",
}
COST_PER_CASE_USD = 0.45  # phân tích + 1 lần tạo ảnh chế độ Tiêu chuẩn (≈ $0,40) + chấm; xem Chi phí AI để chỉnh
SPECIES_OK = {"si", "sanh", "mai_chieu_thuy", "tung_la_han", "linh_sam", None}  # None = chưa rõ loài, để P1 tự nhận


# ---------- danh sách phôi ----------

def load_cases() -> list[dict]:
    if not CASES.exists():
        sys.exit(f"Chưa có {CASES.relative_to(REPO)} — chạy `bench.py seed` hoặc tự viết (xem README trong thư mục).")
    return yaml.safe_load(CASES.read_text())["cases"]


def seed(n: int) -> None:
    """Chọn n ảnh phôi từ data/web (CLIP "phoi" điểm cao, tách nền đạt), chia đều theo loài → cases.yaml + chép ảnh."""
    web = REPO / "data" / "web"
    manifest = {r["uid"]: r for r in map(json.loads, (web / "manifest.jsonl").read_text().splitlines())}
    labels = {r["uid"]: r for r in map(json.loads, (web / "labels.jsonl").read_text().splitlines())}
    status = {r["uid"]: r for r in map(json.loads, (web / "processed" / "status.jsonl").read_text().splitlines())}
    pool = [manifest[u] | {"score": labels[u]["score"]} for u in labels
            if labels[u]["label"] == "phoi" and status.get(u, {}).get("ok") and not status[u].get("reason")]
    pool.sort(key=lambda r: -r["score"])
    by: dict[str, list[dict]] = {}
    for r in pool:
        by.setdefault(r["species"], []).append(r)
    picked: list[dict] = []
    while len(picked) < n and any(by.values()):  # lần lượt từng loài để đủ đa dạng
        for k in list(by):
            if by[k] and len(picked) < n:
                picked.append(by[k].pop(0))
    existing = {c["id"]: c for c in (yaml.safe_load(CASES.read_text())["cases"] if CASES.exists() else [])}
    for r in picked:
        cid = f"web_{r['uid']}"
        if cid in existing:
            continue
        d = PHOTOS / cid
        d.mkdir(parents=True, exist_ok=True)
        shutil.copy(web / r["path"], d / "front.jpg")
        sp = r["species"] if r["species"] in SPECIES_OK else None
        existing[cid] = {"id": cid, "photos": [f"{cid}/front.jpg"], "species_key": sp, "height_cm": None,
                         "source": {"page": r.get("page_url"), "license": r.get("license"), "author": r.get("author")},
                         "note": f"ảnh mạng ({r['species']}); thay bằng ảnh chụp thật khi có"}
    BENCH.mkdir(parents=True, exist_ok=True)
    CASES.write_text(yaml.safe_dump({"version": 1, "cases": list(existing.values())}, allow_unicode=True, sort_keys=False))
    print(f"{len(existing)} phôi trong {CASES.relative_to(REPO)} (vừa thêm {len(picked)})")


# ---------- kiểm ảnh (không tốn API) ----------

def check() -> None:
    import cv2

    sys.path.insert(0, str(REPO / "scripts" / "dataset"))
    from process_web import Session, process

    sess = Session(str(REPO / "data" / "models" / "isnet-general-use.onnx"))
    bad = 0
    for c in load_cases():
        for p in c["photos"]:
            path = PHOTOS / p
            if not path.exists():
                print(f"✗ {c['id']}: thiếu ảnh {p}")
                bad += 1
                continue
            img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
            g = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2GRAY)
            sharp = float(cv2.Laplacian(cv2.resize(g, (512, int(512 * g.shape[0] / g.shape[1]))), cv2.CV_64F).var())
            light = float(g.mean())
            issues = []
            if min(img.size) < 600:
                issues.append(f"nhỏ {img.size}")
            if sharp < 60:
                issues.append(f"mờ ({sharp:.0f})")
            if not 50 <= light <= 215:
                issues.append(f"{'tối' if light < 50 else 'cháy sáng'} ({light:.0f})")
            tmp = BENCH / ".check"
            res = process(sess, path, tmp)
            if not res["ok"]:
                issues.append(f"tách nền: {res['reason']}")
            elif res.get("reason"):
                issues.append("có vật thừa / nhiều cây")
            if c.get("species_key") not in SPECIES_OK:
                issues.append("chưa ghi loài")
            bad += bool(issues)
            print(("✓ " if not issues else "! ") + f"{c['id']}/{Path(p).name}: " + ("ổn" if not issues else ", ".join(issues)))
    shutil.rmtree(BENCH / ".check", ignore_errors=True)
    print(f"\n{bad} ảnh cần xem lại.")


# ---------- chạy ----------

class Api:
    def __init__(self, base: str, token: str):
        self.base, self.token = base.rstrip("/") + "/api/v1", token

    def call(self, method: str, path: str, body: dict | None = None):
        req = urllib.request.Request(self.base + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"{method} {path} → {e.code}: {e.read().decode(errors='replace')[:300]}") from e


def _token(base: str, env: str, email: str) -> str:
    if os.environ.get(env):
        return os.environ[env]
    req = urllib.request.Request(base.rstrip("/") + "/api/v1/auth/dev", method="POST", data=json.dumps({"email": email}).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["access_token"]


def _upload(api: Api, path: Path) -> str:
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=92)
    data = buf.getvalue()
    pre = api.call("POST", "/uploads/presign", {"content_type": "image/jpeg", "size_bytes": len(data)})
    req = urllib.request.Request(pre["url"], method="PUT", data=data, headers=pre["headers"])
    urllib.request.urlopen(req, timeout=120).read()
    return pre["key"]


def _wait(api: Api, job_id: str, until: set[str], timeout_s: int) -> dict:
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        j = api.call("GET", f"/jobs/{job_id}")
        if j["status"] in until or j["status"] == "failed":
            return j
        time.sleep(5)
    return api.call("GET", f"/jobs/{job_id}") | {"timeout": True}


def run(base: str, label: str, yes: bool, only: list[str] | None, option: str) -> None:
    cases = [c for c in load_cases() if not only or c["id"] in only]
    est = len(cases) * COST_PER_CASE_USD * (3 if option == "all" else 1)
    print(f"{len(cases)} phôi · ước tính ≈ ${est:.2f} tiền API (xem lại ở Quản trị → Chi phí AI).")
    if not yes:
        sys.exit("Thêm --yes để chạy thật.")
    user = Api(base, _token(base, "BENCH_TOKEN", "bench@bonsai.local"))
    admin = Api(base, _token(base, "ADMIN_TOKEN", os.environ.get("BENCH_ADMIN_EMAIL", "qt@test.vn")))
    me = user.call("GET", "/me")
    if me["role"] not in ("admin", "artisan"):  # tài khoản đo = nghệ nhân → không vướng giới hạn phân tích / ngày
        admin.call("PUT", f"/admin/users/{me['id']}/role", {"role": "artisan"})
    need = len(cases) * (3 if option == "all" else 1)
    if me["credits"] < need:
        admin.call("POST", "/admin/credits/gift", {"email": me["email"], "credits": min(100, need - me["credits"] + 2), "batch": f"bench-{label}"[:40]})
    out = RUNS / f"{datetime.now():%Y%m%d-%H%M}_{label}"
    out.mkdir(parents=True, exist_ok=True)
    (out / "meta.json").write_text(json.dumps({"label": label, "base": base, "started": datetime.now().isoformat(), "option": option,
                                               "cases": [c["id"] for c in cases]}, ensure_ascii=False, indent=1))
    for c in cases:
        rec: dict = {"case": c["id"], "species_key": c.get("species_key")}
        t0 = time.time()
        try:
            keys = [_upload(user, PHOTOS / p) for p in c["photos"]]
            tree = user.call("POST", "/trees", {"nickname": f"BENCH {c['id']}"[:120], "species_key": c.get("species_key"),
                                                "real_height_cm": c.get("height_cm"),
                                                "photos": [{"key": k, "view_index": i, "is_front": i == 0} for i, k in enumerate(keys)]})
            time.sleep(4)  # A0 chuẩn hóa ảnh
            job = user.call("POST", f"/trees/{tree['id']}/jobs", {k: c[k] for k in ("style", "goal", "region") if c.get(k)})
            j = _wait(user, job["id"], {"awaiting_choice"}, 900)
            rec["job_id"] = job["id"]
            rec["phase_a_s"] = round(time.time() - t0)
            if j["status"] != "awaiting_choice":
                rec |= {"status": j["status"], "error": j.get("error_code")}
            else:
                opts = j.get("options") or []
                chosen = opts if option == "all" else opts[:1]
                rec["options"] = [o.get("style_key") for o in opts]
                for o in chosen[:1]:  # mỗi phiên tạo ảnh một phương án (phương án khác: chạy lại với --option)
                    user.call("POST", f"/jobs/{job['id']}/choose", {"option_id": o["id"]})
                    rec["chosen_style"] = o.get("style_key")
                j = _wait(user, job["id"], {"done"}, 1800)
                rec["status"] = j["status"]
                rec["total_s"] = round(time.time() - t0)
        except Exception as e:  # noqa: BLE001 — một phôi lỗi không dừng cả bộ
            rec |= {"status": "error", "error": str(e)[:300]}
        if rec.get("job_id"):
            rec |= collect(admin, rec["job_id"])
        with (out / "results.jsonl").open("a") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        print(f"{c['id']}: {rec.get('status')} · tự kiểm {'ĐẠT' if rec.get('auto_pass') else 'chưa đạt'} · ${rec.get('cost_usd', 0):.3f}", flush=True)
    report(out, None, admin)


def collect(admin: Api, job_id: str) -> dict:
    """Số đo tự động của ảnh S4 được chọn: lỗi CV / trung thực, điểm AI chấm (P4), chi phí, số lần vẽ lại."""
    d = admin.call("GET", f"/admin/jobs/{job_id}")
    s4 = [r for r in d["renders"] if r["stage_code"] == "S4"]
    sel = next((r for r in s4 if r["selected"]), None)
    cv = (sel or {}).get("cv_checks") or {}
    judge = (sel or {}).get("judge") or {}
    fails = list(cv.get("fails", [])) + list(judge.get("hard_fail", []) or [])
    total = sel.get("total_score") if sel else None
    return {
        "cost_usd": round(sum(s.get("cost_usd") or 0 for s in d["steps"]), 4),
        "attempts": len(s4), "s4_url": sel["url"] if sel else None, "s4_render_id": sel["id"] if sel else None,
        "photo_url": (d["photos"][0] or {}).get("url") if d["photos"] else None,
        "hard_fails": fails, "ai_total": total, "fidelity": {k: cv.get(k) for k in ("pad_cover", "outside_foliage", "removed_still_present", "apex_offset") if k in cv},
        "auto_pass": bool(sel) and not fails and (total is None or total >= 6.5),
        "low_confidence": bool(((d.get("progress") or {}).get("result") or {}).get("low_confidence")),
        "species_ai": ((d.get("analysis") or {}).get("species") or {}).get("guess"),
        "species_local": [x["key"] for x in (d.get("progress") or {}).get("species_local") or []],
        "repair_rounds": ((d.get("progress") or {}).get("result") or {}).get("repair_rounds"),
    }


# ---------- báo cáo ----------

def _rows(run_dir: Path) -> list[dict]:
    f = run_dir / "results.jsonl"
    return [json.loads(x) for x in f.read_text().splitlines()] if f.exists() else []


def summarize(rows: list[dict], reviews: list[dict]) -> dict:
    n = len(rows)
    done = [r for r in rows if r.get("status") == "done"]
    by_job: dict[str, list[dict]] = {}
    for rv in reviews:
        if rv["kind"] == "image":
            by_job.setdefault(rv["job_id"], []).append(rv)
    reviewed = [r for r in done if r.get("job_id") in by_job]
    art_pass = [r for r in reviewed if sum(v["passed"] for v in by_job[r["job_id"]]) * 2 > len(by_job[r["job_id"]])]
    fails: dict[str, int] = {}
    for r in rows:
        for f in r.get("hard_fails") or []:
            fails[f] = fails.get(f, 0) + 1
    for rv in reviews:
        for f in rv.get("hard_fails") or []:
            fails[f"nghệ nhân: {f}"] = fails.get(f"nghệ nhân: {f}", 0) + 1
    return {
        "n": n, "done": len(done), "auto_pass": sum(bool(r.get("auto_pass")) for r in done),
        "reviewed": len(reviewed), "artisan_pass": len(art_pass),
        "cost_usd": round(sum(r.get("cost_usd") or 0 for r in rows), 2),
        "avg_attempts": round(sum(r.get("attempts") or 0 for r in done) / max(1, len(done)), 2),
        "top_fails": sorted(fails.items(), key=lambda x: -x[1])[:8],
        # máy đoán loài (CLIP) khớp AI (P1) bao nhiêu — đủ cao thì bỏ được bước nhận loài bằng API
        "species_agree": sum(1 for r in rows if r.get("species_local") and r.get("species_ai") and r["species_local"][0] == r["species_ai"]),
        "species_compared": sum(1 for r in rows if r.get("species_local") and r.get("species_ai") and r["species_ai"] != "other"),
    }


def _vi(code: str) -> str:
    pre, _, c = code.rpartition(": ")
    return (pre + ": " if pre else "") + FAIL_VI.get(c, c)


def _pct(a: int, b: int) -> str:
    return f"{a}/{b} ({100 * a / b:.0f}%)" if b else "—"


def report(run_dir: Path, compare: Path | None, admin: Api | None = None) -> None:
    rows = _rows(run_dir)
    if admin is None:
        base = json.loads((run_dir / "meta.json").read_text())["base"]
        admin = Api(base, _token(base, "ADMIN_TOKEN", os.environ.get("BENCH_ADMIN_EMAIL", "qt@test.vn")))
    jobs = [r["job_id"] for r in rows if r.get("job_id")]
    reviews = admin.call("GET", "/admin/reviews?" + "&".join(f"job_id={j}" for j in jobs)) if jobs else []
    s = summarize(rows, reviews)
    prev = None
    if compare:
        prow = _rows(compare)
        pj = [r["job_id"] for r in prow if r.get("job_id")]
        prev = summarize(prow, admin.call("GET", "/admin/reviews?" + "&".join(f"job_id={j}" for j in pj)) if pj else [])
    meta = json.loads((run_dir / "meta.json").read_text())

    def line(label: str, key_a: str, key_b: str) -> str:
        now = _pct(s[key_a], s[key_b])
        before = _pct(prev[key_a], prev[key_b]) if prev else ""
        return f"<tr><th>{label}</th><td>{now}</td><td>{before}</td></tr>"

    rv_by: dict[str, list[dict]] = {}
    for rv in reviews:
        rv_by.setdefault(rv["job_id"], []).append(rv)
    cards = []
    for r in rows:
        rv = rv_by.get(r.get("job_id"), [])
        verdict = ("ĐẠT" if r.get("auto_pass") else "CHƯA ĐẠT") + (f" · nghệ nhân {sum(v['passed'] for v in rv)}/{len(rv)} đạt" if rv else "")
        cards.append(
            f"<figure class='{'ok' if r.get('auto_pass') else 'bad'}'><div class=pair>"
            f"<img src='{html.escape(r.get('photo_url') or '')}'><img src='{html.escape(r.get('s4_url') or '')}'></div>"
            f"<figcaption><b>{html.escape(r['case'])}</b> · {html.escape(str(r.get('chosen_style') or r.get('status')))} · {verdict}<br>"
            f"AI {r.get('ai_total') or '—'} · vẽ {r.get('attempts', 0)} lần · ${r.get('cost_usd', 0):.3f}"
            f"{'<br>Lỗi: ' + html.escape(', '.join(map(_vi, r['hard_fails']))) if r.get('hard_fails') else ''}"
            f"{'<br>' + html.escape(r.get('error') or '') if r.get('error') else ''}</figcaption></figure>")
    page = (
        "<!doctype html><meta charset=utf-8><title>Bộ đo chất lượng</title><style>body{font:14px system-ui;margin:20px;background:#f6f6f4}"
        "table{border-collapse:collapse;background:#fff;margin:8px 0 20px}td,th{border:1px solid #ddd;padding:6px 10px;text-align:left}"
        ".g{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px}figure{margin:0;background:#fff;border:2px solid #ddd;border-radius:8px;overflow:hidden}"
        ".ok{border-color:#3e8a57}.bad{border-color:#c23b2b}.pair{display:grid;grid-template-columns:1fr 1fr}.pair img{width:100%;height:220px;object-fit:contain;background:#eee}"
        "figcaption{padding:6px 8px;font-size:12px}</style>"
        f"<h1>Bộ đo chất lượng — {html.escape(meta['label'])}</h1><p>{html.escape(meta['started'][:16])} · {s['n']} phôi · ${s['cost_usd']}"
        f" · trung bình {s['avg_attempts']} lần vẽ / ảnh{' · so với ' + html.escape(compare.name) if compare else ''}</p>"
        f"<table><tr><th></th><th>Lần này</th><th>{'Lần trước' if prev else ''}</th></tr>"
        + line("Chạy xong", "done", "n") + line("Tự kiểm tra đạt", "auto_pass", "done") + line("Nghệ nhân đã chấm", "reviewed", "done")
        + line("Nghệ nhân chấm đạt (Cổng 2 ≥ 70%)", "artisan_pass", "reviewed") + line("Máy đoán loài khớp AI", "species_agree", "species_compared") + "</table>"
        "<h2>Lỗi hay gặp</h2><table>" + "".join(f"<tr><td>{html.escape(_vi(k))}</td><td>{v}</td></tr>" for k, v in s["top_fails"]) + "</table>"
        "<h2>Từng phôi (trái: ảnh gốc · phải: kết quả)</h2><div class=g>" + "".join(cards) + "</div>")
    (run_dir / "report.html").write_text(page)
    (run_dir / "summary.json").write_text(json.dumps(s, ensure_ascii=False, indent=1))
    print(json.dumps(s, ensure_ascii=False, indent=1))
    print("Báo cáo:", run_dir / "report.html")


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("seed")
    p.add_argument("--n", type=int, default=20)
    sub.add_parser("check")
    p = sub.add_parser("run")
    p.add_argument("--label", required=True)
    p.add_argument("--base", default="http://127.0.0.1:8080")
    p.add_argument("--yes", action="store_true")
    p.add_argument("--only", default="")
    p.add_argument("--option", choices=["first", "all"], default="first")
    p = sub.add_parser("report")
    p.add_argument("run_dir", type=Path)
    p.add_argument("--compare", type=Path)
    a = ap.parse_args()
    if a.cmd == "seed":
        seed(a.n)
    elif a.cmd == "check":
        check()
    elif a.cmd == "run":
        run(a.base, a.label, a.yes, [x for x in a.only.split(",") if x] or None, a.option)
    else:
        report(a.run_dir, a.compare)


if __name__ == "__main__":
    main()
