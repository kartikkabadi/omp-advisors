#!/usr/bin/env python3
"""Validate an OMP WATCHDOG.yml advisor roster.

Usage:
    python3 validate.py [--canonical] [--check-contract] [path-to-WATCHDOG.yml]

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
- exactly 100 advisors, all unique names
- every advisor has `enabled: true` (a missing `enabled` is an error)
- every advisor has `model` exactly equal to
  `particle/deepseek-v4-flash-0731:max`
- every advisor declares a `domain` from the 13 canonical domains, and the
  count per domain matches the canonical roster exactly
- every advisor holds exactly the shared broad common tool tier
  (x-tool-tiers.common): read, glob, grep, ast_grep, lsp, web_search,
  browser, computer, bash, edit, write, eval, debug, ast_edit,
  security_scan, inspect_image, todo, yield. One uniform grant for every
  role removes role-specific quarantine; the remote side-effect tools
  (github, task, hub, ask, checkpoint, retain, recall, reflect) and other
  memory/state tools are never granted
- the shared `instructions` block is a hard, validator-enforced contract.
  It must state:
  - act on your own initiative: evaluate every relevant turn without being
    asked, including tool-less user turns and ambient conversation
    evidence, not only tool activity
  - report every action and every meaningful observation to the main agent
  - before any mutation, notify the main agent of the planned action, its
    target, and its expected effect
  - after any tool action, report the tool used, the target, the result,
    and any change
  - no silent action
  - no unchanged repeats; evidence-anchored notes
  - high-impact limits: finance, legal, and health advisors give
    information and escalation only; they never decide, buy, sign,
    diagnose, or dose
- every advisor `instructions` carries explicit `Remit:`, `Activation:`,
  `Cadence:`, `Excludes/handoff:`, and `Tooling:` label lines
  (case-insensitive, line-oriented; incidental keywords do not satisfy a
  dimension)
- advisors in high-impact domains (finance/legal/admin, health/wellbeing)
  must restate the information-and-escalation-only limit in their own
  instructions

`--check-contract` prints a PASS/FAIL table of the shared hard contract
groups (useful to inspect which mandatory phrase is missing).

Exits 0 on success, 1 on any error.
"""

import argparse
import re
import sys
from collections import Counter

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
    "reflect", "learn", "manage_skill", "search", "find", "yield",
}

# Canonical roster: the exact roster --canonical enforces.
CANONICAL_COUNT = 100
CANONICAL_MODEL = "particle/deepseek-v4-flash-0731:max"

# The one broad tool tier granted to every canonical advisor. Uniform on
# purpose: any role may request and use any tool its work needs, so no
# role-specific restriction can quarantine a response when a tool is
# unavailable. Remote side-effect and memory/state tools are excluded by
# construction (they are not in this set) and additionally rejected below.
COMMON_TOOLS = [
    "read", "glob", "grep", "ast_grep", "lsp", "web_search", "browser",
    "computer", "bash", "edit", "write", "eval", "debug", "ast_edit",
    "security_scan", "inspect_image", "todo", "yield",
]
COMMON_TOOL_SET = set(COMMON_TOOLS)

# Never granted to any canonical advisor. These are remote side-effect or
# memory/state tools: granting them would let an advisor act outside the
# conversation, change long-lived state, or delete its own memory without
# the main agent's notification contract.
FORBIDDEN_TOOLS = {
    "github", "task", "hub", "ask", "checkpoint", "retain", "recall",
    "reflect", "memory_edit", "learn", "manage_skill", "rewind",
}

# The 13 canonical domains and the exact role count per domain (the
# taxonomy from TaxonomyArchitect; totals to 100).
CANONICAL_DOMAINS = {
    "software/technical": 16,
    "product/business": 9,
    "finance/legal/admin": 8,
    "career/learning": 8,
    "health/wellbeing": 8,
    "relationships/communication": 7,
    "home/logistics": 7,
    "travel/local/world affairs": 7,
    "research/epistemics": 7,
    "security/privacy": 7,
    "creativity/writing": 5,
    "long-term planning": 5,
    "personal operations": 6,
}

# Domains whose roles must restate the information-and-escalation-only
# limit: they may advise and escalate, never decide, buy, sign, diagnose,
# or dose.
HIGH_IMPACT_DOMAINS = {"finance/legal/admin", "health/wellbeing"}


def _compiled(patterns: tuple[str, ...]) -> list[re.Pattern[str]]:
    """Compile regex strings with case folding."""
    return [re.compile(p, re.IGNORECASE) for p in patterns]


