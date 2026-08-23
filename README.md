# omp-advisors

A proactive, world-context advisor roster for the Oh My Pi agent harness.
`WATCHDOG.yml` defines exactly 100 advisors spanning software and the rest
of Kartik's work, life, and world. `validate.py` enforces the canonical
shape of that file.

## Canonical roster

Exactly 100 advisors, all enabled, every one pinned to
`particle/deepseek-v4-flash-0731:max`. The roster is organized into 13
domains:

| Domain | Count |
|---|---|
| software/technical | 16 |
| product/business | 9 |
| finance/legal/admin | 8 |
| career/learning | 8 |
| health/wellbeing | 8 |
| relationships/communication | 7 |
| home/logistics | 7 |
| travel/local/world affairs | 7 |
| research/epistemics | 7 |
| security/privacy | 7 |
| creativity/writing | 5 |
| long-term planning | 5 |
| personal operations | 6 |
| **Total** | **100** |

### software/technical (16)

CodeCorrectnessReviewer, InvariantKeeper, SecurityCodeAuditor,
PerformanceProfiler, ArchitectureConsistency, DependencyHealthWatcher,
BuildAndCIWatchdog, ReleaseReadinessGate, ReliabilityEngineer,
DataIntegrityAuditor, TestQualityAdvisor, DocumentationTruthkeeper,
ToolingAndScriptsSentinel, OperationalTelemetryWatcher, TechDebtChronicler,
EnvironmentCompatibilityScout.

### product/business (9)

ProductStrategyAdvisor, UserNeedsListener, FeatureScopeGatekeeper,
PricingAndMonetizationAdvisor, GrowthAndRetentionAnalyst,
GoToMarketPlanner, CompetitiveIntelligenceScout,
StakeholderCommunicationCoordinator, ProductQualitySentinel.

### finance/legal/admin (8)

CashflowAndBudgetWatcher, TaxTimelineTracker, ContractReviewAdvisor,
SubscriptionAndSpendAuditor, ComplianceCalendarKeeper,
AdministrativeTaskManager, InsuranceAndProtectionAdvisor,
MajorPurchaseAdvisor.

### career/learning (8)

SkillGapMapper, LearningPlanCurator, JobMarketRadar,
PortfolioAndReputationBuilder, MentorshipNetworkAdvisor, InterviewPrepCoach,
FeedbackIntegrationAdvisor, CareerPivotScout.

### health/wellbeing (8)

SleepAndEnergyWatcher, FitnessActivityPlanner, NutritionHabitAdvisor,
MentalWellbeingCompanion, MedicalAppointmentTracker, ErgonomicPostureWatcher,
HabitFormationCoach, RecoveryAndRestPlanner.

### relationships/communication (7)

RelationshipMaintenanceAdvisor, CommunicationCoach, BoundaryEnforcer,
FamilyAndFriendsCoordinator, NetworkingConnector, ConflictResolutionAdvisor,
SocialEnergyBalancer.

### home/logistics (7)

HomeMaintenanceScheduler, GroceryAndMealLogistics,
HouseholdBudgetOperations, OrganizationAndDeclutterCoach,
HomeAutomationOptimizer, DeliveryAndPackageTracker, UtilitiesAndServiceAuditor.

### travel/local/world affairs (7)

TripPlanner, TravelSafetyMonitor, LocalAreaExplorer, WorldAffairsBrief,
CurrencyAndLogisticsAdvisor, EventAndDeadlineCalendar, WeatherAndConditionsWatcher.

### research/epistemics (7)

DeepResearchLead, FactCheckAndVerification, SunkCostAndBiasAuditor,
EvidenceQualityAssessor, DecisionFrameworkAdvisor, CuriosityTracker,
InformationDietCurator.

### security/privacy (7)

DigitalHygieneAuditor, ThreatAndBreachMonitor, PrivacyProfileManager,
BackupAndRecoveryWatchdog, IdentityAndAccountGuard, SecureCommsAdvisor,
PhysicalSecurityAwareness.

### creativity/writing (5)

WritingCoach, IdeaGardenCurator, CreativeProjectSteward,
ContentCalendarPlanner, EditingAndPolishPass.

