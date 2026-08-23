# omp-advisors

A set of reviewer advisors for OMP (Oh My Pi) coding agents. Drop-in roster
for `~/.omp/agent/WATCHDOG.yml`.

Every advisor runs on every primary turn. OMP has no conditional routing, so
there is no per-turn selection: all enabled advisors review all the time, and
each injects at most one note. You only hear from the advisors with something
real to say. They work as a pipeline: correctness, then security and data,
then architecture and performance, then the human-facing product, then
quality and delivery — with the gaps between them covered by the roles that
own them.

## Why 100

The canonical roster has exactly 100 advisors in five pods of 20. Each role
owns an exclusive, non-overlapping remit — one slice of review no other
advisor owns — and 100 is the point where every meaningful review lens has an
owner.

- **Exclusive remits.** Each of the 100 roles owns exactly one slice of the
  work: invariants, error topology, session lifecycle, migration rollback,
  CLI discoverability, rollback readiness, and so on. No two roles own the
  same lens.
- **Handoff, not duplication.** Near-neighbor pairs across pods
  (e.g. `MigrationSafetyEngineer` vs `MigrationSafetyReviewer`,
  `VersioningDeprecationSentinel` vs `Versioning`) are deliberately split by
  exclusive remit, and each member names the other in its handoff so
  out-of-scope findings route to the owner instead of being re-emitted.
- **Same model, distinct lenses.** Every advisor is pinned to the same model
  (`particle/deepseek-v4-flash-0731:max`), so redundant advisors would not
  add independent opinions — they would echo the same model's blind spots.
  The roster avoids redundancy by design: distinct remits plus handoff
  routing, not more models.
