# omp-advisors

A set of reviewer advisors for OMP (Oh My Pi) coding agents. Drop-in roster
for `~/.omp/agent/WATCHDOG.yml`.

Each advisor reviews every turn and injects at most one note, so you only
hear from the advisors with something real to say. They work as a pipeline:
correctness, then structure, then speed, then the gaps between them.

## The roster

| Advisor | Watches | Stays silent when |
|---|---|---|
| Architecture | Coupling, public-API growth, layering, design regressions, deepening opportunities (seams, testability) | Nothing to say about structure |
| Security | Secret leakage, injection, unsafe deserialization, auth bypasses, risky dependencies | Findings are not material |
| Fixer | Fixes failures locally with tests, smallest change, root cause not symptom, always discloses every edit | Nothing broken to fix |
| Verifier | Claims vs evidence: files changed, commands run, test results. Verdicts: VERIFIED / ISSUES FOUND / BLOCKED | Claims match evidence |
| Bugs | Real bugs: bad input, off-by-one, races, broken error handling, silent failures, integration risk | No confirmed bugs |
| Maintainability | Dead code, unused imports, magic numbers, duplication, file sprawl, stale comments, unclear naming | Code is clean enough |
| Performance | N+1 queries, missing indexes, quadratic loops, blocking I/O in async paths, large bundles. Evidence for every claimed win | Turn does not touch perf-relevant code |
| ApiContract | Breaking changes to functions/types/endpoints, versioning, error shape, rate limits, pagination, docs drift | No public surface changed |
| RedTeam | Adversarial second pass: happy-path attacks, silent failures, trust assumptions, edge cases | Diff is small or straightforward |

## Install

```sh
cp WATCHDOG.yml ~/.omp/agent/WATCHDOG.yml
```

For a single project instead, copy it to `.omp/WATCHDOG.yml` in that
project. Enable the advisor runtime in your config:

```yaml
advisor:
  enabled: true
```

Already have a roster? Merge the `advisors` entries into your existing file.
The top-level `instructions` block is shared: it is prepended to every
advisor's own instructions.

## Customize

Each roster entry accepts:

```yaml
- name: AdvisorName          # required, unique
  enabled: true              # optional, default true
  model: model/id:thinking   # optional; omit to use modelRoles.advisor
  tools: [read, grep, glob]  # optional; omit for read/grep/glob default
  instructions: |
    What this advisor watches for.
```

- Any built-in tool is grantable, including mutating ones (`edit`, `write`,
  `bash`, `eval`, `browser`, `task`, `hub`). Only grant what the advisor
  needs.
- `enabled: false` keeps an entry listed but paused.
- Duplicate advisor names across project and user files: the project-level
  entry wins.

## Personal policy advisor

Your own rules are yours, so a template ships instead of a working advisor:
`examples/owner-policy.yml`. Copy the block into your `WATCHDOG.yml`, fill
in the placeholders, set `enabled: true`.

## Validate

```sh
python3 validate.py            # checks WATCHDOG.yml
python3 validate.py path.yml   # checks any file
```

Checks YAML validity, required fields, unique names, and that every tool is
a known built-in.

## License

MIT. See LICENSE.
