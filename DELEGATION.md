# Delegation plan
Units: 5

| # | Unit | Files (mine) | Worker (subagent) | Acceptance | Status |
|---|---|---|---|---|---|
| 1 | Design 100 exclusive advisor roles | `local://advisor-100-taxonomy.md` | taxonomy-designer | Exactly 100 distinct roles grouped by domain, each with ownership and activation evidence | verified: 5 pods x 20 unique roles |
| 2 | Build 100-advisor canonical roster | `WATCHDOG.yml` | roster-builder | Exactly 100 enabled DSV4F-max advisors with proactive bounded emission and least privilege | verified: canonical validation passed |
| 3 | Enforce 100-advisor canonical contract | `validate.py` | validator-builder | Canonical mode requires count/model/enabled/tool/emission contracts | verified: positive and 300 label-removal checks passed |
| 4 | Document 100-advisor operating model | `README.md` | docs-builder | README lists 100 roles and accurately explains proactive non-spam behavior | verified: names and behavior matched roster/runtime |
| 5 | Tune and deploy live configuration | `~/.omp/agent/config.yml`, `~/.omp/agent/WATCHDOG.yml` | live-deployer | syncBacklog off; live roster byte-identical to canonical | verified: cmp and config checks passed |
