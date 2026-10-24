from bonsai_pipeline.phase_b import p3a_variables
from bonsai_pipeline.rule_engine import compute_targets
from bonsai_pipeline.schemas import Analysis, Pad
from bonsai_pipeline.sketch import build_scene, to_svg
from bonsai_pipeline.user_design import UserDesignIn, build_user_option, hints

from samples import analysis


def _setup(**kw):
    a = Analysis.model_validate(analysis())
    t = compute_targets(a, image_size=(1000, 1500), real_height_cm=60)
    d = UserDesignIn(style_key="moyogi", **kw)
    return a, t, build_user_option(a, t, d)


GOOD_PADS = [Pad(center_px=[420, 1000], rx=180, ry=60), Pad(center_px=[640, 800], rx=150, ry=55),
             Pad(center_px=[470, 620], rx=120, ry=50), Pad(center_px=[520, 430], rx=90, ry=45)]


def test_build_user_option_marks_removed_and_roles():
    _, _, o = _setup(removed=["b2", "b5", "zz"], pads=GOOD_PADS, apex=[515, 360],
                     new_branches=[{"at_px": [490, 700], "direction": "left"}])
    assert o.source == "user" and [r.id for r in o.remove_branches] == ["b2", "b5"]  # mã lạ bị bỏ
    assert {k.id for k in o.keep_branches} == {"b1", "b3", "b4"}
    assert next(k.role for k in o.keep_branches if k.id == "b1") == "first_branch"
    assert o.silhouette.pads == 4 and o.apex.point_px == [515, 360] and len(o.new_branches_needed) == 1


def test_hints_are_advice_not_errors():
    a, t, good = _setup(removed=["b2", "b5"], pads=GOOD_PADS, apex=[515, 360])
    assert hints(a, t, good) == []
    _, _, bad = _setup(removed=[], pads=[Pad(center_px=[500, 1280], rx=200, ry=60), Pad(center_px=[520, 1270], rx=220, ry=60)],
                       apex=[500, 1300])
    h = " ".join(hints(a, t, bad))
    assert "b1 và b2" in h and "chồng lên nhau" in h and "sát gốc" in h and "Ngọn đang thấp" in h
    _, _, empty = _setup()
    assert hints(a, t, empty)[0].startswith("Chưa có tầng lá")


def test_sketch_draws_pad_ellipses_and_prompt_note():
    a, t, o = _setup(removed=["b2"], pads=GOOD_PADS, apex=[515, 360])
    scene = build_scene(a, o, (1000, 1500))
    canopy = [i for i in scene.items if getattr(i, "layer", "") == "canopy"]
    assert len(canopy) == 4 and all(len(c.points) == 28 for c in canopy)
    assert 'data-layer="canopy"' in to_svg(scene)
    v = p3a_variables(o, a, style_desc="x", species_name="si", species_desc="y", growth_speed="fast", years=4)
    assert v["pads"] == 4 and "dashed ellipse" in v["silhouette_note"]


def test_compose_preview_uses_library():
    import io

    from PIL import Image

    from bonsai_pipeline.studio_compose import compose, manifest
    from bonsai_pipeline.user_design import UserDesignIn

    m = manifest()
    assert {"ficus_wide", "needle_apex", "pot_oval_brown", "moss", "rock"} <= set(m)
    assert all(0 < x["soil_y"] < 1 for x in m.values() if x["category"] == "pot")
    a = Analysis.model_validate(analysis())
    buf = io.BytesIO()
    Image.new("RGB", (1000, 1500), (200, 190, 170)).save(buf, format="JPEG")
    d = UserDesignIn(style_key="moyogi", removed=["b2"], pot_kind="pot_oval_brown", pot_width=600, pot_x=500,
                     pads=[{"center_px": [450, 900], "rx": 200, "ry": 50, "kind": "ficus_wide", "flip": True, "rotation": 5}],
                     accents=[{"kind": "moss", "center_px": [500, 1290], "width": 300}])
    out = Image.open(io.BytesIO(compose(buf.getvalue(), a, d))).convert("RGB")
    assert out.size == (1000, 1500)
    r, g, b = out.getpixel((450, 900))
    assert g > r and g > b  # tầng lá xanh đã được ghép
    assert out.getpixel((50, 50)) == (200, 190, 170) or abs(out.getpixel((50, 50))[0] - 200) < 4  # nền giữ nguyên


def test_accents_reach_prompt():
    a, t, _ = _setup()
    o = build_user_option(a, t, UserDesignIn(style_key="moyogi", accents=[{"kind": "moss", "center_px": [500, 1290], "width": 300}]))
    v = p3a_variables(o, a, style_desc="x", species_name="si", species_desc="y", growth_speed="fast", years=4)
    assert o.accents == ["moss"] and "cushion moss" in v["pot_description"]
