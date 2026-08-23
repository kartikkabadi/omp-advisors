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

## Non-goals

This repository defines and validates the canonical roster. It does not
deploy to the live `~/.omp` runtime, and it does not touch the Pi advisor
repo. Deployment and runtime wiring are handled elsewhere.
