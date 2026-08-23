# Delegation plan
Units: 6

| # | Unit | Files (mine) | Worker | Acceptance | Status | Evidence |
|---|---|---|---|---|---|---|
| 1 | Build bounded fusion domain core | fusion/core.ts, fusion/core.test.ts | FusionCore | Bounded fan-out, adaptive stopping, evidence, dissent, and abort behavior pass focused tests | verified | `bun test fusion/`: 60 pass / 0 fail; source typecheck exit 0 |
| 2 | Build OMP extension integration | fusion/index.ts, fusion/index.test.ts | FusionExtension | Native command and shutdown lifecycle work without hidden mutation | verified | Installed loader registered `/fusion` and `session_shutdown`; full injected command path passed |
| 3 | Build benchmark harness | fusion/benchmark.ts, fusion/benchmark.test.ts | FusionBenchmark | Deterministic single-agent comparison emits measurable JSON | verified | Async baseline/fusion and split error metrics covered by passing suite |
| 4 | Add package and operator docs | package.json, README.md | FusionDocs | Typecheck/test commands and operating contract are documented | verified | Scripts ran; README matches timeout and async benchmark contract |
| 5 | Independent implementation review | read-only fusion artifacts | FusionReviewer | Correctness, cancellation, security, and scope findings resolved | verified | Independent grade PASS after findings were fixed; no blockers |
| 6 | Live deployment and smoke test | ~/.omp/agent/extensions/fusion.js | Main | Installed byte-identical bundle loads and bounded dry run succeeds | pending | Isolated installed-loader smoke passed; live deployment pending |

## Evidence

- Unit 1: `bun test fusion/` → 60 pass / 0 fail across 3 files (263 expectations), exit 0. `bun run typecheck` → exit 0.
- Unit 2: installed OMP loader registered `/fusion` and `session_shutdown`; an injected two-candidate command retained evidence and dissent without spawning Pi.
- Unit 3: passing tests cover asynchronous baseline/fusion runners and separate baseline/fusion error totals.
- Unit 4: scripts ran successfully; README documents explicit invocation, the 2-8 bound, 120-second native child timeout, cancellation, and async benchmark use.
- Unit 5: independent final grade returned PASS for all six release contracts with no substantive blocker.
- Unit 6: isolated installed-loader smoke passed. Live deployment, byte comparison, commit, and push remain for Main.
