#!/usr/bin/env python3
"""Validate an OMP WATCHDOG.yml advisor roster.

Usage:
    python3 validate.py [--canonical] [path-to-WATCHDOG.yml]

Default path: WATCHDOG.yml in the current directory.

Checks (always):
- YAML parses; anchors and aliases resolve
- top-level `instructions` block is a string
- `advisors` is a non-empty list
- every advisor has a unique non-empty name
- every advisor has an optional boolean `enabled` (default true)
- every advisor has a `tools` list (or omits it, meaning the default)
- every tool name is a known OMP built-in

Checks (with --canonical):
- exactly 100 advisors
- every advisor has `enabled: true` (a missing `enabled` is an error)
- every advisor has `model` exactly equal to
  `particle/deepseek-v4-flash-0731:max`
- the shared `instructions` block states bounded proactive emission and
  no unchanged repeats
- every advisor `instructions` carries explicit `Activation:`,
  `Excludes/handoff:`, and `Cadence:` label lines (case-insensitive,
  line-oriented; incidental keywords do not satisfy a dimension)
- least-privilege tool policy:
  - `github`, `task`, `hub`, `ask`, `checkpoint`, `retain`, `recall`,
    and `reflect` are never granted to any advisor
  - mutating/high-side-effect tools are granted only to `Fixer`
  - `browser` and `computer` are granted only to live-evidence roles
    plus `Fixer`

Exits 0 on success, 1 on any error.
"""

import argparse
import re
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

# Canonical roster: the exact roster --canonical enforces. The live OMP
# advisor role already points at CANONICAL_MODEL.
CANONICAL_COUNT = 100
CANONICAL_MODEL = "particle/deepseek-v4-flash-0731:max"

# Least-privilege tool policy (enforced only in canonical mode). An
# advisor grants tools by listing them; any tool on the restricted sets
# must belong to the named exception, or the roster is rejected.
# Mutating / high-side-effect tools: only the advisor named `Fixer` may
# hold any of these, so exactly one advisor can change state.
MUTATING_TOOLS = {
    "bash", "edit", "write", "eval", "debug", "ast_edit", "rewind",
    "todo", "memory_edit", "learn", "manage_skill",
}

# UI-driving tools: only the live-evidence roles (tool tier T4 in the
# taxonomy) plus `Fixer` may hold these.
UI_TOOLS = {"browser", "computer"}
LIVE_UI_ROLES = {
    "OnboardingFlow", "ProgressFeedback", "FormUX", "NavigationIA",
    "VisualHierarchy", "KeyboardInteraction", "ScreenReaderFlow",
    "TUIInteraction", "WebResponsive", "MobileGestures", "EndToEndTests",
    "Fixer",
}

# Never granted to any canonical advisor, even `Fixer`.
FORBIDDEN_TOOLS = {
    "github", "task", "hub", "ask", "checkpoint", "retain", "recall",
    "reflect",
}


def _compiled(patterns: tuple[str, ...]) -> list[re.Pattern[str]]:
    """Compile regex strings with case folding."""
    return [re.compile(p, re.IGNORECASE) for p in patterns]


def _matches(patterns: list[re.Pattern[str]], text: str) -> bool:
    """True when any pattern matches the text."""
    return any(p.search(text) for p in patterns)


# Canonical per-advisor instruction checks. The canonical format is a
# block scalar whose lines carry explicit labels (`Remit:`, `Activation:`,
# `Cadence:`, `Excludes/handoff:`, `Tooling:`). In canonical mode each
# dimension must be named by its own label line; loose keyword heuristics
# are deliberately not used, so a dimension cannot pass on incidental
# wording. Each entry is (label, human description of the requirement).
CANONICAL_DIMENSIONS = (
    ("Activation:", "when the advisor activates (a line starting with `Activation:`)"),
    ("Excludes/handoff:", "what the advisor hands off or excludes (a line starting with `Excludes/handoff:`)"),
    ("Cadence:", "how often the advisor evaluates (a line starting with `Cadence:`)"),
)


def _has_labeled_line(text: str, label: str) -> bool:
    """True when a line of `text` starts with `label`, case-insensitively.

    Line-oriented: the label must begin the line (leading whitespace is
    ignored, as block-scalar indentation is stripped), not appear mid-line.
    """
    prefix = label.lower()
    return any(
        line.strip().lower().startswith(prefix)
        for line in text.splitlines()
    )


# The shared `instructions` block must state bounded proactive emission
# and no unchanged repeats (the taxonomy's global emission contract).
SHARED_EMISSION_PATTERNS = _compiled((
    r"at most one",
    r"one (concise |single )?(note|issue|finding) (per|max)",
    r"one (note|issue|finding) per (advisor|update|turn)",
    r"per (advisor|update|turn)",
    r"evaluate (every|each) (relevant |primary )?turn",
    r"stay silent when",
    r"silent when",
    r"\bsilence\b",
    r"proactive",
    r"no (generic|padding|filler|status)",
    r"do not pad",
    r"only (when|if) .{0,30}(material|issue|finding|concern)",
    r"bounded",
))

