#!/usr/bin/env python3
"""Validate an OMP WATCHDOG.yml advisor roster.

Usage:
    python3 validate.py [path-to-WATCHDOG.yml]

Default path: WATCHDOG.yml in the current directory.

Checks:
- YAML parses
- top-level `instructions` block is a string
- `advisors` is a non-empty list
- every advisor has a unique non-empty name
- every advisor has an optional boolean `enabled` (default true)
- every advisor has a `tools` list (or omits it, meaning the default)
- every tool name is a known OMP built-in

Exits 0 on success, 1 on any error.
"""

import sys

try:
    import yaml
except ImportError:
    print("error: PyYAML is required. Install it with: pip install pyyaml")
    sys.exit(1)

# Canonical OMP built-in tool names (BUILTIN_TOOL_NAMES in the
# pi-coding-agent package). Legacy aliases search/find are normalized
# by OMP itself, so they are accepted here too.
BUILTIN_TOOLS = {
    "read", "bash", "edit", "ast_grep", "ast_edit", "ask", "debug",
    "eval", "github", "glob", "grep", "lsp", "inspect_image", "browser",
    "computer", "checkpoint", "rewind", "security_scan", "task", "hub",
    "todo", "web_search", "write", "memory_edit", "retain", "recall",
    "reflect", "learn", "manage_skill", "search", "find",
}


def validate(path: str) -> int:
    errors = []

    try:
        with open(path, "r", encoding="utf-8") as fh:
            doc = yaml.safe_load(fh)
    except OSError as exc:
        print(f"error: cannot read {path}: {exc}")
        return 1
    except yaml.YAMLError as exc:
        print(f"error: {path} is not valid YAML: {exc}")
        return 1

    if not isinstance(doc, dict):
        print("error: top level must be a YAML mapping")
        return 1

    instructions = doc.get("instructions")
    if not isinstance(instructions, str) or not instructions.strip():
        errors.append("top-level `instructions` must be a non-empty string")

    advisors = doc.get("advisors")
    if not isinstance(advisors, list) or len(advisors) == 0:
        errors.append("`advisors` must be a non-empty list")
    else:
        names = []
        for i, adv in enumerate(advisors):
            label = f"advisors[{i}]"
            if not isinstance(adv, dict):
                errors.append(f"{label}: must be a mapping")
                continue
            name = adv.get("name")
            if not isinstance(name, str) or not name.strip():
                errors.append(f"{label}: `name` must be a non-empty string")
            else:
                if name in names:
                    errors.append(f"{label}: duplicate advisor name `{name}`")
                names.append(name)
            enabled = adv.get("enabled")
            if enabled is not None and not isinstance(enabled, bool):
                errors.append(f"{label} (`{name}`): `enabled` must be true or false")
            tools = adv.get("tools")
            if tools is not None:
                if not isinstance(tools, list):
                    errors.append(f"{label} (`{name}`): `tools` must be a list")
                else:
                    for tool in tools:
                        if not isinstance(tool, str) or tool not in BUILTIN_TOOLS:
                            errors.append(
                                f"{label} (`{name}`): unknown tool `{tool}`"
                            )
            instructions = adv.get("instructions")
            if not isinstance(instructions, str) or not instructions.strip():
                errors.append(f"{label} (`{name}`): `instructions` must be a non-empty string")

    if errors:
        for err in errors:
            print(f"error: {err}")
        return 1

    print(f"OK: {len(advisors)} advisors, all checks passed")
    return 0


def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else "WATCHDOG.yml"
    return validate(path)


if __name__ == "__main__":
    sys.exit(main())
