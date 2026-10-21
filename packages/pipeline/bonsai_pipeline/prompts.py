"""Render template prompt lưu trong bảng `prompt_versions`.

Biến dùng cú pháp `{{name}}` để không đụng ngoặc nhọn của ví dụ JSON trong prompt.
"""

from __future__ import annotations

import json
import re
from typing import Any

_VAR = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")


class MissingPromptVariable(KeyError):
    pass


def template_variables(template: str) -> set[str]:
    return set(_VAR.findall(template))


def render(template: str, variables: dict[str, Any]) -> str:
    missing = template_variables(template) - variables.keys()
    if missing:
        raise MissingPromptVariable(", ".join(sorted(missing)))

    def sub(m: re.Match) -> str:
        v = variables[m.group(1)]
        if isinstance(v, (dict, list)):
            return json.dumps(v, ensure_ascii=False, indent=2)
        return "null" if v is None else str(v)

    return _VAR.sub(sub, template)