### long-term planning (5)

VisionAndGoalsKeeper, QuarterlyReviewer, ScenarioPlanner,
LegacyAndImpactAdvisor, MilestoneTracker.

### personal operations (6)

TimeAllocationAuditor, TaskAndProjectManager, EmailAndInboxKeeper,
MeetingAndCalendarOptimizer, DailyRoutineStabilizer, EnergyAndFocusManager.

## Tool model

Every role is granted the same broad common tool tier
(`x-tool-tiers.common`), so no role-specific restriction can quarantine a
response when a tool is unavailable:

```
read, glob, grep, ast_grep, lsp, web_search, browser, computer, bash,
edit, write, eval, debug, ast_edit, security_scan, inspect_image, todo, yield
```

The uniform grant is deliberate. An advisor may request and use any tool
its work needs; roles differ by remit, activation, cadence, and handoff,
never by tools. Remote side-effect tools (`github`, `task`, `hub`, `ask`,
`checkpoint`, `retain`, `recall`, `reflect`) and memory/state tools
(`memory_edit`, `learn`, `manage_skill`, `rewind`) are never granted, so an
advisor cannot act outside the conversation or change long-lived state
behind the main agent's back. Notifications use normal advisor note
delivery.

## Reporting and behavior contract

The shared `instructions` block in `WATCHDOG.yml` is a hard contract that
`validate.py` enforces. Every advisor must follow it.

- Act on your own initiative. Evaluate every relevant turn without being
  asked, including tool-less user turns and ambient conversation evidence
  (messages, notes, calendar, files, web results), not only your own tool
  activity. Scan at your named cadence and when your Activation line
  matches; emit while evidence is live.
- Report everything. Report every action and every meaningful observation
  to the main agent: tool calls run, pages opened, state checked,
  discoveries, changes, opportunities, and risks. A note lists the action,
  its target, its result, and any change it caused.
- Notify before mutation. Before any mutation (edit, write, bash, eval,
  debug, ast_edit that changes state), notify the main agent of the planned
  action, its target, and its expected effect. Wait for a green light when
  the change is consequential.
- Report after action. After any tool action, report the tool used, the
  target, the result, and any change. No tool action goes unreported.
- No silent action. If you acted, you report it; if you saw something, you
  report it. Consequential or irreversible actions still need main/user
  approval under host policy; pre-action notification does not waive that.
- No unchanged repeats. Do not re-emit a finding unless new evidence
  changes it, the subject changes again, or three relevant turns have
  passed. At most one consolidated note per role per update, one issue per
  note.
- Evidence anchors. Every note names the file, symbol, line, command,
  source, or date that produced it. No claims without backing.
- High-impact limits. Finance, legal, and health advisors give information
  and escalation only. They never decide, buy, sign, diagnose, or dose.
  Every choice stays with the main agent and with Kartik.
- Handoff, not duplication. Report only within your exclusive remit; route
  out-of-scope findings to the owning advisor named in your
  `Excludes/handoff` line.

Each advisor's `instructions` block states, on its own labeled lines:
`Remit:` (what it watches for), `Activation:` (when it activates),
`Cadence:` (how often it evaluates), `Excludes/handoff:` (what it hands
off), and `Tooling:` (which tools and reporting rules the role follows).
Advisors in high-impact domains must restate the information-and-
escalation-only limit in their own instructions.

## Validation

```bash
python3 validate.py --canonical WATCHDOG.yml     # full canonical check
python3 validate.py --canonical --check-contract WATCHDOG.yml  # contract table
python3 -m py_compile validate.py                # syntax check
git diff --check                                 # whitespace check
```

The canonical check enforces: exactly 100 unique enabled advisors; exact
per-domain counts (16/9/8/8/8/7/7/7/7/7/5/5/6); the exact model on every
role; the shared broad common tool tier on every role (and no forbidden
tool); the shared hard contract phrases (initiative over tool-less turns
and ambient evidence, notification of every action/observation, pre-
mutation notice, post-action reporting, no silent action, no unchanged
repeats, evidence anchors, high-impact limits); the five per-role label
lines; and per-role high-impact limits for finance/legal/admin and
health/wellbeing roles.

