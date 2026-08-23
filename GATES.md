# Fusion release gates

- [x] G1 Fusion tests pass
  CHECK: bun test fusion/
  EXPECT: exit 0
  EVIDENCE: exit 0 — 60 pass / 0 fail across 3 files (263 expectations), bun test v1.3.14
- [x] G2 Fusion source typechecks
  CHECK: bunx tsc --noEmit --skipLibCheck --module esnext --moduleResolution bundler --allowImportingTsExtensions fusion/core.ts fusion/benchmark.ts fusion/index.ts
  EXPECT: exit 0
  EVIDENCE: exit 0 — no type errors reported
- [x] G3 Canonical roster remains valid
  CHECK: python3 validate.py --canonical --check-contract WATCHDOG.yml
  EXPECT: exit 0
  EVIDENCE: exit 0 — "OK: 100 advisors, all checks passed"
- [x] G4 Diff has no whitespace errors
  CHECK: git diff --check
  EXPECT: exit 0
  EVIDENCE: exit 0 — no whitespace errors reported
- [x] G5 Independent correctness review passes
  EVIDENCE: independent final grade PASS — bounded core, cancellation, evidence/dissent, explicit-only behavior, async baseline comparison, and installed load compatibility; no blockers
- [x] G6 Live extension loads and explicit command registers
  EVIDENCE: isolated installed OMP loader loaded the bundle, registered `/fusion` and `session_shutdown`, and completed a bounded two-candidate injected command; 29 checks passed
- [x] G7 Repository commit and normal push succeed
  EVIDENCE: commit `fdc7a0f` created on `agent/fusion-extension`; normal push created and tracks `origin/agent/fusion-extension`
- [x] G8 Deployment is byte-identical to committed extension package
  EVIDENCE: `cmp fusion/fusion.js ~/.omp/agent/extensions/fusion.js` exit 0; both SHA-256 `011315055719301026ba5c1bafe57e9aec4f02a4f0571dba5d530ad60f9426ce`; `pi --no-extensions -e ~/.omp/agent/extensions/fusion.js --help` exit 0
