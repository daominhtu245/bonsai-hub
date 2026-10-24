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


def test_rule_docs_validate_and_override():
    import copy

    from bonsai_pipeline.dictionaries import (
        RULE_DOCS, default_rule_doc, judging, max_thicken_pct, rule_set, rule_set_yaml, use_rules, years_to_final,
    )
    from bonsai_pipeline.rules_validate import validate_rule_doc

    for name in RULE_DOCS:
        assert validate_rule_doc(name, default_rule_doc(name)) == [], name
    bad = copy.deepcopy(default_rule_doc("judging"))
    bad["criteria"]["trunk_nebari"]["weight"] = 30
    assert any("100" in e for e in validate_rule_doc("judging", bad))
    rs = copy.deepcopy(default_rule_doc("rule_set"))
    rs["proportions"]["first_branch_height_ratio"] = [0.5, 0.3]
    assert validate_rule_doc("rule_set", rs)
    sp = copy.deepcopy(default_rule_doc("species"))
    del sp["si"]
    assert validate_rule_doc("species", sp) == ["Thiếu loài «si»."]

    edited = copy.deepcopy(default_rule_doc("rule_set"))
    edited["growth"]["years_to_final"]["fast"] = 3
    edited["growth"]["max_thicken_pct_per_year"]["fast"] = 20
    try:
        use_rules({"rule_set": edited})
        assert years_to_final("fast") == 3 and max_thicken_pct("fast") == 20 and rule_set() is edited
        assert "years_to_final" in rule_set_yaml() and judging() == default_rule_doc("judging")
    finally:
        use_rules(None)
    assert years_to_final("fast") == 4 and rule_set() == default_rule_doc("rule_set")


def test_rule_doc_key_order_restored_after_jsonb():
    import json

    from bonsai_pipeline.dictionaries import default_rule_doc, ordered_rule_doc

    base = default_rule_doc("rule_set")
    shuffled = json.loads(json.dumps(dict(sorted(base.items(), key=lambda kv: (len(kv[0]), kv[0])))))  # như JSONB
    shuffled["new_section"] = {"x": 1}
    out = ordered_rule_doc("rule_set", shuffled)
    assert list(out)[:3] == list(base)[:3] and list(out)[-1] == "new_section"
    j = default_rule_doc("judging")
    crit = dict(reversed(list(j["criteria"].items())))
    assert list(ordered_rule_doc("judging", {**j, "criteria": crit})["criteria"]) == list(j["criteria"])
