"""Giữ ảnh kết quả ĐÚNG với phôi và thiết kế (docs/quality-plan.md bước 2–4), chạy trên máy, không tốn API.

- `regions`: vùng thân (từ gốc tới cành đầu, dò trên mặt nạ tách nền / YOLO / hình học) và vùng được phép vẽ
  (tầng lá theo thiết kế, đường cành phải cắt, chậu, phần cây cũ cần dọn). Mọi chỗ khác — thân dưới, nền — bị khóa.
- `layout_collage`: ảnh gốc + tầng lá + chậu từ thư viện chi tiết, đặt đúng vị trí thiết kế → khung cho model ảnh.
- `lock_regions`: căn ảnh sinh theo ảnh gốc (model hay xê dịch vài px) rồi dán lại điểm ảnh gốc vào vùng khóa,
  viền mờ chuyển tiếp → thân và nền không thể bị model vẽ lại.
- `fidelity_checks`: đo lá có nằm trong các tầng thiết kế không, có lá ngoài thiết kế, cành phải cắt còn không,
  ngọn đúng chỗ không → danh sách lỗi cho vòng sửa / chọn ảnh.
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from .schemas import Analysis, DesignOption, Pad
from .sketch import branch_end

LEAF_OF = {"si": "ficus", "sanh": "ficus", "mai_chieu_thuy": "fine", "linh_sam": "fine", "tung_la_han": "strap"}
POT_SPRITE = {  # (dáng, màu) chậu thiết kế → ảnh chậu trong thư viện (assets/studio)
    ("rectangle", "glazed_cream"): "pot_rect_cream", ("rectangle", "unglazed_brown"): "pot_rect_brown",
    ("round", "glazed_blue"): "pot_round_blue", ("cascade_deep", None): "pot_cascade",
}
_BRANCH_W = {"thick": 0.35, "medium": 0.22, "thin": 0.12}  # độ rộng hành lang cành cắt, theo đường kính gốc

# ngưỡng kiểm tra: mặc định; bản đang dùng đọc từ judging.checks (nghệ nhân chỉnh ở trang Bộ luật)
CHECK_DEFAULTS = {
    "pad_cover_min": 0.25,  # tỉ lệ lá tối thiểu trong mỗi tầng thiết kế
    "pads_missing_max": 0.34,  # quá 1/3 số tầng thiếu lá → lỗi
    "outside_foliage_max": 1.0,  # lá ngoài thiết kế / diện tích các tầng (lá thật luôn xòe hơn tầng ghép)
    "removed_same_max": 0.06,  # sai khác trung bình dọc cành cắt (0–1) dưới mức này = cành vẫn còn nguyên
    "apex_off_max": 0.15,  # lệch ngọn theo chiều cao ảnh
}


def _param(key: str) -> float:
    from .dictionaries import check_param

    return check_param(key, CHECK_DEFAULTS[key])


@dataclass
class Regions:
    size: tuple[int, int]
    trunk: np.ndarray  # thân dưới (gốc → cành đầu), luôn khóa
    canopy: np.ndarray  # các tầng lá thiết kế (nới rộng) + bao lồi
    corridors: np.ndarray  # hành lang các cành phải cắt
    pot: np.ndarray  # vùng chậu (S3, S4 đổi chậu)
    tree: np.ndarray  # phần cây cũ (mặt nạ tách nền) — được dọn
    pads: list[Pad] = field(default_factory=list)
    trunk_source: str = "geometry"

    def editable(self, *, pot: bool = True) -> np.ndarray:
        m = self.canopy | self.corridors | self.tree
        if pot:
            m = m | self.pot
        return m & ~self.trunk

    def as_png(self, mask: np.ndarray) -> bytes:
        buf = io.BytesIO()
        Image.fromarray((mask * 255).astype(np.uint8)).save(buf, "PNG")
        return buf.getvalue()


# ---------- bố cục tầng lá ----------


def leaf_type(species_key: str | None) -> str:
    return LEAF_OF.get(species_key or "", "needle")


def _sprite_aspect(key: str) -> float:
    from .studio_compose import manifest

    return float(manifest().get(key, {}).get("aspect", 0.3))


def layout_pads(option: DesignOption, analysis: Analysis, species_key: str | None) -> list[Pad]:
    """Tầng lá của thiết kế: người dùng tự ghép thì dùng nguyên; phương án AI thì dựng từ khung tán (như web Studio)."""
    leaf = leaf_type(species_key)
    if option.pads_layout:
        return [p if p.kind else p.model_copy(update={"kind": f"{leaf}_wide"}) for p in option.pads_layout]
    t = analysis.trunk
    assert t is not None
    ax, ay = option.apex.point_px
    sw, sh = option.silhouette.width_px, option.silhouette.height_px
    n = max(2, min(7, option.silhouette.pads))
    bottom = min(ay + sh * 0.85, t.base_point_px[1] - t.height_px * 0.3)
    top = ay + sh * 0.05
    first_left = _first_branch_side(option, analysis) == "left"
    pads: list[Pad] = []
    for i in range(n):
        f = i / (n - 1)
        last = i == n - 1
        side = 0 if last else (-1 if (i % 2 == 0) == first_left else 1)
        kind = f"{leaf}_{'apex' if last else 'flat' if i % 2 else 'wide'}"
        w = sw * (0.32 if last else 0.62 - 0.3 * f)
        rx = w / 2
        pads.append(Pad(center_px=[ax + side * sw * 0.2 * (1 - f), bottom + (top - bottom) * f], rx=rx,
                        ry=max(1.0, rx * _sprite_aspect(kind)), rotation=side * -4, kind=kind, flip=side > 0))
    return pads


def _first_branch_side(option: DesignOption, analysis: Analysis) -> str:
    branches = {b.id: b for b in analysis.branches}
    for k in option.keep_branches:
        b = branches.get(k.id)
        if k.role == "first_branch" and b and b.direction in ("left", "right"):
            return b.direction
    return "left"


def pot_sprite(option: DesignOption) -> str:
    p = option.pot
    if p.shape == "cascade_deep":
        return "pot_cascade"
    return POT_SPRITE.get((p.shape, p.color)) or {"rectangle": "pot_rect_brown", "round": "pot_round_blue"}.get(p.shape, "pot_oval_brown")


def pot_geometry(option: DesignOption, analysis: Analysis) -> tuple[float, float]:
    """(tâm x, chiều rộng) chậu: dài ≈ 2/3 chiều cao cây (rule_set), gốc lệch theo thiết kế."""
    t = analysis.trunk
    assert t is not None
    width = max(t.height_px * 0.67, t.base_diameter_px * 3)
    shift = {"off_center_left": 0.15, "off_center_right": -0.15}.get(option.pot.position, 0.0)  # cây lệch trái → chậu lệch phải
    return t.base_point_px[0] + shift * width, width


def layout_collage(photo: bytes, analysis: Analysis, option: DesignOption, pads: list[Pad], *, with_pot: bool = True) -> bytes:
    """Ảnh gốc + chậu + tầng lá thư viện đúng vị trí thiết kế (không vẽ dấu ✕) — khung cho model ảnh."""
    from .studio_compose import compose
    from .user_design import UserDesignIn

    cx, width = pot_geometry(option, analysis)
    d = UserDesignIn(style_key=option.style_key, removed=[r.id for r in option.remove_branches], pads=pads,
                     apex=option.apex.point_px, pot=option.pot, pot_kind=pot_sprite(option) if with_pot else None,
                     pot_width=width, pot_x=cx)
    return compose(photo, analysis, d, mark_cuts=False)


# ---------- vùng ----------


def _ellipse_mask(size: tuple[int, int], pads: list[Pad], grow: float = 1.0) -> np.ndarray:
    img = Image.new("L", size, 0)
    draw = ImageDraw.Draw(img)
    for p in pads:
        rx, ry, r = p.rx * grow, p.ry * grow, math.radians(p.rotation)
        pts = [(p.center_px[0] + rx * math.cos(a) * math.cos(r) - ry * math.sin(a) * math.sin(r),
                p.center_px[1] + rx * math.cos(a) * math.sin(r) + ry * math.sin(a) * math.cos(r))
               for a in np.linspace(0, 2 * math.pi, 36, endpoint=False)]
        draw.polygon(pts, fill=255)
    return np.asarray(img) > 0


def _hull_mask(size: tuple[int, int], pts: list[tuple[float, float]]) -> np.ndarray:
    if len(pts) < 3:
        return np.zeros(size[::-1], bool)
    pts = sorted(set(pts))

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    img = Image.new("L", size, 0)
    ImageDraw.Draw(img).polygon(lower[:-1] + upper[:-1], fill=255)
    return np.asarray(img) > 0


def _dilate(m: np.ndarray, px: int) -> np.ndarray:
    if px <= 0 or not m.any():
        return m
    img = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * min(px, 40) + 1))
    return np.asarray(img) > 127


def _first_branch_y(option: DesignOption, analysis: Analysis, pads: list[Pad]) -> float:
    t = analysis.trunk
    assert t is not None
    kept = {k.id for k in option.keep_branches}
    ys = [b.start_px[1] for b in analysis.branches if b.id in kept]
    ys += [p.center_px[1] + p.ry for p in pads]
    lowest = max(ys) if ys else t.base_point_px[1] - t.height_px / 3
    return max(lowest, t.base_point_px[1] - t.height_px * 0.6)


def trunk_mask(analysis: Analysis, size: tuple[int, int], top_y: float, *, cutout: np.ndarray | None = None,
               seg: np.ndarray | None = None) -> tuple[np.ndarray, str]:
    """Thân dưới, từ gốc lên `top_y`. Ưu tiên mặt nạ thân YOLO, rồi dò trên mặt nạ tách nền, cuối cùng hình học."""
    t = analysis.trunk
    assert t is not None
    w, h = size
    bx, by = t.base_point_px
    y0, y1 = int(max(0, top_y)), int(min(h - 1, by + t.base_diameter_px * 0.15))
    rows = np.zeros((h, w), bool)
    rows[y0:y1 + 1] = True
    if seg is not None and seg.shape == (h, w) and (seg & rows).sum() > 50:
        return _dilate(seg & rows, 3), "yolo"
    half = max(4.0, t.base_diameter_px / 2 * 1.1)
    if cutout is not None and cutout.shape == (h, w):
        m = np.zeros((h, w), bool)
        cx, misses, started = float(bx), 0, False
        for y in range(y1, y0 - 1, -1):
            row = cutout[y]
            lo, hi = int(max(0, cx - half * 2)), int(min(w, cx + half * 2 + 1))
            xs = np.nonzero(row[lo:hi])[0]
            if xs.size == 0:
                misses += started  # chỉ đếm hàng trống sau khi đã gặp thân (dưới gốc có thể là đất / chậu)
                if misses > 12:
                    break
                continue
            started, misses = True, 0
            # đoạn liền chứa / gần tâm hiện tại
            xs = xs + lo
            splits = np.split(xs, np.nonzero(np.diff(xs) > 1)[0] + 1)
            run = min(splits, key=lambda r: 0 if r[0] <= cx <= r[-1] else min(abs(r[0] - cx), abs(r[-1] - cx)))
            a, b = max(run[0], cx - half * 1.4), min(run[-1], cx + half * 1.4)  # chặn chỗ cành / rễ nhập vào
            if b > a:
                m[y, int(a):int(b) + 1] = True
                cx = 0.7 * cx + 0.3 * (a + b) / 2
        if m.sum() > half * (y1 - y0) * 0.6:
            return _dilate(m, 3), "cutout"
    # hình học: dải dọc trục gốc → ngọn, thon dần
    img = Image.new("L", size, 0)
    ax, ay = t.apex_point_px
    draw = ImageDraw.Draw(img)
    steps = 24
    for i in range(steps + 1):
        f = i / steps
        y = by + (ay - by) * f
        if y < y0:
            break
        x = bx + (ax - bx) * f
        r = half * (1 - 0.35 * f)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=255)
    return np.asarray(img) > 0, "geometry"


def regions(analysis: Analysis, option: DesignOption, size: tuple[int, int], *, species_key: str | None = None,
            cutout: np.ndarray | None = None, seg: np.ndarray | None = None) -> Regions:
    t = analysis.trunk
    assert t is not None
    w, h = size
    pads = layout_pads(option, analysis, species_key)
    canopy = _ellipse_mask(size, pads, 1.25)
    pts = [(p.center_px[0] + sx * p.rx * 1.1, p.center_px[1] + sy * p.ry * 1.1) for p in pads for sx in (-1, 1) for sy in (-1, 1)]
    pts.append(tuple(option.apex.point_px))
    canopy |= _hull_mask(size, pts)
    ax, ay = option.apex.point_px
    r = h * 0.04
    apex = Image.new("L", size, 0)
    ImageDraw.Draw(apex).ellipse([ax - r, ay - r, ax + r, ay + r], fill=255)
    canopy |= np.asarray(apex) > 0

    corr = Image.new("L", size, 0)
    draw = ImageDraw.Draw(corr)
    removed = {r.id for r in option.remove_branches}
    for b in analysis.branches:
        if b.id in removed:
            ex, ey = branch_end(b, t.height_px)
            width = max(14, round(t.base_diameter_px * _BRANCH_W.get(b.thickness, 0.2)))
            draw.line([tuple(b.start_px), (ex, ey)], fill=255, width=width)
    corridors = _dilate(np.asarray(corr) > 0, max(4, round(min(size) * 0.01)))

    # vùng chậu: cả dải ngang từ mặt đất xuống đáy ảnh — chậu cũ (thường to hơn) phải được vẽ lại hết, không để lộ mép
    pot = np.zeros((h, w), bool)
    top = int(max(0, t.base_point_px[1] - t.base_diameter_px * 0.6))
    pot[top:, :] = True

    tree = _dilate(cutout, max(3, round(min(size) * 0.006))) if cutout is not None and cutout.shape == (h, w) else np.zeros((h, w), bool)
    trunk, source = trunk_mask(analysis, size, _first_branch_y(option, analysis, pads), cutout=cutout, seg=seg)
    return Regions(size, trunk, canopy, corridors, pot, tree, pads, source)


# ---------- căn chỉnh + khóa vùng ----------


def _align(original: np.ndarray, generated: np.ndarray, locked: np.ndarray) -> tuple[np.ndarray, dict]:
    """Căn ảnh sinh vào ảnh gốc (affine, ECC trên vùng khóa). Không có OpenCV / không hội tụ → giữ nguyên."""
    try:
        import cv2
    except ImportError:
        return generated, {"aligned": False}
    h, w = original.shape[:2]
    scale = 512 / max(h, w)
    small = (max(1, round(w * scale)), max(1, round(h * scale)))
    a = cv2.resize(cv2.cvtColor(original, cv2.COLOR_RGB2GRAY), small).astype(np.float32) / 255
    b = cv2.resize(cv2.cvtColor(generated, cv2.COLOR_RGB2GRAY), small).astype(np.float32) / 255
    m = cv2.resize(locked.astype(np.uint8) * 255, small, interpolation=cv2.INTER_NEAREST)
    if m.mean() < 255 * 0.1:
        return generated, {"aligned": False, "reason": "locked_too_small"}
    warp = np.eye(2, 3, dtype=np.float32)
    try:
        _, warp = cv2.findTransformECC(a, b, warp, cv2.MOTION_AFFINE,
                                       (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 60, 1e-4), m, 5)
    except cv2.error:
        return generated, {"aligned": False, "reason": "ecc_failed"}
    shift = float(np.hypot(warp[0, 2], warp[1, 2]) / scale)
    zoom = float(np.sqrt(abs(np.linalg.det(warp[:, :2]))))
    if shift > max(h, w) * 0.08 or not 0.85 < zoom < 1.15:
        return generated, {"aligned": False, "reason": "transform_too_large", "shift_px": round(shift, 1)}
    # chỉ dùng phép căn khi nó thật sự làm vùng khóa khớp hơn (ảnh đã khớp sẵn thì giữ nguyên, khỏi lệch 1–3 px)
    sel = m > 0
    before = float(np.abs(a - b)[sel].mean())
    after = float(np.abs(a - cv2.warpAffine(b, warp, small, flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
                                            borderMode=cv2.BORDER_REPLICATE))[sel].mean())
    if after > before * 0.9:
        return generated, {"aligned": False, "reason": "not_better", "diff": round(before, 4)}
    full = warp.copy()
    full[:, 2] /= scale
    out = cv2.warpAffine(generated, full, (w, h), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    valid = cv2.warpAffine(np.full((h, w), 255, np.uint8), full, (w, h), flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP,
                           borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    valid = cv2.erode(valid, np.ones((5, 5), np.uint8)) > 0
    return out, {"valid": valid, "aligned": True, "shift_px": round(shift, 1), "zoom": round(zoom, 4), "diff_before": round(before, 4),
                 "diff_after": round(after, 4)}


def lock_regions(original: bytes, generated: bytes, editable: np.ndarray) -> tuple[bytes, dict]:
    """Căn ảnh sinh theo ảnh gốc rồi dán lại điểm ảnh gốc ngoài vùng `editable` (viền mờ). Trả WebP + chỉ số."""
    orig = np.asarray(Image.open(io.BytesIO(original)).convert("RGB"))
    gen_img = Image.open(io.BytesIO(generated)).convert("RGB")
    if gen_img.size != (orig.shape[1], orig.shape[0]):
        gen_img = gen_img.resize((orig.shape[1], orig.shape[0]), Image.Resampling.LANCZOS)
    gen = np.asarray(gen_img)
    locked = ~editable
    gen, info = _align(orig, gen, locked)
    if "valid" in info:  # mép ảnh sau khi căn không có dữ liệu thật → dùng ảnh gốc ở đó (tránh vệt sọc)
        editable = editable & info.pop("valid")
    feather = max(3, round(max(orig.shape[:2]) * 0.006))
    alpha = Image.fromarray((editable * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(feather))
    a = (np.asarray(alpha, np.float32) / 255.0)[..., None]
    out = (gen * a + orig * (1 - a)).astype(np.uint8)
    # model đã cố vẽ lại vùng khóa bao nhiêu (trước khi dán) — để theo dõi chất lượng model
    if locked.any():
        info["locked_change"] = round(float(np.abs(gen.astype(np.int16) - orig)[locked].mean() / 255), 4)
    info["editable_ratio"] = round(float(editable.mean()), 3)
    buf = io.BytesIO()
    Image.fromarray(out).save(buf, "WEBP", quality=92)
    return buf.getvalue(), info


# ---------- kiểm tra trung thực ----------


def foliage(rgb: np.ndarray) -> np.ndarray:
    """Điểm ảnh màu lá: xanh lục rõ (kênh G trội hơn R), đủ bão hòa, không quá tối.
    Không lấy vàng-be (cát, đất, vỏ cây) — bản đầu lấy hue từ 35° nên đếm nhầm cả thân và nền cát là lá."""
    hsv = np.asarray(Image.fromarray(rgb).convert("HSV"), np.float32)
    hue, sat, val = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
    r, g, b = (rgb[..., i].astype(np.int16) for i in range(3))
    return (hue >= 65) & (hue <= 170) & (sat >= 0.2) & (val >= 0.12) & (g > r + 6) & (g >= b)


def fidelity_checks(original: bytes, output: bytes, analysis: Analysis, option: DesignOption, reg: Regions) -> dict:
    orig = np.asarray(Image.open(io.BytesIO(original)).convert("RGB"))
    out = np.asarray(Image.open(io.BytesIO(output)).convert("RGB").resize((orig.shape[1], orig.shape[0])))
    h = orig.shape[0]
    leaf_out, leaf_orig = foliage(out), foliage(orig)
    # lá "của cây": lá trong vùng cây cũ / vùng được vẽ, hoặc lá mới xuất hiện (nền xanh không đổi thì bỏ qua)
    tree_leaf = leaf_out & (reg.tree | reg.canopy | ~leaf_orig)
    fails: list[str] = []
    res: dict = {}

    covers = []
    for p in reg.pads:
        m = _ellipse_mask(reg.size, [p])
        covers.append(round(float(tree_leaf[m].mean()) if m.any() else 0.0, 3))
    missing = sum(c < _param("pad_cover_min") for c in covers)
    res["pad_cover"] = covers
    if covers and missing / len(covers) > _param("pads_missing_max"):
        fails.append("pads_missing")

    allowed = _dilate(_ellipse_mask(reg.size, reg.pads, 1.5), max(3, round(min(reg.size) * 0.01)))
    pads_area = max(1, int(_ellipse_mask(reg.size, reg.pads).sum()))
    outside = int((tree_leaf & reg.editable() & ~allowed).sum())
    res["outside_foliage"] = round(outside / pads_area, 3)
    if res["outside_foliage"] > _param("outside_foliage_max"):
        fails.append("foliage_outside_design")

    t = analysis.trunk
    removed = {r.id for r in option.remove_branches}
    still = []
    gray_o = np.asarray(Image.fromarray(orig).convert("L"), np.float32) / 255
    gray_n = np.asarray(Image.fromarray(out).convert("L"), np.float32) / 255
    for b in analysis.branches:
        if b.id not in removed or t is None:
            continue
        line = Image.new("L", reg.size, 0)
        ImageDraw.Draw(line).line([tuple(b.start_px), branch_end(b, t.height_px)], fill=255, width=5)
        core = (np.asarray(line) > 0) & ~reg.canopy & ~reg.trunk  # trong tầng lá thì lá che được, không xét
        if reg.tree.any():
            core &= reg.tree  # chỉ xét chỗ ảnh gốc thật sự có cành (mặt nạ tách nền)
        if core.sum() < 30:
            continue
        diff = float(np.abs(gray_o[core] - gray_n[core]).mean())
        if diff < _param("removed_same_max"):
            still.append(b.id)
    res["removed_still_present"] = still
    if still:
        fails.append("removed_branch_present")

    rows = np.nonzero((tree_leaf & reg.canopy).any(axis=1))[0]
    if rows.size:
        off = abs(int(rows.min()) - option.apex.point_px[1]) / h
        res["apex_offset"] = round(off, 3)
        if off > _param("apex_off_max"):
            fails.append("apex_off")
    res["fails"] = fails
    return res


FIX_HINTS = {
    "pads_missing": "Grow dense real foliage inside EVERY pasted foliage pad of the collage, same position and size.",
    "foliage_outside_design": "Remove foliage and shoots outside the pasted pads; show the background there.",
    "removed_branch_present": "Completely remove the branches marked red in the sketch; show the background where they were.",
    "apex_off": "The top of the canopy must end at the marked apex — do not grow foliage above or far below it.",
}
