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