def _matches(patterns: list[re.Pattern[str]], text: str) -> bool:
    """True when any pattern matches the text."""
    return any(p.search(text) for p in patterns)


def _all_match(patterns: list[re.Pattern[str]], text: str) -> bool:
    """True when every pattern matches the text."""
    return all(p.search(text) for p in patterns)


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


# The shared `instructions` block is a hard contract. Each entry is
# (group name, human description, patterns); EVERY pattern in the entry
# must match for the group to pass. This is what makes notification and
# initiative mandatory rather than advisory: a roster whose shared block
# drops any of these phrases is rejected.
SHARED_CONTRACT_GROUPS = (
    (
        "initiative",
        "evaluate every relevant turn without being asked, including "
        "tool-less user turns and ambient conversation evidence",
        _compiled((
            r"evaluate every relevant turn",
            r"without being asked",
            r"tool-less",
            r"ambient conversation",
        )),
    ),
    (
        "notify-everything",
        "report every action and every meaningful observation to the main "
        "agent",
        _compiled((
            r"report every action",
            r"every meaningful observation",
        )),
    ),
    (
        "pre-mutation",
        "notify the main agent before any mutation: planned action, target, "
        "expected effect",
        _compiled((
            r"before any mutation",
            r"notify the main agent of the planned action",
            r"expected effect",
        )),
    ),
    (
        "post-action",
        "after any tool action, report the tool used, the target, the "
        "result, and any change",
        _compiled((
            r"after any tool action",
            r"report the tool used",
            r"any change",
        )),
    ),
    (
        "no-silent",
        "no silent action, no silent observation",
        _compiled((r"no silent action", r"no silent observation")),
    ),
    (
        "no-repeat",
        "no unchanged repeats; re-emit only when evidence changes",
        _compiled((
            r"no (unchanged )?repeat",
            r"unless new evidence changes",
        )),
    ),
    (
        "evidence",
        "evidence-anchored notes naming the file, symbol, line, command, "
        "source, or date",
        _compiled((
            r"evidence-anchored",
            r"name the file, symbol, line",
        )),
    ),
    (
        "high-impact",
        "finance, legal, and health advisors give information and "
        "escalation only; they never decide, buy, sign, diagnose, or dose",
        _compiled((
            r"information and escalation only",
            r"never decide",
            r"never[ ,]+(?:decide|buy|sign|diagnose|dose|prescribe)"
            r"(?:[ ,]+(?:or |, )?(?:decide|buy|sign|diagnose|dose|prescribe)){0,4}",
        )),
    ),
)

# Per-advisor high-impact limit restated in the role's own instructions.
ROLE_HIGH_IMPACT_PATTERNS = _compiled((
    r"information and escalation only",
    r"\bnever\b",
))

# Canonical per-advisor instruction checks. The canonical format is a
# block scalar whose lines carry explicit labels. In canonical mode each
# dimension must be named by its own label line; loose keyword heuristics
# are deliberately not used, so a dimension cannot pass on incidental
# wording. Each entry is (label, human description of the requirement).
CANONICAL_DIMENSIONS = (
    ("Remit:", "what the advisor watches for (a line starting with `Remit:`)"),
    ("Activation:", "when the advisor activates (a line starting with `Activation:`)"),
    ("Cadence:", "how often the advisor evaluates (a line starting with `Cadence:`)"),
    ("Excludes/handoff:", "what the advisor hands off or excludes (a line starting with `Excludes/handoff:`)"),
    ("Tooling:", "which tools and reporting rules the role follows (a line starting with `Tooling:`)"),
)


def _check_shared_contract(instructions: str) -> list[str]:
    """Return a list of errors for a shared `instructions` block.

    Every group in SHARED_CONTRACT_GROUPS must have all its patterns
    match. A missing group is a hard contract violation.
    """
    errors: list[str] = []
    for name, desc, patterns in SHARED_CONTRACT_GROUPS:
        if not _all_match(patterns, instructions):
            errors.append(
                f"canonical mode: shared `instructions` must {desc} "
                f"(contract group `{name}` is missing)"
            )
    return errors


def _check_contract_table(instructions: str) -> int:
    """Print a PASS/FAIL table of the shared contract groups; return 1 if any fail."""
    status = 0
    print("shared contract groups:")
    for name, desc, patterns in SHARED_CONTRACT_GROUPS:
        ok = _all_match(patterns, instructions)
        status |= 0 if ok else 1
        print(f"  [{'OK' if ok else 'FAIL'}] {name}: {desc}")
    return status