The validator rejects a roster that drops any mandatory phrase, grants a
role a different tool set, misses a domain count, uses another model,
disables an advisor, or omits a required label line.

## Fusion extension

`fusion/` adds a bounded, dependency-free fusion operator to OMP:
`core.ts` (domain logic and stopping rules), `index.ts` (the OMP
extension), and `benchmark.ts` (single-agent comparison), each with a
`*.test.ts` suite. It runs on the installed Bun and typechecks with the
installed TypeScript; it adds no dependencies.

### Commands

```bash
bun run test:fusion   # focused fusion tests (bun test fusion/)
bun run typecheck     # tsc --noEmit over the fusion source files
```

`typecheck` covers the three source files (`core.ts`, `benchmark.ts`,
`index.ts`) and resolves `@oh-my-pi/pi-coding-agent` types from the OMP
runtime install; run it where that package's types are reachable. The
`*.test.ts` suites are not typechecked by `tsc` because they import
`bun:test`, whose types only Bun's runtime resolves; they are exercised
by `bun test fusion/` instead. The deployed extension resolves the same
import at runtime.

The benchmark harness has no CLI entry. `fusion/benchmark.ts` is a
deterministic, injected library (no CLI parsing, network, or filesystem
access): bind real runners into `await runBenchmark({ cases, baseline,
fusion, signal? })` and read the returned summary (per-case metrics plus
totals), or serialize it with `stableStringify`. Runners may be
synchronous or asynchronous and report their own duration in
`durationMs`. Errors are counted per side: `baselineErrors` / `fusionErrors`
on each case, and `totalBaselineErrors` / `totalFusionErrors` (plus the
combined `totalErrors`) in the totals. The harness imposes no timeout of
its own; a caller that needs a hard per-run limit implements it inside
its runner. `bun test fusion/` exercises the harness through
`benchmark.test.ts`. There is no `bun run benchmark` command.

### Invocation

The extension is explicit-only. Invoke `/fusion <prompt>` in the OMP
agent. It never runs on turns or in response to tool activity; it runs
only when you type the command. The command reports its phases as it
goes and injects the final derived synthesis as a custom message, not as
an automatic assistant turn.

### Bounds, defaults, and stopping

- The candidate budget is clamped to the hard bound of 2-8
  (`MIN_CANDIDATES` / `MAX_CANDIDATES`). Defaults: minimum 2 candidates,
  maximum 4 (`DEFAULT_MAX_CANDIDATES`), quality threshold 0.9, marginal
  gain threshold 0.02. `FusionOptions` overrides each within its clamp.
- A run stops at the earliest of: the running best reaches the quality
  threshold after the minimum candidate count; the newest candidate
  improves the incumbent best by at most the marginal gain threshold;
  the candidate budget is exhausted; or the run is aborted.

### Output: evidence and dissent

The judge dependency scores each candidate 0..1 and returns evidence
(the reasoning that backs the score) and dissent (minority or opposing
notes). The final synthesis is derived from the retained evidence and
surfaced with the stop reason.

### Cancellation

Each run carries one `AbortSignal`. The extension wires it to
`session_shutdown`, so ending or reloading the session aborts any
in-flight run cleanly. Every native `pi.exec` candidate and judge call
also pairs that signal with a fixed bounded timeout
(`NATIVE_EXEC_TIMEOUT_MS`, 120 seconds) so a hung child cannot stall the
run indefinitely.

### No automatic mutation

The extension never patches, edits, writes, or executes code on its own.
It only runs candidate evaluations and reports results. Nothing it does
changes your files, config, or state.

### Deployment

The main agent deploys `fusion/index.ts` byte-identical as
`~/.omp/agent/extensions/fusion.ts`. The deployed file registers the
`/fusion` command and the `session_shutdown` abort; it does not auto-run
on turns.

## Non-goals

This repository defines and validates the canonical roster. It does not
deploy the roster to the live `~/.omp` runtime, and it does not touch
the Pi advisor repo. The one exception is the fusion extension:
`fusion/index.ts` is deployed by the main agent as
`~/.omp/agent/extensions/fusion.ts` (see Fusion extension above).
Deployment and runtime wiring are handled elsewhere.
