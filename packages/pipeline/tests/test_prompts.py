from pathlib import Path

import pytest
import yaml

from bonsai_pipeline.dictionaries import rule_set
from bonsai_pipeline.prompts import MissingPromptVariable, render, template_variables

PROMPTS = Path(__file__).resolve().parents[2] / "prompts"


def test_render_keeps_literal_json_braces():
    out = render('Data {{x}} -> {"a": 1} {n}', {"x": {"k": "v"}})
    assert '{"a": 1} {n}' in out and '"k": "v"' in out


def test_missing_variable_raises():
    with pytest.raises(MissingPromptVariable):
        render("{{a}} {{b}}", {"a": 1})


@pytest.mark.parametrize("path", sorted(PROMPTS.glob("*.yaml")), ids=lambda p: p.name)
def test_prompt_files_are_well_formed(path):
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert {"step_code", "version", "kind", "user"} <= doc.keys()
    assert path.name == f"{doc['step_code']}.{doc['version']}.yaml"
    assert template_variables(doc["user"])


def test_rule_set_loads():
    rs = rule_set()
    assert rs["proportions"]["first_branch_height_ratio"] == [0.25, 0.4]


def test_seed_rule_files_are_consistent():
    from bonsai_pipeline.dictionaries import SPECIES, STYLES, judging, species_rules, styles_vn

    rs = rule_set()
    assert rs["version"] == 2 and rs["proportions"]["branch_to_trunk_caliper_max"] == 0.33
    style_keys = {s["key"] for s in STYLES}
    assert set(rs["pot"]["shape_by_style"]) - {"massive_trunk"} <= style_keys
    assert set(rs["style_specifics"]) <= style_keys
    assert {s["key"] for s in SPECIES} <= set(species_rules())
    vn = styles_vn()
    assert {"truc", "xieu", "hoanh", "huyen"} == set(vn["dang"])
    for t in vn["the"].values():
        assert t["dang"] in vn["dang"] and set(t.get("maps_to", [])) <= style_keys
    j = judging()
    assert sum(c["weight"] for c in j["criteria"].values()) == 100 and 0 < j["pass_score"] <= 100


def test_every_rule_source_is_listed():
    import re
    from importlib import resources

    root = resources.files("bonsai_pipeline").joinpath("rules")
    sources = root.joinpath("SOURCES.md").read_text(encoding="utf-8")
    listed = set(re.findall(r"^\| ([a-z0-9_]+) \|", sources, re.M))
    used = set()
    for name in ("rule_set.yaml", "styles_vn.yaml", "species.yaml", "judging.yaml"):
        comments = "\n".join(line.split("#", 1)[1] for line in root.joinpath(name).read_text(encoding="utf-8").splitlines() if "#" in line)
        for group in re.findall(r"\[([a-z0-9_, ]+)\]", comments):
            used |= {x.strip() for x in group.split(",")}
    known_words = {"src", "chokkan", "moyogi", "shakan", "kengai", "han_kengai", "bunjingi", "fukinagashi", "sokan",
                   "sekijoju", "vn_truc_quan_tu", "vn_long", "banyan_aerial_roots", "co", "ky", "my", "van",
                   "truc", "xieu", "hoanh", "huyen"}
    missing = {u for u in used if u not in listed and u not in known_words and not u.replace("_", "").isdigit()}
    assert not missing, missing