def validate(path: str, canonical: bool = False, check_contract: bool = False) -> int:
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
        errors.extend(_check_shared_contract(instructions))
        if check_contract:
            if _check_contract_table(instructions):
                # Table already printed FAIL lines; the detailed errors are
                # added below, so just note the failure here.
                pass

    advisors = doc.get("advisors")
    if not isinstance(advisors, list) or len(advisors) == 0:
        errors.append("`advisors` must be a non-empty list")
    else:
        names: list[str] = []
        domain_counts: Counter[str] = Counter()
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
                domain = adv.get("domain")
                if not isinstance(domain, str) or domain not in CANONICAL_DOMAINS:
                    errors.append(
                        f"{label} (`{name}`): `domain` must be one of the 13 "
                        f"canonical domains ({', '.join(sorted(CANONICAL_DOMAINS))})"
                    )
                else:
                    domain_counts[domain] += 1
                tools = adv.get("tools")
                if tools is None:
                    errors.append(
                        f"{label} (`{name}`): `tools` must be present and equal "
                        f"to the shared common tool tier in canonical mode"
                    )
                elif not isinstance(tools, list):
                    errors.append(f"{label} (`{name}`): `tools` must be a list")
                elif set(tools) != COMMON_TOOL_SET:
                    forbidden_hit = sorted(set(tools) & FORBIDDEN_TOOLS)
                    missing = sorted(COMMON_TOOL_SET - set(tools))
                    extra = sorted(set(tools) - COMMON_TOOL_SET)
                    detail = []
                    if missing:
                        detail.append(f"missing {len(missing)} common tools: {', '.join(missing)}")
                    if extra:
                        detail.append(f"extra tools: {', '.join(extra)}")
                    if forbidden_hit:
                        detail.append(f"forbidden tools granted: {', '.join(forbidden_hit)}")
                    errors.append(
                        f"{label} (`{name}`): `tools` must be exactly the shared "
                        f"broad common tool tier ({len(COMMON_TOOLS)} tools) so "
                        f"every role is uniformly equipped and no role-specific "
                        f"quarantine is possible. {'; '.join(detail) or 'mismatch.'}"
                    )
                else:
                    # Set equality already proves no forbidden tool is granted.
                    pass
            else:
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
                errors.append(
                    f"{label} (`{name}`): `instructions` must be a non-empty string"
                )
            elif canonical:
                for dim_label, desc in CANONICAL_DIMENSIONS:
                    if not _has_labeled_line(instructions, dim_label):
                        errors.append(
                            f"{label} (`{name}`): `instructions` must state "
                            f"{desc}"
                        )
                if valid_name:
                    role_domain = adv.get("domain")
                    if isinstance(role_domain, str) and role_domain in HIGH_IMPACT_DOMAINS:
                        if not _all_match(ROLE_HIGH_IMPACT_PATTERNS, instructions):
                            errors.append(
                                f"{label} (`{name}`): advisor is in the "
                                f"high-impact domain `{role_domain}` and must "
                                f"state in its own instructions that it gives "
                                f"information and escalation only (never "
                                f"decide, buy, sign, diagnose, or dose)"
                            )

        if canonical:
            if len(advisors) != CANONICAL_COUNT:
                errors.append(
                    f"canonical roster must have exactly {CANONICAL_COUNT} advisors, "
                    f"found {len(advisors)}"
                )
            for domain, expected in CANONICAL_DOMAINS.items():
                actual = domain_counts[domain]
                if actual != expected:
                    errors.append(
                        f"canonical domain `{domain}` must have exactly {expected} "
                        f"advisors, found {actual}"
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
        help="enforce the canonical roster: exactly 100 advisors across the 13 "
        "domains with exact per-domain counts, all enabled, all with model "
        + CANONICAL_MODEL + ", all holding the shared broad common tool tier, "
        "a shared hard contract (initiative over tool-less turns and ambient "
        "conversation, notification of every action/observation, pre-mutation "
        "notice, post-action reporting, no silent action, no unchanged repeats, "
        "evidence anchors, high-impact limits), the five per-role label lines, "
        "and per-role high-impact limits",
    )
    parser.add_argument(
        "--check-contract",
        action="store_true",
        help="print a PASS/FAIL table of the shared contract phrase groups",
    )
    parser.add_argument(
        "path",
        nargs="?",
        default="WATCHDOG.yml",
        help="path to the WATCHDOG.yml file (default: WATCHDOG.yml)",
    )
    args = parser.parse_args()
    return validate(args.path, canonical=args.canonical, check_contract=args.check_contract)


if __name__ == "__main__":
    sys.exit(main())