SHARED_NOREPEAT_PATTERNS = _compiled((
    r"no (unchanged )?repeat",
    r"do not re ?emit",
    r"re ?emit (only|unless)",
    r"unless (new |fresh )?evidence",
    r"new evidence",
    r"(three|3) relevant turns?",
    r"don'?t (re ?emit|repeat)",
    r"not repeat",
    r"evidence (changes|changed)",
    r"repeat an unchanged",
))


def validate(path: str, canonical: bool = False) -> int:
    errors: list[str] = []

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
    elif canonical:
        if not _matches(SHARED_EMISSION_PATTERNS, instructions):
            errors.append(
                "canonical mode: top-level `instructions` must state bounded "
                "proactive emission (for example, at most one note per update, "
                "evaluate every relevant turn, stay silent when there is no "
                "material finding)"
            )
        if not _matches(SHARED_NOREPEAT_PATTERNS, instructions):
            errors.append(
                "canonical mode: top-level `instructions` must state that "
                "unchanged findings are not repeated (for example, no unchanged "
                "repeats, re-emit only when evidence changes)"
            )

    advisors = doc.get("advisors")
    if not isinstance(advisors, list) or len(advisors) == 0:
        errors.append("`advisors` must be a non-empty list")
    else:
        names: list[str] = []
        for i, adv in enumerate(advisors):
            label = f"advisors[{i}]"
            if not isinstance(adv, dict):
                errors.append(f"{label}: must be a mapping")
                continue
            name = adv.get("name")
            valid_name = False
            if not isinstance(name, str) or not name.strip():
                errors.append(f"{label}: `name` must be a non-empty string")
            else:
                valid_name = True
                if name in names:
                    errors.append(f"{label}: duplicate advisor name `{name}`")
                names.append(name)
            if canonical:
                if adv.get("enabled") is not True:
                    errors.append(
                        f"{label} (`{name}`): `enabled` must be true in canonical mode"
                    )
                if adv.get("model") != CANONICAL_MODEL:
                    errors.append(
                        f"{label} (`{name}`): `model` must be exactly "
                        f"`{CANONICAL_MODEL}` in canonical mode"
                    )
            else:
                enabled = adv.get("enabled")
                if "enabled" in adv and not isinstance(enabled, bool):
                    errors.append(f"{label} (`{name}`): `enabled` must be true or false")
            tools = adv.get("tools")
            if "tools" in adv:
                if not isinstance(tools, list):
                    errors.append(f"{label} (`{name}`): `tools` must be a list")
                else:
                    for tool in tools:
                        if not isinstance(tool, str) or tool not in BUILTIN_TOOLS:
                            errors.append(
                                f"{label} (`{name}`): unknown tool `{tool}`"
                            )
                            continue
                        if canonical and valid_name:
                            if tool in FORBIDDEN_TOOLS:
                                errors.append(
                                    f"{label} (`{name}`): tool `{tool}` is "
                                    f"forbidden in canonical mode (github, task, "
                                    f"hub, ask, checkpoint, retain, recall, and "
                                    f"reflect are never granted)"
                                )
                            elif tool in MUTATING_TOOLS and name != "Fixer":
                                errors.append(
                                    f"{label} (`{name}`): tool `{tool}` is "
                                    f"restricted in canonical mode: only the "
                                    f"`Fixer` advisor may hold "
                                    f"mutating/high-side-effect tools"
                                )
                            elif tool in UI_TOOLS and name not in LIVE_UI_ROLES:
                                errors.append(
                                    f"{label} (`{name}`): tool `{tool}` is "
                                    f"restricted in canonical mode: only the "
                                    f"live-evidence roles and `Fixer` may hold "
                                    f"UI tools"
                                )
            instructions = adv.get("instructions")
            if not isinstance(instructions, str) or not instructions.strip():
                errors.append(
                    f"{label} (`{name}`): `instructions` must be a non-empty string"
                )
            elif canonical:
                for label, desc in CANONICAL_DIMENSIONS:
                    if not _has_labeled_line(instructions, label):
                        errors.append(
                            f"{label} (`{name}`): `instructions` must state "
                            f"{desc}"
                        )

        if canonical and len(advisors) != CANONICAL_COUNT:
            errors.append(
                f"canonical roster must have exactly {CANONICAL_COUNT} advisors, "
                f"found {len(advisors)}"
            )

    if errors:
        for err in errors:
            print(f"error: {err}")
        return 1

    print(f"OK: {len(advisors)} advisors, all checks passed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate an OMP WATCHDOG.yml advisor roster."
    )
    parser.add_argument(
        "--canonical",
        action="store_true",
        help="enforce the canonical roster: exactly 100 advisors, all enabled, "
        "all with model " + CANONICAL_MODEL + ", shared and per-advisor "
        "instructions stating the emission and activation/handoff/cadence "
        "contract, and least-privilege tool policy (forbidden tools never "
        "granted; mutating tools only on Fixer; browser/computer only on "
        "live-evidence roles and Fixer)",
    )
    parser.add_argument(
        "path",
        nargs="?",
        default="WATCHDOG.yml",
        help="path to the WATCHDOG.yml file (default: WATCHDOG.yml)",
    )
    args = parser.parse_args()
    return validate(args.path, canonical=args.canonical)


if __name__ == "__main__":
    sys.exit(main())

