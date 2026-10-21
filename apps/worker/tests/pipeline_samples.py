"""Dữ liệu mẫu: phôi si 1000x1500 px, thân uốn chữ S, 5 cành."""

import copy

ANALYSIS = {
    "image_quality": {"usable": True, "issues": []},
    "species": {"guess": "si", "confidence": 0.92},
    "trunk": {
        "base_point_px": [500, 1300], "apex_point_px": [520, 300],
        "height_px": 1000, "base_diameter_px": 120,
        "taper": "good", "movement": "s_curve", "lean_angle_deg": 4, "notable": ["aerial_roots"],
    },
    "nebari": {"quality": "average", "spread_side": "left"},
    "branches": [
        {"id": "b1", "start_px": [480, 1000], "end_px": [300, 950], "direction": "left", "thickness": "thick", "height_ratio": 0.30, "issues": []},
        {"id": "b2", "start_px": [520, 990], "end_px": [700, 940], "direction": "right", "thickness": "medium", "height_ratio": 0.31, "issues": ["bar_branch"]},
        {"id": "b3", "start_px": [530, 800], "direction": "right", "thickness": "medium", "height_ratio": 0.50, "issues": []},
        {"id": "b4", "start_px": [510, 650], "direction": "back", "thickness": "thin", "height_ratio": 0.65, "issues": []},
        {"id": "b5", "start_px": [515, 450], "direction": "front", "thickness": "thin", "height_ratio": 0.85, "issues": ["eye_poke"]},
    ],
    "best_front_view_index": 0,
    "summary_vi": "Phôi si thân uốn chữ S, rễ nổi lệch trái.",
}

OPTION = {
    "style_key": "moyogi", "suitability": 0.9, "why_vi": "Thân đã có độ uốn tự nhiên.", "front": "0",
    "apex": {"point_px": [515, 500], "lean": "slightly_left"},
    "keep_branches": [{"id": "b1", "role": "first_branch"}, {"id": "b3", "role": "second_branch"}, {"id": "b4", "role": "back_branch"}],
    "remove_branches": [{"id": "b2", "reason_vi": "Cành đối với b1"}, {"id": "b5", "reason_vi": "Chĩa về người xem"}],
    "new_branches_needed": [{"at_px": [505, 600], "direction": "left", "note_vi": "Nuôi cành trái tầng 3"}],
    "silhouette": {"width_px": 600, "height_px": 520, "pads": 4},
    "pot": {"shape": "oval", "color": "unglazed_brown", "position": "off_center_left"},
    "care_steps_vi": ["Bước 1: cắt b2, b5"],
}


def analysis(**patch):
    a = copy.deepcopy(ANALYSIS)
    a.update(patch)
    return a


def option(**patch):
    o = copy.deepcopy(OPTION)
    o.update(patch)
    return o


def design(*opts):
    return {"options": list(opts) or [option(), option(style_key="shakan", suitability=0.7), option(style_key="bunjingi", suitability=0.6)]}
