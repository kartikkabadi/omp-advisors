# Delegation plan
Units: 5

| # | Unit | Files (mine) | Worker (subagent) | Acceptance | Status | Evidence |
|---|------|--------------|-------------------|------------|--------|----------|
| 1 | Trace OMP advisor runtime and tool contract | read-only OMP installation/config | RuntimeScout | Exact runtime behavior and valid tool policy proven | done | Runtime fact captured: configured tools are intersected with the session pool, so an unavailable tool call quarantines the whole response. Applied as the core design constraint: every role gets one broad common tool tier so no role-specific quarantine is possible. |
| 2 | Audit existing roster domains and design 100-role world taxonomy | read-only WATCHDOG.yml | TaxonomyArchitect | Exactly 100 non-overlapping roles across broad life/work/world domains | done | Taxonomy artifact (agent://TaxonomyArchitect) delivered 100 unique roles across 13 domains with exact counts 16/9/8/8/8/7/7/7/7/7/5/5/6; roster applied verbatim to WATCHDOG.yml and validator enforces the counts. |
| 3 | Rewrite canonical roster and validator | WATCHDOG.yml, validate.py, README.md | RosterBuilder | Canonical validator passes and all roles have proactive/notification/tool contracts | verified | WATCHDOG.yml rewritten (100 roles, 13 domains, shared common tier, hard shared contract); validate.py enforces domain counts, common grant, exact model, notification/initiative/high-impact phrases. `python3 validate.py --canonical --check-contract WATCHDOG.yml` passes (8/8 contract groups); `py_compile` OK; 7 deliberately broken variants all rejected; `git diff --check` clean. |
| 4 | Align Pi integration with expanded advisor tools | pi-adviser/adviser.ts, roster.ts, test.ts | PiBuilder | Pi exposes intended tools safely and test suite passes | pending | |
| 5 | Independent final review | read-only all artifacts | FinalGrader | Every acceptance criterion receives PASS with evidence | pending | |