- **Bounded noise.** Overlapping remits emit overlapping findings; with
  exclusive remits and the one-note-per-advisor rule, the notes stay
  non-duplicated (see [Bounded emission](#how-bounded-emission-prevents-spam)).

## The roster

The canonical roster has exactly 100 advisors, five pods of 20. Every one is
explicitly pinned to `particle/deepseek-v4-flash-0731:max`. Fixer is the only
advisor granted mutating tools. Every other advisor holds only non-mutating
analysis tools (see [Tools](#tools)) — none of them can edit, write, or run
state-changing commands.

Cadence vocabulary (a role's activation evidence is evaluated per its
cadence; silence is the spam control):

- `diff` — evaluate every relevant diff turn
- `diff+ms` — per relevant diff turn plus milestone confirmation/sweep
- `sweep` — periodic (release/milestone) sweep
- `continuous` — on signals/alerts
- `walk` — live walkthrough per milestone

### Pod 1 — Correctness (roles 1-20)

Semantics of changed logic: invariants, branches, arithmetic, errors,
coercion, async, validation order, contracts, parsing, shared state,
idempotency, state machines, time, units, resources.

| # | Advisor | Tier | Cadence | Exclusive remit |
|---|---|---|---|---|
| 1 | InvariantLedgerKeeper | T1 | diff | Cross-turn invariant memory; flag contradictions introduced by edits |
| 2 | BranchTruthAuditor | T2 | diff | Boolean/relational defects: inversions, precedence, contradictory branches |
| 3 | BoundaryEdgeCartographer | T2 | diff | Index and extent arithmetic: off-by-one, empty/single collections, page/window edges |
| 4 | ErrorFlowTracer | T2 | diff | Error propagation: swallowed exceptions, discarded returns, partial failure as success |
| 5 | CoercionTrapSpotter | T2 | diff | Implicit conversions: loose equality, truthiness, plus-concat, NaN, radix |
| 6 | IntegerSemanticsAuditor | T2 | diff | Fixed-width and signedness: overflow, truncating casts, division/modulo semantics |
| 7 | FloatPrecisionWatcher | T2 | diff | Binary float fidelity: exact equality, accumulation, representability, money-as-float |
| 8 | TextEncodingSemanticsReader | T2 | diff | String semantics: declared vs actual encoding, code points/graphemes, truncation |
| 9 | AsyncSemanticContinuityChecker | T2 | diff | Async control flow: missing awaits, orphaned work, sync/async signature drift |
| 10 | TrustGateOrderingVerifier | T2 | diff | Validation before first use of external inputs |
| 11 | ContractConformanceTracker | T2 | diff+ms | Code assumptions vs declared contracts (schemas, interfaces, constraints) |
| 12 | ParseFidelityAssurer | T3 | diff | What parsers produce vs what code assumes: dialects, defaults, trailing content |
| 13 | SharedStateSynchronizationMapper | T2 | diff+ms | Mutable state crossing ownership boundaries, stale reads, check-then-act |
| 14 | LockingDisciplineArbiter | T2 | diff | Mutex/atomic mechanics: deadlock, hold-across-await, missed release |
| 15 | ReplayIdempotencyAuditor | T2 | diff | Retry/redelivery idempotency: repeated side effects, dedupe windows |
| 16 | TransitionLegalityGuard | T2 | diff | State-machine conformance: illegal events, missing handlers, terminal-state mutation |
| 17 | TimezoneCalendarAuditor | T3 | diff | Civil time/calendar: naive vs zoned, DST gap/fold, leap days |
| 18 | MonotonicTimingAuditor | T1 | diff | Clock choice for measurement: wall-clock duration math, expiry on the wrong clock |
| 19 | NumericUnitAndRoundingAuditor | T2 | diff | Units (ms/s, bytes/KiB, percent/fraction, currency), rounding modes, totals |
| 20 | ResourceLifecycleSentinel | T2 | diff+ms | Acquire/release symmetry: guaranteed close, unregister, bounded registries |

### Pod 2 — SecurityData (roles 21-40)

Security and privacy of the reachable surface (21-30) plus data-contract and
delivery integrity (31-40).

| # | Advisor | Tier | Cadence | Exclusive remit |
|---|---|---|---|---|
| 21 | AttackSurfaceCartographer | T2 | diff+ms | Externally reachable entry points, trust boundaries, newly exposed paths |
| 22 | IdentityVerifier | T2 | diff | Auth ceremonies: login, MFA, password reset, IdP callback binding |
| 23 | AccessControlExaminer | T2 | diff+ms | Authorization invariants: deny-by-default, ownership, tenant scoping |
| 24 | SessionIntegrityMonitor | T2 | diff | Session/token lifecycle: rotation, fixation, expiry, revocation, cookie attributes |
| 25 | SecretsCustodian | T3 | diff+ms | Credential/secret handling: references not literals, rotation, exposure |
| 26 | PromptInjectionSentinel | T3 | diff | Untrusted content into model context/tools; instruction/data separation |
| 27 | InjectionPathTracer | T3 | diff+ms | Attacker bytes into interpreters: SQL, shell, template, path traversal, deserialization |
| 28 | PrivacyMinimizationSteward | T1 | diff+ms | Purpose limitation and data minimization: unnecessary collection, linkage, retention |
| 29 | DataLifecycleOperator | T1 | diff+ms | Retention, expiry, deletion, export, backups, account closure |
| 30 | DependencyProvenanceAuditor | T3 | diff | Dependency provenance, lockfile integrity, typosquatting, compromised packages |
| 31 | DataIsolationWarden | T2 | diff+ms | Tenant/account/region boundaries in storage access |
| 32 | StorageReliabilityInspector | T2 | diff | Persistence under crash/concurrency/retry; durability matches ack |
| 33 | SchemaEvolutionCurator | T2 | diff+ms | Schema meaning and compatibility across producers/consumers |
| 34 | MigrationSafetyEngineer | T2 | diff+ms | Forward/rollback-safe data transitions: backfills, cutovers, irreversible gates |
| 35 | SerializationContractAuditor | T2 | diff+ms | Faithful, deterministic, bounded encoding/decoding |
| 36 | TypeStateAuditor | T2 | diff+ms | Internal types encode domain invariants; parse at boundaries; exhaustive variants |
| 37 | CacheCoherenceAnalyst | T2 | diff+ms | Cache keys, freshness, invalidation, stampede, stale-on-error |
| 38 | BuildChainGuardian | T3 | diff+ms | CI/build trust: permissions, untrusted PR execution, action pinning |
| 39 | ArtifactIntegrityVerifier | T3 | diff+ms | Artifact attribution, immutability, reproducible/attested, source-traceable |
| 40 | BoundaryFuzzStrategist | T3 | diff+ms | Smallest high-value adversarial/malformed-input experiments for evidence gaps |

### Pod 3 — Architecture (roles 41-60)

Architecture and API contracts (41-44), compatibility (45-46), maintainability
and simplification (47-50), performance (51-52), memory (53-54), algorithms
(55-56), databases (57-58), distributed systems (59-60).

| # | Advisor | Tier | Cadence | Exclusive remit |
|---|---|---|---|---|
| 41 | LayeringBoundaryAuditor | T2 | diff+ms | Dependency direction between modules/layers, cyclic imports |
| 42 | DesignDriftRecorder | T2 | sweep | Implementation vs recorded decisions (ADRs) |
| 43 | ContractDeltaSteward | T2 | diff+ms | Request/response/event schema deltas and caller impact |
| 44 | VersioningDeprecationSentinel | T2 | sweep | API version lifecycle: deprecation windows, removal readiness |
| 45 | WireStateFormatGuard | T2 | diff | Forward/backward compat of serialized payloads and stored records |
| 46 | RuntimeMatrixMonitor | T2 | diff+ms | Behavior across runtimes/platforms/config permutations |
| 47 | ComplexityBudgetKeeper | T2 | diff+ms | Size, nesting, and churn x complexity budgets per unit |
| 48 | KnowledgeMapCurator | T1 | diff | Docs/comments/naming of exported surfaces truthful to behavior |
| 49 | IndirectionPruner | T2 | diff | Single-impl abstractions, pass-through wrappers, one-caller seams |
| 50 | SpeculativeFlexibilityAuditor | T3 | sweep | Unused knobs, branches behind never-set flags, YAGNI surface |
| 51 | CriticalPathLatencyReviewer | T3 | diff+ms | Serial awaits/RPC chains on user-facing paths |
| 52 | ResourceEfficiencyOptimizer | T3 | diff | CPU/alloc/GC, per-request allocations, pool sizing |
| 53 | RetentionLeakSentinel | T3 | continuous | Unbounded growth: caches/maps without eviction, listener retention |
| 54 | CopyLifetimeReviewer | T1 | diff | Avoidable deep copies, oversized buffers, value-vs-reference |
| 55 | AsymptoticComplexityChecker | T1 | diff | Big-O of changed logic, hidden quadratics |
| 56 | DataStructureFitAdvisor | T1 | diff | Representation fit: list-based membership, unmemoized recursion |
| 57 | QueryShapeIndexAuditor | T3 | diff+ms | N+1, non-sargable predicates, index fit, wide SELECTs |
| 58 | MigrationSafetyReviewer | T2 | diff+ms | Schema/DDL rollout mechanics: lock breadth, expand-contract staging |
| 59 | ConsistencyIdempotencyReviewer | T2 | diff | Multi-node correctness: retry/replay idempotency, dual-write windows |
| 60 | PartialFailureContainmentPlanner | T2 | diff+ms | Degradation design: timeouts, bulkheads, circuit breakers, fallbacks |

### Pod 4 — HumanProduct (roles 61-80)

End-user and human-facing product quality: UX, accessibility, i18n, docs,
CLI/TUI, responsive/mobile, trust. Read-only; `browser`/`computer` limited to
roles whose activation is inherently live (rendered pixels, AX tree, key/tab
traversal, terminal screens, touch).

| # | Advisor | Tier | Cadence | Exclusive remit |
|---|---|---|---|---|
| 61 | OnboardingFlow | T4 | diff+walk | First-run journey, install-to-first-value |
| 62 | ErrorMessaging | T2 | diff | User-facing failure text: plain language, next action, no internals |
| 63 | CopyVoice | T1 | diff | Microcopy tone and terminology consistency |
| 64 | ProgressFeedback | T4 | diff | Waiting experience: progress, cancellability, optimistic updates |
| 65 | FormUX | T4 | diff | Input forms: validation timing, messages, autofill, submit-disable |
| 66 | NavigationIA | T4 | walk | Information architecture, wayfinding, 3-step findability |
| 67 | VisualHierarchy | T4 | diff | Typographic scale, spacing, emphasis, alignment, density |
| 68 | KeyboardInteraction | T4 | diff | Full keyboard operability, focus, shortcuts, escape routes |
| 69 | ScreenReaderFlow | T4 | walk | End-to-end screen-reader journeys: roles, labels, announcement order |
| 70 | CognitiveLoad | T1 | walk | Mental overhead: choices, jargon, progressive disclosure |
| 71 | TranslationQuality | T3 | diff | Translated-string fidelity, glossary breaches |
| 72 | LocaleFormatting | T3 | diff | Per-locale dates/numbers/currency/plurals, RTL, pseudolocale |
| 73 | DocsAccuracy | T2 | diff | Docs-vs-code truth: flags exist, examples match output |
| 74 | DocsFindability | T1 | sweep | Reader can find answers: TOC, search terms, cross-links |
| 75 | CLIDiscoverability | T2 | diff | Terminal first contact: help layering, flag naming, hints |
| 76 | TUIInteraction | T4 | diff+ms | Terminal screens: resize/reflow, keyboard-only, legibility |
| 77 | WebResponsive | T4 | diff | Browser layouts across viewports/orientations, 200% zoom |
| 78 | MobileGestures | T4 | walk | Touch behavior: gesture conflicts, safe areas, keyboard interaction |
| 79 | TrustSignals | T3 | diff | Honest user-facing commitments: consent wording, confirm/undo |
| 80 | DeceptivePatterns | T1 | walk | Dark patterns: confirmshaming, fake urgency, hidden costs |

### Pod 5 — QualityDelivery (roles 81-100)

Test design and coverage (81-84), verification and delivery discipline
(85-93), operational quality (94-100). All roles read-only except `Fixer` (the
sole mutation-capable role).

| # | Advisor | Tier | Cadence | Exclusive remit |
|---|---|---|---|---|
| 81 | UnitTestDesign | T2 | diff | Unit tests at public seams, observable behavior, boundaries |
| 82 | IntegrationTests | T2 | diff | Cross-boundary tests genuinely exercise the interaction |
| 83 | EndToEndTests | T4 | walk | Full user-journey tests through the real stack |
| 84 | TestCoverage | T2 | diff+ms | Coverage gaps on changed lines and critical failure paths |
| 85 | Verifier | T1 | diff | Claims vs evidence; verdicts VERIFIED / ISSUES FOUND / BLOCKED |
| 86 | Scope | T1 | diff | Scope discipline: exactly the named ask, no creep, no stub-as-done |
| 87 | Fixer | T5 | diff | Only mutation-capable role; reproduce, smallest root-cause repair, disclose |
| 88 | CI | T3 | diff+ms | Pipeline correctness: right jobs/triggers, truthful signal |
| 89 | BuildReproducibility | T3 | diff+ms | Same inputs -> same artifact; pinned inputs, no drift |
| 90 | ReleaseReadiness | T2 | sweep | Release gate: changes landed, tests green, docs aligned |
| 91 | Versioning | T1 | diff | Semver discipline; VERSION/tags/changelog aligned |
| 92 | DependencyHealth | T3 | diff+ms | Dependency hygiene: maintenance, licenses, abandonment |
| 93 | DependencyUpdates | T3 | diff | Impact of a proposed update: breaking changes, rollback ease |
| 94 | Configuration | T2 | diff | Config correctness: declared surface, sane defaults, validation |
| 95 | Logs | T2 | diff | Logging correctness: structured, level-appropriate, no secrets/PII |
| 96 | Metrics | T2 | diff | Metric definitions: names, units, tags, alertability stable |
| 97 | Reliability | T2 | diff+ms | SLOs defined/measured, redundancy/failover, acceptable degradation |
| 98 | IncidentReadiness | T2 | sweep | Runbooks/playbooks, escalation paths, drillability |
| 99 | DeploymentSafety | T2 | diff | Deploy mechanics: staged rollout, canary gates, abort criteria |
| 100 | Rollback | T2 | sweep | Rollback readiness: clean revert, feature flags, safe state path |

## How bounded emission prevents spam

All 100 advisors are always-on and proactive: each one evaluates its
activation evidence on every relevant primary turn, with no per-turn
selection and no need to be summoned. What stops them from spamming is not
passivity — it is a shared emission contract:

- **Evaluate silently when there is nothing to say.** A role evaluates every
  relevant turn; when activation evidence is absent, it stays silent. Silence
  is the spam control, not the absence of the role.
- **At most one note per update; at most one issue per note.** A note names
  one concrete issue, next action, drift, evidence gap, or milestone
  resolution. No generic status lines, no running commentary.
- **No unchanged repeats.** A role does not re-emit a finding unless new
  evidence changes it, the related code changes again, or three relevant
  turns have passed.
- **Milestone confirmation only.** A confirmation note is emitted only to
  close a previously named uncertainty — a named fix verified, a named path
  exercised, a named gap closed.

So the advisors are proactive (they evaluate continuously and surface what
matters without being asked) and bounded (each speaks at most once per update
and only when it has something material to say).

## Severity usage

Every note is patch-anchored to the evidence that produced it (file/symbol/
line or command/output). Severity follows a ladder:

- `nit` — useful, non-blocking guidance (small improvement, minor risk).
- `concern` — probable correctness or scope failure, or an actionable risk
  worth fixing.
- `blocker` — imminent irreversible harm (data loss, secret publication,
  destructive action about to land). Rare; must name the exact irreversible
  consequence.

Secrets observed in tool output are never printed, logged, or committed.

## Tools

Every advisor runs with the narrowest tool tier its remit needs. The ladder
is cumulative; roles never escalate beyond their tier, and none of the 99
non-`Fixer` roles can run mutating commands.

| Tier | Capabilities | Notes |
|---|---|---|
| T1 | `read`, `glob`, `grep` | Diff and touched files only |
| T2 | T1 + `ast_grep`, `lsp`, whole-repo `read` | Symbol/type/contract resolution across the repo |
| T3 | T2 + `web_search`, `security_scan`, runtime traces, `EXPLAIN`, metrics, CI-run status, artifact metadata | All read-only; runtime or external evidence |
| T4 | T2/T3 base + `browser` / `computer` observation only | Inherently live-render evidence (pixels, AX tree, terminal screens, touch); no input injection |
| T5 | T2 + `edit`, `write`, `bash`, `eval`, `debug`, `ast_edit` | Sole exception: `Fixer` only |

Rules:

- All 99 non-`Fixer` roles are read-only in the repo-state sense — their
  tools inspect, search, and analyze, never edit, write, or run
  state-changing commands.
- `security_scan` is restricted to evidence-tier (T3) roles whose activation
  involves untrusted bytes or artifacts.
- Credential files are never read unless the authorized task requires that
  exact secret; secrets surfacing in tool output are redacted.
- The canonical roster never grants `github`, `task`, or `hub` to any
  advisor: reviewers do not reach out to services, spawn subagents, or
  message peers.
- It also grants none of the state-touching request/memory tools (`ask`,
  `checkpoint`, `retain`, `recall`, `reflect`) or the memory-management tools
  (`memory_edit`, `learn`, `manage_skill`) to anyone — the validator would
  permit those only on `Fixer`, but the shipped roster stays under that
  ceiling by granting them to nobody.

## Model

Every canonical advisor pins its model explicitly:

```yaml
model: particle/deepseek-v4-flash-0731:max
```

A custom roster may omit `model` on any entry to inherit the
`modelRoles.advisor` default instead.

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

- The canonical roster sets `model: particle/deepseek-v4-flash-0731:max`
  on every advisor. A custom roster may omit `model` to use
  `modelRoles.advisor`.
- A custom (non-canonical) roster may grant any built-in tool, including
  mutating ones. The canonical roster is stricter: it follows the tool tiers
  above, and `validate.py --canonical` enforces them (see
  [Validate](#validate)).
- `enabled: false` keeps an entry listed but paused. The canonical roster
  has every entry `enabled: true`.
- Duplicate advisor names across project and user files: the project-level
  entry wins.

## Personal policy advisor

Your own rules are yours, so a template ships instead of a working advisor:
`examples/owner-policy.yml`. Copy the block into your `WATCHDOG.yml`, fill
in the placeholders, set `enabled: true`.

## Validate

```sh
python3 validate.py                       # checks WATCHDOG.yml
python3 validate.py path.yml              # checks any file
python3 validate.py --canonical WATCHDOG.yml   # strict canonical check
```

General mode checks YAML validity, required fields, unique non-empty names,
non-empty `instructions`, and that every tool is a known built-in.

Canonical mode adds the strict guarantees for the shipped roster:

- exactly **100 advisors**, five pods of 20
- every advisor has `enabled: true` (a missing `enabled` is an error)
- every advisor is pinned to `model: particle/deepseek-v4-flash-0731:max`
- the least-privilege tool policy:
  - `github`, `task`, and `hub` are never granted to any advisor
  - mutating and state-touching tools are granted only to the advisor named
    `Fixer`
  - `browser` and `computer` are granted only to the T4 live-evidence roles
    whose activation is inherently live-render

## Scaling the runtime

With 100 advisors all running every turn, keep the advisor runtime from
stalling on backlog:

```yaml
advisor:
  enabled: true
  syncBacklog: off
```

This is a scheduling recommendation, not a roster change: it does not alter
which advisors run. All 100 enabled advisors still review on every primary
turn.

## License

MIT. See LICENSE.
