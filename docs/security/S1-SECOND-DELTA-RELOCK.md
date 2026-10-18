# S1 current-main second delta relock — supplementary relock report

This is the report of the supplementary relock. It does not issue an independent PASS: it is the work product of an integrator and reconciler, prepared for a fresh independent review.

**Three layers, kept apart.** The original S0/S1 audit was performed on the original frozen source. The first relock reviewed the range from that source to the first relock target and is preserved, unchanged in meaning, in `docs/security/S1-CURRENT-MAIN-DELTA-RELOCK.md`. This report is the second layer: it reviews only the range from the first relock target to the second relock target, on the tree that integrates the final commit of the first relock lane into the second target. It replaces nothing: a finding of an earlier layer keeps its identifier, its attribution and its owner.

**Source of truth.** The canonical risk register (`docs/security/s1-risk-register.json`) is the only place a severity, a production state, a score or a priority is written. This report and its machine-readable counterpart (`docs/security/s1-second-relock-delta.json`) hold **provenance only**: the commit range, the call-site linkage and the evidence behind each second-layer finding. Wherever a severity appears below it is a read-only projection of the register, recomputed by `scripts/security/s1/relock-delta-check.mjs --layer=2` and compared byte for byte.

Every table in this report is generated. A figure typed into the prose between the tables would be a second source, so the checker refuses a digit-led count in the narrative.

## 1. The commits and scopes this report keeps apart

<!-- RELOCK-BLOCK:scopes -->
| Name | Commit | What it is |
|---|---|---|
| Original frozen source | `bcf3be9aa51f8d9f8f75e5568a2e4efea5f8fbd2` | The tree the S0/S1 audit was performed on; changed by neither relock. |
| First relock target | `b461ac9709d6e82973de2b05f15317381c2fcc73` | Main as authorized for the first relock; the base of this delta. |
| Security head | `1faa877ae3871b065a6e396a3ba68f29b5e08940` | Final commit of the first relock lane. |
| Second relock target | `66ca4cccd51ca3c9c90933a82f8851bbde0a615e` | Main as authorized for the supplementary relock. |
| Integration merge | `c32556591f12965804dfd537f107f9b8b22eec52` | Merge of the security head into the second target; parents in that order. |
<!-- /RELOCK-BLOCK:scopes -->

The first relock lane ended at the security head named above. The integration merge has the second relock target as its first parent and the security head as its second, and the only manual resolution in it is `.gitattributes`, where both blocks were kept. No product file was changed by hand.

## 2. What the delta contains

<!-- RELOCK-BLOCK:delta -->
| Measure | Value |
|---|---|
| Range | `b461ac97..66ca4ccc` |
| Commits (all / non-merge) | 68 / 35 |
| Changed paths (added / modified / deleted / renamed) | 100 (46 / 54 / 0 / 0) |
| STRICT_PRODUCT_PATHS | 47 |
| BROAD_RUNTIME_AFFECTING_PATHS | 53 |
| API route files | 2 |
| Pages | 9 |
| Models / enums / migrations added | 0 / 0 / 2 |
| Auth, session, middleware, proxy or nginx named product paths | 1 (`src/app/[locale]/articles/author/[handle]/page.tsx`) |

STRICT_PRODUCT_PATHS is a changed path outside docs/, .github/ and scripts/ that is not a test file (a __tests__/ directory or a .test. or .spec. name) and is not .gitattributes.
BROAD_RUNTIME_AFFECTING_PATHS is a changed path outside docs/ that is not a test file and is not .gitattributes, so it adds the workflows and the scripts to the strict set.
<!-- /RELOCK-BLOCK:delta -->

## 2a. The ledger of every changed path

Every path the range changed has one row, so that the completeness of the sweep is a property of this table and not of the prose. Each row is built from git (the change type, the blob at each end, the strict and broad classification, the category) and from the reviewer's recorded disposition. A row counts as reviewed only when its disposition names the same path, the same change type and the same blob that git reports now, so a later edit of any of those files makes its row stale and fails the check. A row that is security-relevant must name the finding or the observation that cites the path as evidence, and the finding or the observation must cite the path in turn. The counts of section 2 are derived from this table, never typed.

<!-- RELOCK-BLOCK:pathledger -->
| Measure | Value |
|---|---|
| Changed paths in the ledger | 100 |
| Added / modified / deleted / renamed | 46 / 54 / 0 / 0 |
| Strict product paths / broad runtime-affecting paths | 47 / 53 |
| Security-relevant paths | 41 |
| Paths with a valid recorded review | 100 |
| Missing / extra / duplicate / stale | 0 / 0 / 0 / 0 |

| Category | Paths |
|---|---|
| API_ROUTE | 2 |
| ASSURANCE_CONFIG | 1 |
| DEPLOY_AND_RUNTIME_CONFIG | 14 |
| DOCUMENTATION | 12 |
| LIBRARY | 16 |
| LOCALIZATION | 3 |
| MIGRATION | 2 |
| PAGE | 10 |
| SCHEMA | 1 |
| TEST | 34 |
| UI_COMPONENT | 5 |

| Disposition | Paths |
|---|---|
| ASSURANCE_CONFIGURATION | 1 |
| DOCUMENTATION_ONLY | 12 |
| FINDING_EVIDENCE | 13 |
| LOCALIZATION_COPY | 3 |
| POSITIVE_CONTROL_EVIDENCE | 28 |
| REVIEWED_NO_SECURITY_EFFECT | 10 |
| TEST_ONLY | 33 |

| Path | Type | Category | Strict | Broad | Security | Disposition | Findings | Controls | Target blob |
|---|---|---|---|---|---|---|---|---|---|
| `.gitattributes` | M | ASSURANCE_CONFIG | no | no | no | ASSURANCE_CONFIGURATION | none | none | 8c2ab37cfe |
| `.github/workflows/deploy.yml` | M | DEPLOY_AND_RUNTIME_CONFIG | no | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P02` | c5fe10a165 |
| `.gitignore` | M | DEPLOY_AND_RUNTIME_CONFIG | yes | yes | no | REVIEWED_NO_SECURITY_EFFECT | none | none | 1dd675ea39 |
| `Dockerfile` | M | DEPLOY_AND_RUNTIME_CONFIG | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P02` | b8f41a941d |
| `docker-compose.prod.yml` | M | DEPLOY_AND_RUNTIME_CONFIG | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P02` | 6a64845e1a |
| `docs/executive-dashboard/PRODUCTION-OBSERVATIONS-2026-10-14.md` | A | DOCUMENTATION | no | no | no | DOCUMENTATION_ONLY | none | none | f095216655 |
| `docs/executive-dashboard/REQUIREMENTS-TRACKER.md` | M | DOCUMENTATION | no | no | no | DOCUMENTATION_ONLY | none | none | fb5bc6886f |
| `docs/executive-dashboard/ROW10-RECIPIENT-AUTHORIZATION-QUERY.sql` | A | DOCUMENTATION | no | no | no | DOCUMENTATION_ONLY | none | none | 0a896b559c |
| `docs/executive-dashboard/STAGE-13-SLICE-G3-CUSTOMERS-IN-VIEW.md` | M | DOCUMENTATION | no | no | no | DOCUMENTATION_ONLY | none | none | bdddae48ac |
| `docs/executive-dashboard/STAGE-14-SLICE-I-PERFORMANCE.md` | A | DOCUMENTATION | no | no | no | DOCUMENTATION_ONLY | none | none | e70bfce9ff |
| `docs/executive-dashboard/STAGE-15-SLICE-J-CUSTOMER-FOLLOW-UPS.md` | A | DOCUMENTATION | no | no | no | DOCUMENTATION_ONLY | none | none | 6369dc572b |
| `docs/executive-dashboard/STAGE-16-NIGHTLY-PRIORITIES.md` | A | DOCUMENTATION | no | no | no | DOCUMENTATION_ONLY | none | none | 18e328b8b7 |
| `docs/release/deploy-assurance-findings-2026-10.md` | A | DOCUMENTATION | no | no | no | DOCUMENTATION_ONLY | none | none | 894a5953b7 |
| `docs/release/seo-author-archive-governance.md` | A | DOCUMENTATION | no | no | no | DOCUMENTATION_ONLY | none | none | 37605714a6 |
| `docs/seo/HERMES_KEYWORD_INTENT_MAP_2026-10-15.md` | A | DOCUMENTATION | no | no | no | DOCUMENTATION_ONLY | none | none | b268cef892 |
| `docs/seo/HERMES_SEO_IMPLEMENTATION_REPORT_2026-10-15.md` | A | DOCUMENTATION | no | no | no | DOCUMENTATION_ONLY | none | none | c0289b3457 |
| `docs/seo/HERMES_SEO_TECHNICAL_BASELINE_2026-10-15.md` | A | DOCUMENTATION | no | no | no | DOCUMENTATION_ONLY | none | none | e561d70935 |
| `messages/de.json` | M | LOCALIZATION | yes | yes | no | LOCALIZATION_COPY | none | none | b78a87be24 |
| `messages/en.json` | M | LOCALIZATION | yes | yes | no | LOCALIZATION_COPY | none | none | ad540bc3fc |
| `messages/fa.json` | M | LOCALIZATION | yes | yes | no | LOCALIZATION_COPY | none | none | b7e4d3ae16 |
| `ops/backup/README.md` | A | DEPLOY_AND_RUNTIME_CONFIG | yes | yes | no | REVIEWED_NO_SECURITY_EFFECT | none | none | 2bf1ba7236 |
| `ops/backup/hermes-pg-backup.service` | A | DEPLOY_AND_RUNTIME_CONFIG | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P02` | 5092540a0f |
| `ops/backup/hermes-pg-backup.timer` | A | DEPLOY_AND_RUNTIME_CONFIG | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P02` | bde57c77cb |
| `package.json` | M | DEPLOY_AND_RUNTIME_CONFIG | yes | yes | yes | FINDING_EVIDENCE | `RS-003` | none | bbafca2e8f |
| `prisma/__tests__/lock-timeout-baseline.json` | A | TEST | no | no | no | TEST_ONLY | none | none | e29d39b4c0 |
| `prisma/__tests__/migration-lock-timeout.test.ts` | A | TEST | no | no | no | TEST_ONLY | none | none | 32bdaab5c2 |
| `prisma/__tests__/phase102-migration-safety.test.ts` | M | TEST | no | no | no | TEST_ONLY | none | none | 64fdb4c6b3 |
| `prisma/migrations/20261013180000_executive_customer_count_indexes/migration.sql` | A | MIGRATION | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P04` | 8f97682e94 |
| `prisma/migrations/20261014160000_executive_report_priorities/migration.sql` | A | MIGRATION | yes | yes | yes | FINDING_EVIDENCE | `RS-002` | `RS-P04` | 620458d716 |
| `prisma/schema.prisma` | M | SCHEMA | yes | yes | yes | FINDING_EVIDENCE | `RS-002` | none | 3535431118 |
| `scripts/__tests__/attest-image-revision.docker.test.ts` | A | TEST | no | no | no | TEST_ONLY | none | none | f112767770 |
| `scripts/__tests__/backup-freshness-gate.test.ts` | A | TEST | no | no | no | TEST_ONLY | none | none | ce5da4ab77 |
| `scripts/__tests__/check-backup-freshness.test.ts` | A | TEST | no | no | no | TEST_ONLY | none | none | bbe7d550f8 |
| `scripts/__tests__/deploy-rollback-wiring.test.ts` | A | TEST | no | no | no | TEST_ONLY | none | none | d033c786f3 |
| `scripts/__tests__/disposable-pg-readiness.test.ts` | A | TEST | no | no | no | TEST_ONLY | none | none | b190d78bc3 |
| `scripts/__tests__/image-revision-attestation.test.ts` | A | TEST | no | no | no | TEST_ONLY | none | none | a75c465fab |
| `scripts/__tests__/phase997-backup-evidence-sudo.test.ts` | M | TEST | no | no | no | TEST_ONLY | none | none | c15ad17391 |
| `scripts/__tests__/post-deploy-health-gate.test.ts` | M | TEST | no | no | no | TEST_ONLY | none | none | 1d6c67e8d9 |
| `scripts/__tests__/rollback-to-previous-good.docker.test.ts` | A | TEST | no | no | no | TEST_ONLY | none | none | 05042f2f1e |
| `scripts/ci/lib/disposable-pg.mjs` | M | DEPLOY_AND_RUNTIME_CONFIG | no | yes | no | REVIEWED_NO_SECURITY_EFFECT | none | none | 13efa668c7 |
| `scripts/ci/phase102-applied-migration-check.mjs` | M | DEPLOY_AND_RUNTIME_CONFIG | no | yes | no | REVIEWED_NO_SECURITY_EFFECT | none | none | 059659674e |
| `scripts/deploy/attest-image-revision.sh` | A | DEPLOY_AND_RUNTIME_CONFIG | no | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P02` | 2c4891c247 |
| `scripts/deploy/check-backup-freshness.sh` | A | DEPLOY_AND_RUNTIME_CONFIG | no | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P02` | 48c2422eba |
| `scripts/deploy/rollback-to-previous-good.sh` | A | DEPLOY_AND_RUNTIME_CONFIG | no | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P02` | 1530ca6b14 |
| `src/app/[locale]/__tests__/locale-layout-seo.test.ts` | A | TEST | no | no | no | TEST_ONLY | none | none | f39f1d977d |
| `src/app/[locale]/admin/page.tsx` | M | PAGE | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P07` | 14dcfae020 |
| `src/app/[locale]/articles/author/[handle]/page.tsx` | M | PAGE | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P03` | cbd07655b4 |
| `src/app/[locale]/articles/category/[slug]/page.tsx` | M | PAGE | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P03` | c41e923780 |
| `src/app/[locale]/articles/tag/[slug]/page.tsx` | M | PAGE | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P03` | d8f08bcc13 |
| `src/app/[locale]/careers/[jobId]/page.tsx` | M | PAGE | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P06` | 1cfa58c190 |
| `src/app/[locale]/careers/page.tsx` | M | PAGE | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P06` | 0d11f3bc64 |
| `src/app/[locale]/cookies/__tests__/cookie-policy-localization.test.ts` | A | TEST | no | no | no | TEST_ONLY | none | none | fcb1154092 |
| `src/app/[locale]/dashboard/executive/page.tsx` | M | PAGE | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P01` | d68dc7f69b |
| `src/app/[locale]/dashboard/executive/reports/[date]/page.tsx` | M | PAGE | yes | yes | yes | FINDING_EVIDENCE | `RS-001` | none | 2fbc6cc2ec |
| `src/app/[locale]/dashboard/executive/reports/page.tsx` | M | PAGE | yes | yes | no | REVIEWED_NO_SECURITY_EFFECT | none | none | 176854f221 |
| `src/app/[locale]/layout.tsx` | M | PAGE | yes | yes | no | REVIEWED_NO_SECURITY_EFFECT | none | none | e3e557ec4b |
| `src/app/api/executive/__tests__/summary-route-isolation.test.ts` | M | TEST | no | no | no | TEST_ONLY | none | none | 1be10c2d49 |
| `src/app/api/executive/summary/route.ts` | M | API_ROUTE | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P01` | 018de1ed6f |
| `src/app/api/media/assets/__tests__/media-assets-collection.test.ts` | M | TEST | no | no | no | TEST_ONLY | none | none | e2fcbb89b6 |
| `src/app/api/media/assets/route.ts` | M | API_ROUTE | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P05` | dd0568e2bb |
| `src/components/admin/ExecutiveCentreLink.tsx` | A | UI_COMPONENT | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P07` | 640139eeb7 |
| `src/components/admin/__tests__/executive-centre-link.test.tsx` | A | TEST | no | no | no | TEST_ONLY | none | none | 2106fdad50 |
| `src/components/careers/CareersBoardClient.tsx` | M | UI_COMPONENT | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P06` | 473dc6a216 |
| `src/components/careers/JobDetailClient.tsx` | M | UI_COMPONENT | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P06` | d5f20239b7 |
| `src/components/careers/__tests__/seo-careers-server-render.test.tsx` | A | TEST | no | no | no | TEST_ONLY | none | none | bdc6710d1b |
| `src/components/executive/ExecutiveSummaryView.tsx` | M | UI_COMPONENT | yes | yes | no | REVIEWED_NO_SECURITY_EFFECT | none | none | 779fdf9251 |
| `src/components/executive/FrozenPrioritiesPanel.tsx` | A | UI_COMPONENT | yes | yes | yes | FINDING_EVIDENCE | `RS-001` | none | e28ad003ad |
| `src/i18n/__tests__/german-enterprise-wave.test.ts` | M | TEST | no | no | no | TEST_ONLY | none | none | 76ee6071cb |
| `src/i18n/__tests__/german-final-gate.test.ts` | M | TEST | no | no | no | TEST_ONLY | none | none | 958c176041 |
| `src/lib/articles/seo.ts` | M | LIBRARY | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P03` | 88e0c55527 |
| `src/lib/customers/service.ts` | M | LIBRARY | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P01` | 647a7574dd |
| `src/lib/executive/__tests__/authority-matrix.test.ts` | A | TEST | no | no | no | TEST_ONLY | none | none | a68a7de60b |
| `src/lib/executive/__tests__/cache.test.ts` | A | TEST | no | no | no | TEST_ONLY | none | none | d0c446f04b |
| `src/lib/executive/__tests__/i18n-contract.test.ts` | M | TEST | no | no | no | TEST_ONLY | none | none | 73ef1459ab |
| `src/lib/executive/__tests__/oversight.test.ts` | M | TEST | no | no | no | TEST_ONLY | none | none | 561b34ba93 |
| `src/lib/executive/__tests__/pg/summary-baseline.pg.test.ts` | A | TEST | no | no | yes | FINDING_EVIDENCE | `RS-003` | none | 7856c69ec6 |
| `src/lib/executive/__tests__/priorities.test.ts` | M | TEST | no | no | no | TEST_ONLY | none | none | df9d1f339f |
| `src/lib/executive/__tests__/status-label.test.ts` | A | TEST | no | no | no | TEST_ONLY | none | none | 09e2b51df9 |
| `src/lib/executive/__tests__/summary.test.ts` | M | TEST | no | no | no | TEST_ONLY | none | none | cbc8332b83 |
| `src/lib/executive/cache.ts` | A | LIBRARY | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P01` | 894dfac792 |
| `src/lib/executive/contract.ts` | M | LIBRARY | yes | yes | yes | FINDING_EVIDENCE | `RS-001` | none | b40a37e34f |
| `src/lib/executive/priorities.ts` | M | LIBRARY | yes | yes | yes | FINDING_EVIDENCE | `RS-001`, `RS-002` | `RS-P08` | 52a1c324c8 |
| `src/lib/executive/report/__tests__/coverage-verdict.test.ts` | A | TEST | no | no | no | TEST_ONLY | none | none | b9f17df8e8 |
| `src/lib/executive/report/__tests__/frozen-priorities.test.ts` | A | TEST | no | no | no | TEST_ONLY | none | none | 13cb6d8f7b |
| `src/lib/executive/report/__tests__/generate.test.ts` | M | TEST | no | no | no | TEST_ONLY | none | none | 24e8858d36 |
| `src/lib/executive/report/__tests__/worker.test.ts` | M | TEST | no | no | no | TEST_ONLY | none | none | 103fd289a4 |
| `src/lib/executive/report/contract.ts` | M | LIBRARY | yes | yes | no | REVIEWED_NO_SECURITY_EFFECT | none | none | 2e1081623e |
| `src/lib/executive/report/generate.ts` | M | LIBRARY | yes | yes | yes | FINDING_EVIDENCE | `RS-001`, `RS-002` | none | e3fc976144 |
| `src/lib/executive/report/read.ts` | M | LIBRARY | yes | yes | yes | FINDING_EVIDENCE | `RS-001` | none | 0c0fb27e91 |
| `src/lib/executive/report/worker.ts` | M | LIBRARY | yes | yes | yes | FINDING_EVIDENCE | `RS-001` | none | 3398dbc5de |
| `src/lib/executive/scope.ts` | M | LIBRARY | yes | yes | yes | FINDING_EVIDENCE | `RS-001` | none | da634eb197 |
| `src/lib/executive/status-label.ts` | A | LIBRARY | yes | yes | no | REVIEWED_NO_SECURITY_EFFECT | none | none | 797bc81718 |
| `src/lib/executive/summary.ts` | M | LIBRARY | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P08` | 09d321ab06 |
| `src/lib/seo/__tests__/retired-identity-containment.test.ts` | A | TEST | no | no | no | TEST_ONLY | none | none | 8f6dbad5dc |
| `src/lib/seo/__tests__/taxonomy-indexability.test.ts` | A | TEST | no | no | no | TEST_ONLY | none | none | 05d1d3841e |
| `src/lib/seo/indexnow-lifecycle.ts` | M | LIBRARY | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P03` | 2d63370433 |
| `src/lib/seo/metadata.ts` | M | LIBRARY | yes | yes | no | REVIEWED_NO_SECURITY_EFFECT | none | none | b3ab36d3ce |
| `src/lib/seo/retired-identity.ts` | A | LIBRARY | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P03` | e1c6528b41 |
| `src/lib/seo/taxonomy-indexability.ts` | A | LIBRARY | yes | yes | yes | POSITIVE_CONTROL_EVIDENCE | none | `RS-P03` | b504d593d9 |
| `vitest.executive-perf.config.ts` | A | DEPLOY_AND_RUNTIME_CONFIG | yes | yes | yes | FINDING_EVIDENCE | `RS-003` | none | 944d033405 |
<!-- /RELOCK-BLOCK:pathledger -->

## 3. The getPrisma reconciliation

The comparison is between the S0 inventory of the final commit of the first relock lane and the inventory regenerated on the integrated tree. A call site whose line or column moved without a change of its surroundings is listed as added under its new identifier and as removed under its old one, and the row is repeated under moved. Each such call site was re-read at its new position: the expression, the enclosing function and the terminal behaviour of its consumers were checked again, and no adjudication was carried over by line number alone.

<!-- RELOCK-BLOCK:getprisma -->
| | First relock tree | Integrated tree |
|---|---|---|
| Textual occurrences | 860 | 862 |
| Real call expressions | 404 | 404 |
| Files with a real call | 236 | 236 |

Added 14, removed 14, moved 14, new files 0, changed existing records 0, unresolved call sites 0, unresolved consumer edges 0. Of the 14 added, 8 are manual adjudications and 6 are rule-based decisions: `src/app/[locale]/admin/page.tsx#L25C34 (R13-presence-test-degraded, HIGH)` and `src/app/api/media/assets/route.ts#L443C21 (R04-guard-503, EXACT)` and `src/lib/articles/seo.ts#L106C24 (R07-guard-empty-array, EXACT)` and `src/lib/articles/seo.ts#L205C24 (R07-guard-empty-array, EXACT)` and `src/lib/articles/seo.ts#L287C24 (R07-guard-empty-array, EXACT)` and `src/lib/customers/service.ts#L158C25 (R04-guard-503, EXACT)`. The primary partition sums to 404 of 404 with 0 missing, 0 duplicate and 0 outside the closed set.

| Call site | Classification | Decision | Rule | Reachability | Static importers |
|---|---|---|---|---|---|
| `src/app/[locale]/admin/page.tsx#L25C34` | EXPLICIT_DEGRADED_MODE | rule (HIGH) | R13-presence-test-degraded | AUTHENTICATED_USER_VISIBLE | 1 |
| `src/app/api/media/assets/route.ts#L443C21` | DB_UNAVAILABLE_RETURNS_503 | rule (EXACT) | R04-guard-503 | AUTHENTICATED_USER_VISIBLE | 1 |
| `src/lib/articles/seo.ts#L106C24` | EMPTY_SUCCESS_FALLBACK | rule (EXACT) | R07-guard-empty-array | PUBLICLY_REACHABLE | 1 |
| `src/lib/articles/seo.ts#L205C24` | EMPTY_SUCCESS_FALLBACK | rule (EXACT) | R07-guard-empty-array | PUBLICLY_REACHABLE | 1 |
| `src/lib/articles/seo.ts#L287C24` | EMPTY_SUCCESS_FALLBACK | rule (EXACT) | R07-guard-empty-array | PUBLICLY_REACHABLE | 1 |
| `src/lib/customers/service.ts#L158C25` | DB_UNAVAILABLE_RETURNS_503 | rule (EXACT) | R04-guard-503 | AUTHENTICATED_USER_VISIBLE | 7 |
| `src/lib/executive/priorities.ts#L327C24` | EXPLICIT_DEGRADED_MODE | manual (MANUAL) | R08-guard-null-undefined | AUTHENTICATED_USER_VISIBLE | 2 |
| `src/lib/executive/report/generate.ts#L196C24` | DB_REQUIRED_FAIL_CLOSED | manual (MANUAL) | R10-no-guard | BACKGROUND_ONLY | 1 |
| `src/lib/executive/report/generate.ts#L360C24` | DB_REQUIRED_FAIL_CLOSED | manual (MANUAL) | R10-no-guard | BACKGROUND_ONLY | 1 |
| `src/lib/executive/report/generate.ts#L393C24` | DB_REQUIRED_FAIL_CLOSED | manual (MANUAL) | R10-no-guard | BACKGROUND_ONLY | 1 |
| `src/lib/executive/report/read.ts#L101C36` | EMPTY_SUCCESS_FALLBACK | manual (MANUAL) | R11-ambiguous | AUTHENTICATED_USER_VISIBLE | 1 |
| `src/lib/executive/report/read.ts#L131C36` | EMPTY_SUCCESS_FALLBACK | manual (MANUAL) | R11-ambiguous | AUTHENTICATED_USER_VISIBLE | 1 |
| `src/lib/executive/report/read.ts#L161C36` | EXPLICIT_DEGRADED_MODE | manual (MANUAL) | R11-ambiguous | AUTHENTICATED_USER_VISIBLE | 1 |
| `src/lib/executive/summary.ts#L182C24` | EXPLICIT_DEGRADED_MODE | manual (MANUAL) | R08-guard-null-undefined | AUTHENTICATED_USER_VISIBLE | 2 |
<!-- /RELOCK-BLOCK:getprisma -->

## 3a. The moved call sites and the three kinds of change

Every moved call site is paired one to one with its former identifier by file, ordinal and fingerprint, and the table keeps both identifiers. The old identifier occurs nowhere else: not in an adjudication, a screening, a consumer trace, a retry trace, the inventory or this report. A pair whose verdict changed would not be a move and is refused.

Three different things can change under a moved call site, and they are counted apart and never summed. **classificationSemanticChanges** counts the verdict itself: the classification, the rule, the confidence, the guard shape, the control flow, the reason or an adjudicated field that is not merely a position. **sourceBehaviorChanges** counts the pairs whose enclosing function differs in code between the first-layer tree and the integrated tree, comments aside, whether or not the verdict moved with it; each one must be described by the reviewer. **derivedTagChanges** counts the pairs whose scanner-derived secondary tag differs, a tag that is read from a bounded window and so moves when code is added near the call.

<!-- RELOCK-BLOCK:movedledger -->
| After | Before | Lines moved | Classification | Verdict changed | Source behaviour changed | Derived tags added / removed | Old identifier left behind |
|---|---|---|---|---|---|---|---|
| `src/app/[locale]/admin/page.tsx#L25C34` | `src/app/[locale]/admin/page.tsx#L24C34` | 1 | EXPLICIT_DEGRADED_MODE | no | yes | none / none | 0 |
| `src/app/api/media/assets/route.ts#L443C21` | `src/app/api/media/assets/route.ts#L432C21` | 11 | DB_UNAVAILABLE_RETURNS_503 | no | yes | READ / SILENT_CATCH | 0 |
| `src/lib/articles/seo.ts#L106C24` | `src/lib/articles/seo.ts#L105C24` | 1 | EMPTY_SUCCESS_FALLBACK | no | no | none / none | 0 |
| `src/lib/articles/seo.ts#L205C24` | `src/lib/articles/seo.ts#L204C24` | 1 | EMPTY_SUCCESS_FALLBACK | no | no | none / none | 0 |
| `src/lib/articles/seo.ts#L287C24` | `src/lib/articles/seo.ts#L286C24` | 1 | EMPTY_SUCCESS_FALLBACK | no | yes | none / none | 0 |
| `src/lib/customers/service.ts#L158C25` | `src/lib/customers/service.ts#L157C25` | 1 | DB_UNAVAILABLE_RETURNS_503 | no | no | none / none | 0 |
| `src/lib/executive/priorities.ts#L327C24` | `src/lib/executive/priorities.ts#L273C24` | 54 | EXPLICIT_DEGRADED_MODE | no | yes | none / none | 0 |
| `src/lib/executive/report/generate.ts#L196C24` | `src/lib/executive/report/generate.ts#L112C24` | 84 | DB_REQUIRED_FAIL_CLOSED | no | yes | none / none | 0 |
| `src/lib/executive/report/generate.ts#L360C24` | `src/lib/executive/report/generate.ts#L248C24` | 112 | DB_REQUIRED_FAIL_CLOSED | no | no | none / none | 0 |
| `src/lib/executive/report/generate.ts#L393C24` | `src/lib/executive/report/generate.ts#L281C24` | 112 | DB_REQUIRED_FAIL_CLOSED | no | no | none / none | 0 |
| `src/lib/executive/report/read.ts#L101C36` | `src/lib/executive/report/read.ts#L96C36` | 5 | EMPTY_SUCCESS_FALLBACK | no | no | none / none | 0 |
| `src/lib/executive/report/read.ts#L131C36` | `src/lib/executive/report/read.ts#L126C36` | 5 | EMPTY_SUCCESS_FALLBACK | no | yes | none / none | 0 |
| `src/lib/executive/report/read.ts#L161C36` | `src/lib/executive/report/read.ts#L152C36` | 9 | EXPLICIT_DEGRADED_MODE | no | no | none / none | 0 |
| `src/lib/executive/summary.ts#L182C24` | `src/lib/executive/summary.ts#L181C24` | 1 | EXPLICIT_DEGRADED_MODE | no | no | none / none | 0 |
<!-- /RELOCK-BLOCK:movedledger -->

<!-- RELOCK-BLOCK:changemodel -->
| Kind of change | Moved call sites |
|---|---|
| classificationSemanticChanges | 0 |
| sourceBehaviorChanges | 6 |
| derivedTagChanges | 1 |
| Position only | 8 |

Moved pairs 14, genuinely added 0, genuinely removed 0, unchanged records 390.

| Call site | Enclosing function | Source behaviour that changed |
|---|---|---|
| `src/app/[locale]/admin/page.tsx#L25C34` | AdminPage | The audit console page now renders the Executive Centre link, which calls the executive gate; the test of whether the database client is present is unchanged. |
| `src/app/api/media/assets/route.ts#L443C21` | POST | The create handler accepts an optional explicit slug: when it is supplied the handler probes the organization once and answers a conflict for a taken slug, otherwise the derived-slug path is unchanged; the unavailable answer for a missing client is unchanged. |
| `src/lib/articles/seo.ts#L287C24` | listPublicAuthorSitemapItems | The author sitemap list now skips an author whose handle carries the retired company identity; the empty answer for a missing client is unchanged. |
| `src/lib/executive/priorities.ts#L327C24` | db | The accessor now also requires the party delegate, so a client generated without it makes every priority source unavailable and not only the customer source. |
| `src/lib/executive/report/generate.ts#L196C24` | generateDailyReport | The generating pass now also freezes the next day's priority list in a read-consistent transaction and stores it in a separate column; a list that cannot be read leaves the report without one, and the answer for a missing client is unchanged. |
| `src/lib/executive/report/read.ts#L131C36` | getReport | The detail read now also returns the stored priority list, which is null for a report written before the column existed; the null answer for a missing client is unchanged. |
<!-- /RELOCK-BLOCK:changemodel -->

## 4. The platform-capability gate

<!-- RELOCK-BLOCK:authzgate -->
| Route group | Route files | Files that test the platform capability |
|---|---|---|
| ERP routes (`src/app/api/erp`) | 27 | 27 |
| Customer routes (`src/app/api/tenant/customers`) | 4 | 0 |

The test counted is `can(user.role, "admin")`, read from the target tree.

| Route group | Files that read the platform identity (`getCurrentUser`) | Files with an equivalent platform gate |
|---|---|---|
| ERP routes | 27 | 27 |
| Customer routes | 0 | 0 |

The `partyId` column of a project is written by: `src/lib/customers/service.ts`.
The non-test callers of `generateDailyReport` are `src/lib/executive/report/worker.ts`; the callers that mention a correction number 0.
<!-- /RELOCK-BLOCK:authzgate -->

## 4a. The runtime environment of the workers

<!-- RELOCK-BLOCK:runtimeenv -->
| Compose service | Declares env_file at the frozen source | Declares env_file at the target |
|---|---|---|
| `hermes-ats-review-worker` | yes | yes |
| `hermes-document-cleanup-worker` | yes | yes |
| `hermes-executive-report-worker` | yes | yes |
| `hermes-journal-import` | yes | yes |
| `hermes-metering-worker` | yes | yes |
| `hermes-migrate` | yes | yes |
| `hermes-web` | yes | yes |
| `postgres` | yes | yes |

Variable names read by the new worker script: `EXECUTIVE_REPORT_BATCH`, `EXECUTIVE_REPORT_INTERVAL_MS`, `EXECUTIVE_REPORT_WORKER_TOKEN`, `HERMES_WORKER_BASE_URL`, `METERING_WORKER_TOKEN`, `METRICS_TOKEN`.
<!-- /RELOCK-BLOCK:runtimeenv -->

## 5. Second-layer findings and their canonical owners

A second-layer finding is owned either by a risk that already exists, which the layer then extends through a structured revision, or by a risk the layer opens under its own scope. RS-001 and RS-002 extend R-65 and R-72, the two risks the first relock opened; RS-003 opens R-74. A revision is append-only: it keeps every earlier evidence item, gap, criterion and precondition, records the values the risk had before, reviews all nine scoring factors one by one, and leaves the first relock's pinned snapshot exactly as it was. The owner of R-66, R-72 and R-73 decisions is not replaced: the policy questions they carry stay open and no decision is recorded.

<!-- RELOCK-BLOCK:findings -->
| Delta finding | Origin | Disposition | Canonical risk | Severity | Production state | Score | Call-site backed |
|---|---|---|---|---|---|---|---|
| `DELTA-RS-001` | REVIEWER | OWNED_BY_EXISTING_RISK | `R-65` | **HIGH** | CODE_CONFIRMED_RUNTIME_UNPROVEN | 12 | yes (1) |
| `DELTA-RS-002` | REVIEWER | POLICY_AMBIGUITY | `R-72` | **MEDIUM** | POLICY_AMBIGUITY | 6 | no |
| `DELTA-RS-003` | REVIEWER | OWNED_BY_NEW_RISK | `R-74` | **LOW** | CODE_CONFIRMED_RUNTIME_UNPROVEN | 4 | no |

Projected severities of the delta findings (by finding, not by risk): CRITICAL 0, HIGH 1, MEDIUM 1, LOW 1, INFORMATIONAL 0. The values are read from the canonical register; this document sets none of them.
<!-- /RELOCK-BLOCK:findings -->

The ten risks the reconciled register schedules first are:

<!-- RELOCK-BLOCK:priorities -->
| Priority | Risk | Severity | Score | Scope |
|---|---|---|---|---|
| 1 | `R-01` | **HIGH** | 20 | HISTORICAL_S1_BASELINE |
| 2 | `R-02` | **HIGH** | 20 | HISTORICAL_S1_BASELINE |
| 3 | `R-04` | **HIGH** | 15 | HISTORICAL_S1_BASELINE |
| 4 | `R-08` | **HIGH** | 15 | HISTORICAL_S1_BASELINE |
| 5 | `R-13` | **HIGH** | 15 | HISTORICAL_S1_BASELINE |
| 6 | `R-16` | **HIGH** | 16 | HISTORICAL_S1_BASELINE |
| 7 | `R-24` | **HIGH** | 16 | HISTORICAL_S1_BASELINE |
| 8 | `R-26` | **HIGH** | 16 | HISTORICAL_S1_BASELINE |
| 9 | `R-32` | **HIGH** | 15 | HISTORICAL_S1_BASELINE |
| 10 | `R-33` | **HIGH** | 15 | HISTORICAL_S1_BASELINE |
<!-- /RELOCK-BLOCK:priorities -->

## 6. What was checked and found sound

<!-- RELOCK-BLOCK:observations -->
| Observation | What was checked and found sound | Evidence items |
|---|---|---|
| `RS-P01` | The executive summary cache is addressed by the whole access shape, sits behind the gate and never stores a failed read | 5 |
| `RS-P02` | The new deploy and backup scripts refuse on every unreadable or inconsistent input and quote what they pass on | 9 |
| `RS-P03` | Indexation of retired identities and of taxonomy archives is withheld, never widened | 7 |
| `RS-P04` | The two new migrations are additive and add no destructive statement | 2 |
| `RS-P05` | An explicit media slug is a bounded ASCII pattern, is probed inside the organization and is refused rather than altered | 3 |
| `RS-P06` | The careers pages render the same public projection the public interface returns, and an unreachable store is never shown as an empty board | 5 |
| `RS-P07` | The audit console links to the executive centre only through the executive gate itself | 3 |
| `RS-P08` | The live summary and the live priority list gate the customers section on the customers axis, and a refused source issues no query | 3 |
<!-- /RELOCK-BLOCK:observations -->

## 7. Qualifications, supersessions and scoping

<!-- RELOCK-BLOCK:supersessions -->
| Target | Kind | Statement |
|---|---|---|
| src/lib/executive/report/worker.ts#L191C24 | UNCHANGED_IDENTIFIER_RE_EXAMINED | The identifier and the fingerprint did not change. The call site was re-examined anyway: the only change in the file is the customers axis in the synthetic scope, and the pass still stops with a failed organization when the client is absent, so the terminal behaviour and the retry trace are as adjudicated. |
| docs/security/s1-relock-delta.json (first layer) | PRESERVED_AS_SEALED_LAYER | The first-layer document and its report are preserved. They stay bound to the tree of the final commit of the first relock lane, through the reconciled tree commit they now name, so a later tree cannot move their figures. |
| first-layer call-site identifiers | IDENTIFIERS_MOVED_ON_THE_CURRENT_TREE | The call-site identifiers in the first-layer document name positions in the sealed tree. Where the current tree moved a call site, the current identifier appears in the getPrisma section of this document together with the identifier it replaced. |
| GETPRISMA-FAILURE-CLASSIFICATION.md and ARCHITECTURE-INVENTORY.md counts | SCOPED_TO_FROZEN_SOURCE | Every call-site count in those documents describes the original frozen source. The counts for the integrated tree are in the getPrisma section of this document and in docs/security/s0-getprisma-callsite-inventory.json. |
<!-- /RELOCK-BLOCK:supersessions -->

## 8. The historical files

<!-- RELOCK-BLOCK:historicalfiles -->
| File | Role | SHA-256 at the security head | Preserved by the integration merge |
|---|---|---|---|
| `docs/security/s1-risk-register.json` | S1_ARTIFACT | `009b1e1f922f54731ca46f44419d60c41977dc81503f2824142c867beaadf518` | yes |
| `docs/security/THREAT-MODEL-AND-RISK-REGISTER.md` | S1_ARTIFACT | `a1537dd9f375023799b5840cd8c5c8191fb04bc01c5160a54bfe603efe501ef3` | yes |
| `scripts/security/s1/risk-register-check.mjs` | S1_ARTIFACT | `33674b063328fe1d65cb9f1c12697bf22bcd4dbc315c762d3ee1f6ed74a721c4` | yes |
| `scripts/security/s1/__tests__/risk-register.selftest.mjs` | S1_ARTIFACT | `246ece262d766ff9db29eb46600a913608ab5e1ba731ae599075048858e61f85` | yes |
| `docs/security/EDGE-ORIGIN-AND-CLIENT-IP.md` | S0_EVIDENCE | `0d44a6c2c99e7aed4066d5975d2d9326b34d417ee5ab462ec353b77f07be8d08` | yes |
| `.gitattributes` | CONFIGURATION | `74f52a5261a1120e60d770f4580413ec89876b24bcf5a2c30aa7a377dda9dca7` | no |
<!-- /RELOCK-BLOCK:historicalfiles -->

## 9. Mutation evidence for this checker

<!-- RELOCK-BLOCK:mutations -->
| Measure | Value |
|---|---|
| Manifest version | relock-mut-2 |
| Manifest SHA-256 | `7eb5a0b118c87c6054381f3839b01ea3889cc4d22cd4940e48c36ae943451d99` |
| Mutants | 324 |
| Targeted kills | 324 |
| Incidental kills | 0 |
| Survivors | 0 |
| Invalid mutants | 0 |
| Placebos green | 324 of 324 |
| Controls as expected | 4 of 4 |
| Deviations | 0 |
| Cleanup | REMOVED |

| Mutant | Gate under test | Named test | Result |
|---|---|---|---|
| `M01` | schema: unknown key | schema: an unknown key inside a finding is refused | TARGETED_KILL |
| `M02` | schema: missing key | schema: a missing required key is refused | TARGETED_KILL |
| `M03` | schema: version | schema: a wrong schema version is refused | TARGETED_KILL |
| `M04` | schema: derived section absent | schema: a missing derived section is refused | TARGETED_KILL |
| `M05` | sources: merge parents | sources: swapped merge parents are refused | TARGETED_KILL |
| `M06` | sources: second parent | sources: a security head that is not the merge's second parent is refused | TARGETED_KILL |
| `M07` | sources: merge base | sources: a frozen source that is not the merge base is refused | TARGETED_KILL |
| `M08` | sources: git objects | sources: a commit that is not in the repository is refused | TARGETED_KILL |
| `M09` | sources: ancestor | sources: a frozen source that is not an ancestor of the target is refused | TARGETED_KILL |
| `M10` | derived: orphan adjudication | derived: an orphan adjudication is refused | TARGETED_KILL |
| `M11` | derived: stale fingerprint | derived: an adjudication pinned to a stale fingerprint is refused | TARGETED_KILL |
| `M12` | derived: stale inventory | derived: a stale inventory is refused | TARGETED_KILL |
| `M13` | derived: section drift | derived: a delta count the tree does not produce is refused | TARGETED_KILL |
| `M14` | derived: unresolved call sites | derived: an unresolved call site is refused | TARGETED_KILL |
| `M15` | derived: unresolved edges | derived: an unresolved consumer edge is refused | TARGETED_KILL |
| `M16` | derived: primary partition | derived: a primary partition that does not cover every call site is refused | TARGETED_KILL |
| `M17` | derived: position | derived: a call site position that holds no getPrisma token is refused | TARGETED_KILL |
| `M18` | derived: reviewed | derived: a call site with no reachability review is refused | TARGETED_KILL |
| `M19` | derived: review of unknown call site | derived: a review of a call site the delta did not add is refused | TARGETED_KILL |
| `M20` | derived: historical evidence merge | derived: historical S0 evidence not preserved by the merge is refused | TARGETED_KILL |
| `M21` | derived: historical evidence edited | derived: S0 evidence edited after the merge is refused | TARGETED_KILL |
| `M22` | derived: frozen register hash | derived: a frozen register hash that differs from the pin is refused | TARGETED_KILL |
| `M23` | findings: register finding missing from delta | findings: a register delta finding missing from the delta document is refused | TARGETED_KILL |
| `M24` | findings: id shape | findings: a malformed delta finding id is refused | TARGETED_KILL |
| `M25` | findings: register id | findings: a wrong register id is refused | TARGETED_KILL |
| `M26` | findings: duplicate | findings: a duplicate delta finding is refused | TARGETED_KILL |
| `M27` | findings: not in register | findings: a delta finding missing from the register is refused | TARGETED_KILL |
| `M28` | findings: owner | findings: an owner that the register does not record is refused | TARGETED_KILL |
| `M29` | findings: disposition | findings: a disposition that the register does not record is refused | TARGETED_KILL |
| `M30` | findings: status | findings: a register status that the disposition does not map to is refused | TARGETED_KILL |
| `M31` | findings: duplicate ownership | findings: a finding owned by two risks is refused | TARGETED_KILL |
| `M32` | findings: no owner | findings: a finding no risk lists is refused | TARGETED_KILL |
| `M33` | findings: new-risk scope | findings: a new-risk disposition on a historical owner is refused | TARGETED_KILL |
| `M34` | findings: existing-risk scope | findings: an existing-risk disposition on a delta owner is refused | TARGETED_KILL |
| `M35` | findings: call-site backed without link | findings: a call-site-backed finding with no linked call site is refused | TARGETED_KILL |
| `M36` | findings: link without call-site backed | findings: linked call sites on a finding that is not call-site-backed are refused | TARGETED_KILL |
| `M37` | findings: link relation | findings: a link with no stated relation is refused | TARGETED_KILL |
| `M38` | findings: link target | findings: a link to a call site the delta did not add is refused | TARGETED_KILL |
| `M39` | findings: link anchored | findings: a link no evidence anchors is refused | TARGETED_KILL |
| `M40` | findings: delta evidence | findings: a finding with no delta-scope evidence is refused | TARGETED_KILL |
| `M41` | findings: evidence path | findings: an evidence path that does not exist is refused | TARGETED_KILL |
| `M42` | findings: evidence anchor | findings: an evidence anchor that no longer exists is refused | TARGETED_KILL |
| `M43` | findings: evidence absence | findings: an evidence absence that no longer holds is refused | TARGETED_KILL |
| `M44` | findings: evidence form | findings: evidence with neither an anchor nor an absence is refused | TARGETED_KILL |
| `M45` | paths: outside delta | paths: delta evidence on a file the delta did not change is refused | TARGETED_KILL |
| `M46` | findings: projection present | findings: a projection entry that is missing is refused | TARGETED_KILL |
| `M47` | report: block drift | report: a stale generated block is refused | TARGETED_KILL |
| `M48` | report: block absent | report: an absent generated block is refused | TARGETED_KILL |
| `M49` | report: narrative number | report: a digit-led count in the narrative is refused | TARGETED_KILL |
| `M50` | report: finding named | report: a delta finding missing from the report is refused | TARGETED_KILL |
| `M51` | report: independent pass claim | report: a claim of an independent pass is refused | TARGETED_KILL |
| `M52` | report: missing report | report: a missing report is refused | TARGETED_KILL |
| `M53` | record: consistency | record: a surviving mutant is refused | TARGETED_KILL |
| `M54` | record: all killed | record: a recorded survivor with consistent totals is still refused | TARGETED_KILL |
| `M55` | record: placebo | record: a placebo that is not green is refused | TARGETED_KILL |
| `M56` | record: cleanup | record: a cleanup that did not remove the copies is refused | TARGETED_KILL |
| `M57` | record: controls | record: a control that did not behave as expected is refused | TARGETED_KILL |
| `M58` | content: secret | content: a secret-shaped string is refused | TARGETED_KILL |
| `M59` | content: absolute path | content: an absolute local path is refused | TARGETED_KILL |
| `M60` | content: clock time | content: a clock time is refused | TARGETED_KILL |
| `M61` | exit: order | exit: the lowest-order failing class sets the code | TARGETED_KILL |
| `M62` | exit: distinct codes | exit: the validation codes are distinct from usage and from a crash | TARGETED_KILL |
| `M63` | rule: strict product path | rule: the strict product-path rule excludes docs, workflows, scripts, tests and the attributes file | TARGETED_KILL |
| `M64` | rule: broad runtime path | rule: the broad runtime-affecting rule keeps workflows and scripts and drops docs, tests and the attributes file | TARGETED_KILL |
| `M65` | trace: importer detection | trace: only a file that imports the defining module is a static importer | TARGETED_KILL |
| `M66` | trace: enclosing function | trace: the enclosing function of a call site is the nearest definition above it | TARGETED_KILL |
| `M67` | trace: local helper walk | trace: a local helper is followed to the exported function that calls it | TARGETED_KILL |
| `M68` | derive: decision split | clean: the committed provenance has no violation | TARGETED_KILL |
| `M69` | derive: strict rule applied | clean: the committed provenance has no violation | TARGETED_KILL |
| `M70` | derive: compose services | clean: the committed provenance has no violation | TARGETED_KILL |
| `M71` | derive: worker variable names | clean: the committed provenance has no violation | TARGETED_KILL |
| `M72` | derive: projection | clean: the committed provenance has no violation | TARGETED_KILL |
| `M73` | trace: a handler is its own consumer | trace: a route handler is its own consumer | TARGETED_KILL |
| `M74` | render: scopes block | clean: the committed provenance has no violation | TARGETED_KILL |
| `M75` | render: delta block | clean: the committed provenance has no violation | TARGETED_KILL |
| `M76` | cli: crash is not a validation code | e2e crash: an input that parses but breaks the checker is exit 70, never a validation code | TARGETED_KILL |
| `M77` | cli: canonical form | e2e canonical: a document that is correct but not canonical is exit 12 | TARGETED_KILL |
| `M78` | cli: malformed json exit | e2e malformed json: unreadable JSON is exit 4 | TARGETED_KILL |
| `M79` | cli: generate refreshes blocks | e2e generate is idempotent: regenerating the committed inputs changes no byte | TARGETED_KILL |
| `M80` | cli: usage exit | e2e usage: an unknown mode is a usage error | TARGETED_KILL |
| `M81` | cli: missing record is a record failure | e2e record: a missing mutation record is exit 13 | TARGETED_KILL |
| `M82` | cli: exit follows the first class | e2e path outside delta: delta evidence on an unchanged file is exit 11 | TARGETED_KILL |
| `M83` | derive: priorities order | priorities: the report lists the register's first ten risks in the register's order | TARGETED_KILL |
| `M84` | identity: title | identity: RR-001 carrying the audit-snapshot topic is refused | TARGETED_KILL |
| `M85` | identity: swapped ids | identity: swapping the contents of RR-001 and RR-002 is refused | TARGETED_KILL |
| `M86` | identity: delta owner | identity: moving the delta owner of RR-001 is refused | TARGETED_KILL |
| `M87` | identity: register owner | identity: moving the register owner of RR-002 is refused | TARGETED_KILL |
| `M88` | identity: source reference RR-001 | identity: dropping the main source reference of RR-001 is refused | TARGETED_KILL |
| `M89` | identity: source reference RR-002 | identity: dropping the main source reference of RR-002 is refused | TARGETED_KILL |
| `M90` | identity: mechanism | identity: a fixed title over a different mechanism is refused | TARGETED_KILL |
| `M91` | identity: register mechanism | identity: a register summary that no longer states the mechanism is refused | TARGETED_KILL |
| `M92` | identity: assets | identity: an owner risk that drops an affected asset is refused | TARGETED_KILL |
| `M93` | identity: verification | identity: an owner risk with another verification method is refused | TARGETED_KILL |
| `M94` | identity: acceptance | identity: an owner risk without the pinned acceptance criterion is refused | TARGETED_KILL |
| `M95` | identity: missing finding | identity: an authoritative finding that is not declared is refused | TARGETED_KILL |
| `M96` | identity: gate fact | identity: the platform-capability gate is read from the tree, and its pin must still hold | TARGETED_KILL |
| `M97` | identity: derive gate count | identity: the ERP gate facts are derived from the target tree, never typed | TARGETED_KILL |
| `M98` | duplicate: title | identity: a new finding that duplicates an existing finding's title is refused | TARGETED_KILL |
| `M99` | duplicate: evidence | identity: a new finding that cites exactly an existing finding's evidence is refused | TARGETED_KILL |
| `M100` | duplicate: declared duplicate allowed | identity: a declared duplicate is allowed to repeat its original | TARGETED_KILL |
| `M101` | render: authzgate | clean: the committed provenance has no violation | TARGETED_KILL |
| `M102` | pin: RR-001.SITE_IDS_FN | identity fact: dropping RR-001.SITE_IDS_FN is refused | TARGETED_KILL |
| `M103` | pin: RR-001.MISSING_DELEGATE_EMPTY | identity fact: dropping RR-001.MISSING_DELEGATE_EMPTY is refused | TARGETED_KILL |
| `M104` | pin: RR-001.CATCH_EMPTY | identity fact: dropping RR-001.CATCH_EMPTY is refused | TARGETED_KILL |
| `M105` | pin: RR-001.SCOPE_CONSUMES | identity fact: dropping RR-001.SCOPE_CONSUMES is refused | TARGETED_KILL |
| `M106` | pin: RR-001.EMPTY_TO_FORBIDDEN | identity fact: dropping RR-001.EMPTY_TO_FORBIDDEN is refused | TARGETED_KILL |
| `M107` | pin: RR-001.CORRECTION_OPTION | identity fact: dropping RR-001.CORRECTION_OPTION is refused | TARGETED_KILL |
| `M108` | pin: RR-001.ALREADY_REPORTED_GUARD | identity fact: dropping RR-001.ALREADY_REPORTED_GUARD is refused | TARGETED_KILL |
| `M109` | pin: RR-001.WORKER_NEVER_PASSES | identity fact: dropping RR-001.WORKER_NEVER_PASSES is refused | TARGETED_KILL |
| `M110` | pin: RR-001.NO_CORRECTION_CALLER | identity fact: dropping RR-001.NO_CORRECTION_CALLER is refused | TARGETED_KILL |
| `M111` | pin: RR-002.PROJECTS_PERMISSION_ONLY | identity fact: dropping RR-002.PROJECTS_PERMISSION_ONLY is refused | TARGETED_KILL |
| `M112` | pin: RR-002.ERP_REFERENCE_GATE | identity fact: dropping RR-002.ERP_REFERENCE_GATE is refused | TARGETED_KILL |
| `M113` | pin: RR-002.PARTY_WRITE | identity fact: dropping RR-002.PARTY_WRITE is refused | TARGETED_KILL |
| `M114` | pin: RR-002.NO_GETCURRENTUSER_PROJECTS | identity fact: dropping RR-002.NO_GETCURRENTUSER_PROJECTS is refused | TARGETED_KILL |
| `M115` | pin: RR-002.NO_ADMIN_GATE_PROJECTS | identity fact: dropping RR-002.NO_ADMIN_GATE_PROJECTS is refused | TARGETED_KILL |
| `M116` | pin: RR-002.NO_GETCURRENTUSER_LIST | identity fact: dropping RR-002.NO_GETCURRENTUSER_LIST is refused | TARGETED_KILL |
| `M117` | pin: RR-002.CUSTOMER_TREE_NO_GATE | identity fact: dropping RR-002.CUSTOMER_TREE_NO_GATE is refused | TARGETED_KILL |
| `M118` | pin: RR-002.PAGE_SCOPE_NO_GATE | identity fact: dropping RR-002.PAGE_SCOPE_NO_GATE is refused | TARGETED_KILL |
| `M119` | pin: RR-002.PAGES_ORG_PERMISSION_ONLY | identity fact: dropping RR-002.PAGES_ORG_PERMISSION_ONLY is refused | TARGETED_KILL |
| `M120` | pin: RR-010.AUDIT_ONLY_ON_CORRECTION | identity fact: dropping RR-010.AUDIT_ONLY_ON_CORRECTION is refused | TARGETED_KILL |
| `M121` | pin: RR-010.SINGLE_AUDIT_CALL | identity fact: dropping RR-010.SINGLE_AUDIT_CALL is refused | TARGETED_KILL |
| `M122` | pin: RR-010.CREATE_NOT_AUDITED | identity fact: dropping RR-010.CREATE_NOT_AUDITED is refused | TARGETED_KILL |
| `M123` | pin: RR-010.NO_WORKER_AUDIT | identity fact: dropping RR-010.NO_WORKER_AUDIT is refused | TARGETED_KILL |
| `M124` | pin: RR-010.NO_READ_AUDIT | identity fact: dropping RR-010.NO_READ_AUDIT is refused | TARGETED_KILL |
| `M125` | pin: RR-010.NO_LIST_PAGE_AUDIT | identity fact: dropping RR-010.NO_LIST_PAGE_AUDIT is refused | TARGETED_KILL |
| `M126` | pin: RR-010.NO_DETAIL_PAGE_AUDIT | identity fact: dropping RR-010.NO_DETAIL_PAGE_AUDIT is refused | TARGETED_KILL |
| `M127` | pin: RR-010.NO_RUN_ROUTE_AUDIT | identity fact: dropping RR-010.NO_RUN_ROUTE_AUDIT is refused | TARGETED_KILL |
| `M128` | pin: RR-010.NO_DB_TRIGGER_MIGRATION | identity fact: dropping RR-010.NO_DB_TRIGGER_MIGRATION is refused | TARGETED_KILL |
| `M129` | pin: RR-010.NO_DB_TRIGGER_ANYWHERE | identity fact: dropping RR-010.NO_DB_TRIGGER_ANYWHERE is refused | TARGETED_KILL |
| `M130` | pin: RR-011.PARTY_PERSONAL_FIELDS | identity fact: dropping RR-011.PARTY_PERSONAL_FIELDS is refused | TARGETED_KILL |
| `M131` | pin: RR-011.INTERACTION_FREE_TEXT | identity fact: dropping RR-011.INTERACTION_FREE_TEXT is refused | TARGETED_KILL |
| `M132` | pin: RR-011.ERASURE_REGISTRY_LACKS_PARTY | identity fact: dropping RR-011.ERASURE_REGISTRY_LACKS_PARTY is refused | TARGETED_KILL |
| `M133` | pin: RR-011.EXPORT_REGISTRY_LACKS_PARTY | identity fact: dropping RR-011.EXPORT_REGISTRY_LACKS_PARTY is refused | TARGETED_KILL |
| `M134` | pin: RR-011.INVENTORY_LACKS_PARTY | identity fact: dropping RR-011.INVENTORY_LACKS_PARTY is refused | TARGETED_KILL |
| `M135` | pin: RR-011.NO_DELETE_IN_LIB | identity fact: dropping RR-011.NO_DELETE_IN_LIB is refused | TARGETED_KILL |
| `M136` | pin: RR-011.NO_DELETE_IN_ROUTES | identity fact: dropping RR-011.NO_DELETE_IN_ROUTES is refused | TARGETED_KILL |
| `M137` | pin: RR-011.NO_ANONYMISE_OR_EXPORT | identity fact: dropping RR-011.NO_ANONYMISE_OR_EXPORT is refused | TARGETED_KILL |
| `M138` | pin: RR-011.ONLY_ORG_CASCADE | identity fact: dropping RR-011.ONLY_ORG_CASCADE is refused | TARGETED_KILL |
| `M139` | pin: RR-011.NOTHING_DELETED_NOTE | identity fact: dropping RR-011.NOTHING_DELETED_NOTE is refused | TARGETED_KILL |
| `M140` | evidence: committed blob | evidence: a PRESENT fact is read from the committed blob, not from the working tree | TARGETED_KILL |
| `M141` | evidence: committed blob (absence) | evidence: an ABSENT fact is read from the committed blob, not from the working tree | TARGETED_KILL |
| `M142` | evidence: committed tree grep | evidence: every rule holds and fails on a fixture tree | TARGETED_KILL |
| `M143` | worktree: allowlist enforced | worktree: a modified product file is refused (WORKTREE_MODIFIED_OUTSIDE_ALLOWLIST) | TARGETED_KILL |
| `M144` | worktree: untracked kind | worktree: an untracked product file is refused (WORKTREE_UNTRACKED_OUTSIDE_ALLOWLIST) | TARGETED_KILL |
| `M145` | worktree: product dirty path accepted | worktree: a modified product file is refused (WORKTREE_MODIFIED_OUTSIDE_ALLOWLIST) | TARGETED_KILL |
| `M146` | worktree: untracked files listed | worktree: the live status of a real repository is read the same way | TARGETED_KILL |
| `M147` | head: moved outside the allowlist | head: a descendant that changed a product, workflow, package, migration, deploy or config path is refused, commit by commit | TARGETED_KILL |
| `M148` | wiring: head gate | wiring: checkRelock applies the head gate | TARGETED_KILL |
| `M149` | wiring: worktree gate | wiring: checkRelock applies the worktree gate | TARGETED_KILL |
| `M150` | wiring: evidence context | wiring: checkRelock evaluates every evidence item against the committed integration merge | TARGETED_KILL |
| `M151` | mechanism: negation flip | mechanism: a negation flip that keeps every keyword is refused | TARGETED_KILL |
| `M152` | mechanism: subject and object swap | mechanism: a subject and object swap that keeps every keyword is refused | TARGETED_KILL |
| `M153` | mechanism: success and failure inversion | mechanism: a success and failure inversion that keeps every keyword is refused | TARGETED_KILL |
| `M154` | mechanism: owner swap | mechanism: an owner swap inside the sentence is refused | TARGETED_KILL |
| `M155` | mechanism: inversion that keeps every source reference | mechanism: a semantic inversion that keeps every pinned source reference is refused | TARGETED_KILL |
| `M156` | mechanism: register sentence | mechanism: a changed sentence of RR-002, RR-010 or RR-011 in the register is refused as well | TARGETED_KILL |
| `M157` | identity: unknown fact | identity fact: a fact name that no pin carries is refused | TARGETED_KILL |
| `M158` | identity: repeated fact | identity fact: a fact carried twice is refused | TARGETED_KILL |
| `M159` | identity: edited fact | identity fact: an edited fact item is refused as not the pinned one | TARGETED_KILL |
| `M160` | identity: domain separation | domain: RR-011 evidence under the report module, and RR-007 evidence under the customer library, are refused | TARGETED_KILL |
| `M161` | identity: derived route sets | gate sets: the derived route sets, counts and the partyId writer are pinned | TARGETED_KILL |
| `M162` | identity: correction callers | correction callers: the derived callers of generateDailyReport must exist and must not pass a correction | TARGETED_KILL |
| `M164` | policy: branch count | policy: R-73 must keep both branches and the remediation must not choose one | TARGETED_KILL |
| `M165` | policy: second acceptance branch | policy: R-73 must keep both branches and the remediation must not choose one | TARGETED_KILL |
| `M166` | rule: REGEX | evidence: every rule holds and fails on a fixture tree | TARGETED_KILL |
| `M167` | rule: ABSENT_REGEX | evidence: every rule holds and fails on a fixture tree | TARGETED_KILL |
| `M168` | rule: FN_BODY_REGEX | evidence: every rule holds and fails on a fixture tree | TARGETED_KILL |
| `M169` | rule: BLOCK_REGEX | evidence: every rule holds and fails on a fixture tree | TARGETED_KILL |
| `M170` | rule: TREE_ABSENT_REGEX | evidence: every rule holds and fails on a fixture tree | TARGETED_KILL |
| `M171` | rule: CALLERS_LACK | evidence: every rule holds and fails on a fixture tree | TARGETED_KILL |
| `M172` | rule: CALLERS_LACK needs a caller | evidence: every rule holds and fails on a fixture tree | TARGETED_KILL |
| `M173` | rule: missing symbol | evidence: every rule holds and fails on a fixture tree | TARGETED_KILL |
| `M174` | s0 eol: normalisation removed | eol: LF, CRLF and CR-only checkouts give identical call sites, classifications, outcome flags and bytes | TARGETED_KILL |
| `M175` | s0 eol: normaliser unit | eol: normalizeSourceText turns CRLF and a lone CR into LF and leaves LF alone | TARGETED_KILL |
| `M176` | s0 eol: normalisation missing on the inventory path | eol: every analyser read of a source file goes through readSourceText | TARGETED_KILL |
| `M177` | s0 eol: normalisation missing on the inventory path (bytes) | eol: LF, CRLF and CR-only checkouts give identical call sites, classifications, outcome flags and bytes | TARGETED_KILL |
| `M178` | s0 eol: normalisation missing on the reconcile path | eol: every analyser read of a source file goes through readSourceText | TARGETED_KILL |
| `M179` | s0 retry: durable state | retry: durable state that blocks a later run is suppression | TARGETED_KILL |
| `M180` | s0 retry: flip of the independent next run | retry: an independent next run of the same operation is not suppression | TARGETED_KILL |
| `M181` | s0 retry: a different operation | retry: a later run of a different operation, or no later run, is suppression | TARGETED_KILL |
| `M182` | s0 retry: requester not told | retry: a requester that is not given a signal it can act on cannot retry, one that is can | TARGETED_KILL |
| `M183` | s0 retry: a flag that disagrees with its trace | retry: a flag or a prose verdict that disagrees with its trace is a violation, for a call site and for an edge | TARGETED_KILL |
| `M184` | s0 retry: an untraced retry statement | retry: a call site or an edge that talks about a retry, or declares the outcome, without a trace is a violation | TARGETED_KILL |
| `M185` | s0 retry: trace shape | retry: a trace with a missing key, an unknown key, a bad enum, a timing that disagrees or a bad reference is a violation | TARGETED_KILL |
| `M186` | s0 retry: edge flag is derived from the trace | retry: the outcome sets derive RETRY_SUPPRESSION from the trace, for an edge and for a call site, and never from a typed flag | TARGETED_KILL |
| `M187` | s0 retry: call site flag is derived from the trace | retry: the outcome sets derive RETRY_SUPPRESSION from the trace, for an edge and for a call site, and never from a typed flag | TARGETED_KILL |
| `M188` | s0 retry: the completeness gate is computed | retry: the completeness gate is computed from the committed data and stops the command line with exit 10 | TARGETED_KILL |
| `M189` | s0 retry: the completeness gate stops the command | retry: the completeness gate is computed from the committed data and stops the command line with exit 10 | TARGETED_KILL |
| `M190` | s0 scope: git ls-files path | scope: tracked files in scripts/security/s0 and scripts/security/s1 are not scanned, look-alikes and other scripts are, on both file-list paths | TARGETED_KILL |
| `M191` | s0 scope: filesystem walk path | scope: tracked files in scripts/security/s0 and scripts/security/s1 are not scanned, look-alikes and other scripts are, on both file-list paths | TARGETED_KILL |
| `M192` | s0 scope: the s1 prefix is dropped | scope: isExcludedPath uses exact repository-relative prefixes for scripts/security/s0 and scripts/security/s1 | TARGETED_KILL |
| `M193` | s0 scope: the s0 prefix is dropped | scope: isExcludedPath uses exact repository-relative prefixes for scripts/security/s0 and scripts/security/s1 | TARGETED_KILL |
| `M194` | s0 scope: a look-alike prefix is excluded | scope: isExcludedPath uses exact repository-relative prefixes for scripts/security/s0 and scripts/security/s1 | TARGETED_KILL |
| `M195` | index flags: skip-worktree | index flags: the ls-files tags are parsed as assume-unchanged (lowercase), skip-worktree (S) and plain | TARGETED_KILL |
| `M196` | index flags: assume-unchanged | index flags: the ls-files tags are parsed as assume-unchanged (lowercase), skip-worktree (S) and plain | TARGETED_KILL |
| `M197` | index flags: only one lowercase tag | index flags: the ls-files tags are parsed as assume-unchanged (lowercase), skip-worktree (S) and plain | TARGETED_KILL |
| `M198` | index flags: the verbose listing | index flags: assume-unchanged and skip-worktree hide a product edit from status and are refused, modified or not | TARGETED_KILL |
| `M199` | wiring: index flag gate | wiring: checkRelock applies the index-flag gate | TARGETED_KILL |
| `M200` | eol: a lone CR in a committed blob | eol: the blob reader turns LF, CRLF and CR-only into the same text | TARGETED_KILL |
| `M205` | stale text: the gate is wired | stale text: process wording in the delta document or the report is refused, a defining open-item id is not, a quotation marker exempts | TARGETED_KILL |
| `M206` | stale text: the report is scanned | stale text: process wording in the delta document or the report is refused, a defining open-item id is not, a quotation marker exempts | TARGETED_KILL |
| `M207` | stale text: the delta document is scanned | stale text: process wording in the delta document or the report is refused, a defining open-item id is not, a quotation marker exempts | TARGETED_KILL |
| `M208` | stale text: a defining open-item id is exempt | stale text: process wording in the delta document or the report is refused, a defining open-item id is not, a quotation marker exempts | TARGETED_KILL |
| `M209` | s0 retry: a typed flag is not trusted | retry: the outcome sets derive RETRY_SUPPRESSION from the trace, for an edge and for a call site, and never from a typed flag | TARGETED_KILL |
| `M210` | partyId writer: the property must be the payload key | partyId writer: a lookalike key, another place, a comment, a string or another model is not a write | TARGETED_KILL |
| `M211` | partyId writer: only the payload's own properties | partyId writer: a lookalike key, another place, a comment, a string or another model is not a write | TARGETED_KILL |
| `M212` | partyId writer: comments and strings are blanked | partyId writer: a lookalike key, another place, a comment, a string or another model is not a write | TARGETED_KILL |
| `M213` | partyId writer: a line comment is blanked | partyId writer: a lookalike key, another place, a comment, a string or another model is not a write | TARGETED_KILL |
| `M214` | partyId writer: a block comment is blanked | partyId writer: a lookalike key, another place, a comment, a string or another model is not a write | TARGETED_KILL |
| `M215` | partyId writer: a string is blanked | partyId writer: a lookalike key, another place, a comment, a string or another model is not a write | TARGETED_KILL |
| `M216` | partyId writer: a template is blanked | partyId writer: a lookalike key, another place, a comment, a string or another model is not a write | TARGETED_KILL |
| `M217` | partyId writer: a regular-expression literal is read | partyId writer: a partyId property of the data of a project write is found, in any property order and layout | TARGETED_KILL |
| `M218` | partyId writer: a quoted key is a key | partyId writer: a partyId property of the data of a project write is found, in any property order and layout | TARGETED_KILL |
| `M219` | partyId writer: a shorthand property is a property | partyId writer: a partyId property of the data of a project write is found, in any property order and layout | TARGETED_KILL |
| `M220` | partyId writer: any property position | partyId writer: a partyId property of the data of a project write is found, in any property order and layout | TARGETED_KILL |
| `M221` | partyId writer: a spread is not a property | partyId writer: a lookalike key, another place, a comment, a string or another model is not a write | TARGETED_KILL |
| `M222` | partyId writer: a createMany array is a payload | partyId writer: a partyId property of the data of a project write is found, in any property order and layout | TARGETED_KILL |
| `M223` | partyId writer: the create and update payloads of an upsert | partyId writer: a partyId property of the data of a project write is found, in any property order and layout | TARGETED_KILL |
| `M224` | partyId writer: only the project model | partyId writer: a lookalike key, another place, a comment, a string or another model is not a write | TARGETED_KILL |
| `M225` | partyId writer: optional chaining on the model | partyId writer: a partyId property of the data of a project write is found, in any property order and layout | TARGETED_KILL |
| `M226` | partyId writer: a generic call | partyId writer: a partyId property of the data of a project write is found, in any property order and layout | TARGETED_KILL |
| `M227` | partyId writer: a writer file is one with a write site | partyId writer: only a file with a real project write is a writer, a file that merely names the column is not | TARGETED_KILL |
| `M228` | partyId writer: the customer service is read from the committed blob | partyId writer: the committed tree has exactly one project write of the customer, found through the structural reader | TARGETED_KILL |
| `M229` | policy pin: a decided policy without the owner's evidence | policy: R-73 must keep both branches and the remediation must not choose one | TARGETED_KILL |
| `M230` | policy pin: a decided policy is refused whatever its evidence | policy: R-73 must keep both branches and the remediation must not choose one | TARGETED_KILL |
| `M231` | policy pin: evidence that is a deliverable is not the owner's | policy: R-73 must keep both branches and the remediation must not choose one | TARGETED_KILL |
| `M232` | environment: no repository is a missing prerequisite | e2e environment: when git cannot answer the checker exits 3 (a missing prerequisite), never 0 and never a validation code | TARGETED_KILL |
| `M233` | layer 2: original frozen source required | layer 2: a second-layer document without the original frozen source is refused | TARGETED_KILL |
| `M234` | layer 2: original frozen source must be an ancestor | layer 2: an original frozen source that is not a proper ancestor of the range base is refused | TARGETED_KILL |
| `M235` | layer 2: original frozen source must be a proper ancestor | layer 2: an original frozen source that is not a proper ancestor of the range base is refused | TARGETED_KILL |
| `M236` | layer 2: a first-layer document has no original frozen source | layer 2: a first-layer document that names an original frozen source is refused | TARGETED_KILL |
| `M237` | layer 2: reconciled tree must descend from the merge | layer 2: a reconciled tree commit that does not descend from the integration merge is refused | TARGETED_KILL |
| `M238` | layer 2: the first layer's head base is the later merge | head: the committed layer is measured from the repository's real history, whatever position HEAD has | TARGETED_KILL |
| `M239` | layer 2: a successor must descend from the first-layer merge | layer 2: a successor that does not descend from the first-layer merge is not accepted as the head base | TARGETED_KILL |
| `M240` | layer 2: HEAD is judged against the base it is given | layer 2: HEAD is judged against the base it is given | TARGETED_KILL |
| `M241` | layer 2: the diff is taken from the base it is given | layer 2: the diff is taken from the base it is given | TARGETED_KILL |
| `M242` | layer 2: a finding carries its own layer's prefix | layer 2: a first-layer identifier in a second-layer document is refused | TARGETED_KILL |
| `M243` | layer 2: an observation carries its own layer's prefix | layer 2: an observation of the wrong layer is refused | TARGETED_KILL |
| `M244` | layer 2: a new-risk disposition needs a risk of the second layer | layer 2: a second-layer finding that claims a new risk is refused | TARGETED_KILL |
| `M245` | layer 2: a document is asked only for its own layer's findings | layer 2: the first-layer document is not asked to declare the second layer's findings | TARGETED_KILL |
| `M246` | layer 2: the first layer's content pins are not applied to the second | layer 2: the content pins of the first layer are not applied to the second | TARGETED_KILL |
| `M247` | layer 2: the original register hash pin belongs to the first layer | layer 2: the original register hash pin belongs to the first layer | TARGETED_KILL |
| `M248` | layer 2: only a document that names a reconciled tree is sealed | layer 2: a sealed layer reads its reconciled tree from git and an unsealed one reads the files | TARGETED_KILL |
| `M249` | layer 2: a sealed layer yields to caller-supplied files | layer 2: a sealed layer reads its reconciled tree from git and an unsealed one reads the files | TARGETED_KILL |
| `M250` | layer 2: a sealed layer reads its inventory from git | layer 2: the sealed first layer's figures do not follow the current inventory | TARGETED_KILL |
| `M251` | layer 2: the batch blob reader skips what is not a blob | layer 2: the batch blob reader returns what git returns | TARGETED_KILL |
| `M252` | layer 2: the batch blob reader steps over the separator | layer 2: the batch blob reader returns what git returns | TARGETED_KILL |
| `M253` | layer 2: a document without a layer is the first | layer 2: a document without a layer is the first, and the layers are named by their document | TARGETED_KILL |
| `M254` | layer 2: the second-layer report names its columns | layer 2: the committed second-layer provenance has no violation | TARGETED_KILL |
| `M255` | layer 2: the second layer has its own prefix | layer 2: a first-layer identifier in a second-layer document is refused | TARGETED_KILL |
| `M256` | layer 2: the first layer has its own prefixes | layer 2: a second-layer identifier in a first-layer document is refused | TARGETED_KILL |
| `M257` | layer 2: --layer=2 selects the second layer | e2e layer: --layer=2 checks the second-layer document and its report and exits 0 on the committed files | TARGETED_KILL |
| `M258` | layer 2: the layers have different documents | e2e layer: the second-layer paths are not the first layer's | TARGETED_KILL |
| `M259` | cli parser: an invalid layer value | cli parser: every other spelling of the layer is refused and never read as the first layer | TARGETED_KILL |
| `M260` | cli parser: a repeated option | cli parser: every other spelling of the layer is refused and never read as the first layer | TARGETED_KILL |
| `M261` | cli parser: an empty value | cli parser: unknown options, stray arguments, repeated options and empty values are usage errors | TARGETED_KILL |
| `M262` | cli parser: an unknown option | cli parser: unknown options, stray arguments, repeated options and empty values are usage errors | TARGETED_KILL |
| `M263` | cli parser: a stray argument | cli parser: unknown options, stray arguments, repeated options and empty values are usage errors | TARGETED_KILL |
| `M264` | cli: a usage error stops the command | e2e layer parser: an invalid layer is a usage error for every mode and never falls back to the first layer | TARGETED_KILL |
| `M265` | cli: no layer is the first layer | e2e layer parser: the two valid layers give different answers and no layer gives the first | TARGETED_KILL |
| `M266` | head: not a descendant of the base | head: an unrelated commit, a rewritten history and a history that lost the merge are not descendants | TARGETED_KILL |
| `M267` | head: a merge after the integration merge | head: a merge commit after the integration merge is refused even when it brings only allowlisted paths | TARGETED_KILL |
| `M268` | head: every commit is judged, not only the net change | head: a product change that a later commit reverted still fails, because the history is the subject | TARGETED_KILL |
| `M269` | head: the per-commit gate reports | head: a descendant that changed a product, workflow, package, migration, deploy or config path is refused, commit by commit | TARGETED_KILL |
| `M270` | head: the allowlist is the allowlist | head: HEAD may be the integration merge or a descendant whose every commit stayed inside the allowlist | TARGETED_KILL |
| `M271` | ledger: a path without a disposition | ledger: a path that is missing, extra, duplicated, retyped or reviewed at another blob is refused | TARGETED_KILL |
| `M272` | ledger: a retyped path | ledger: a path that is missing, extra, duplicated, retyped or reviewed at another blob is refused | TARGETED_KILL |
| `M273` | ledger: a path reviewed at another blob | ledger: a path that is missing, extra, duplicated, retyped or reviewed at another blob is refused | TARGETED_KILL |
| `M274` | ledger: a disposition for a path the range did not change | ledger: a path that is missing, extra, duplicated, retyped or reviewed at another blob is refused | TARGETED_KILL |
| `M275` | ledger: a path recorded twice | ledger: a path that is missing, extra, duplicated, retyped or reviewed at another blob is refused | TARGETED_KILL |
| `M276` | ledger: a disposition that does not describe the category | ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round | TARGETED_KILL |
| `M277` | ledger: security-relevant and unlinked | ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round | TARGETED_KILL |
| `M278` | ledger: linked and not security-relevant | ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round | TARGETED_KILL |
| `M279` | ledger: a disposition that cannot be linked | ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round | TARGETED_KILL |
| `M280` | ledger: a finding the document does not hold | ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round | TARGETED_KILL |
| `M281` | ledger: an observation the document does not hold | ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round | TARGETED_KILL |
| `M282` | ledger: a finding that cites no evidence at the path | ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round | TARGETED_KILL |
| `M283` | ledger: an observation that cites no evidence at the path | ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round | TARGETED_KILL |
| `M284` | ledger: evidence that no row names | ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round | TARGETED_KILL |
| `M285` | ledger: the second layer carries the list | ledger: a ledger key in a first-layer document is refused, and a second-layer document must carry both lists | TARGETED_KILL |
| `M286` | ledger: the first layer carries no ledger key | ledger: a ledger key in a first-layer document is refused, and a second-layer document must carry both lists | TARGETED_KILL |
| `M287` | ledger: the aggregates are the ledger's | ledger: every path of the range has exactly one row, and the aggregates are read from the rows | TARGETED_KILL |
| `M288` | ledger: strict means product | ledger: the strict, broad and category rules classify known paths | TARGETED_KILL |
| `M289` | ledger: the categories | ledger: the strict, broad and category rules classify known paths | TARGETED_KILL |
| `M290` | ledger: a rename names where it came from | ledger: added, modified, deleted and renamed paths are all shown, and a later edit makes the row stale | TARGETED_KILL |
| `M291` | ledger: a row is reviewed only at the same blob | ledger: added, modified, deleted and renamed paths are all shown, and a later edit makes the row stale | TARGETED_KILL |
| `M292` | ledger: the rename is detected | ledger: added, modified, deleted and renamed paths are all shown, and a later edit makes the row stale | TARGETED_KILL |
| `M293` | moved: a source behaviour change must be described | moved ledger: a source behaviour change must be described, and only a real one may be | TARGETED_KILL |
| `M294` | moved: a description needs a real change | moved ledger: a source behaviour change must be described, and only a real one may be | TARGETED_KILL |
| `M295` | moved: a description needs a moved call site | moved ledger: a source behaviour change must be described, and only a real one may be | TARGETED_KILL |
| `M296` | moved: a description once | moved ledger: a source behaviour change must be described, and only a real one may be | TARGETED_KILL |
| `M297` | moved: the old identifier in an S0 artifact | moved ledger: an old identifier left in an artifact, or in the document, is refused | TARGETED_KILL |
| `M298` | moved: the old identifier in the document | moved ledger: an old identifier left in an artifact, or in the document, is refused | TARGETED_KILL |
| `M299` | moved: the old identifier in the report | moved ledger: an old identifier left in an artifact, or in the document, is refused | TARGETED_KILL |
| `M300` | moved: an adjudication that points elsewhere | moved ledger: an old identifier left in an artifact, or in the document, is refused | TARGETED_KILL |
| `M301` | moved: a pair whose verdict changed is not a move | moved ledger: the gates read the derived ledger | TARGETED_KILL |
| `M302` | moved: an ambiguous pair | moved ledger: the gates read the derived ledger | TARGETED_KILL |
| `M303` | moved: one row per moved call site | moved ledger: the gates read the derived ledger | TARGETED_KILL |
| `M304` | moved: the change model is counted from the rows | moved ledger: the gates read the derived ledger | TARGETED_KILL |
| `M305` | moved: the ledger counts its rows | moved ledger: the gates read the derived ledger | TARGETED_KILL |
| `M306` | moved: the report names no unqualified count | moved ledger: the words 'semantic change' are refused unless they name one of the three kinds | TARGETED_KILL |
| `M307` | moved: the narrative names no unqualified count | moved ledger: the words 'semantic change' are refused unless they name one of the three kinds | TARGETED_KILL |
| `M308` | moved: the phrase is recognised | moved ledger: the words 'semantic change' are refused unless they name one of the three kinds | TARGETED_KILL |
| `M309` | moved: the named kinds are allowed | moved ledger: the words 'semantic change' are refused unless they name one of the three kinds | TARGETED_KILL |
| `M310` | moved: a position is not a verdict | moved ledger: a position-only move is told from a verdict change, and the function body from its comments | TARGETED_KILL |
| `M311` | moved: evidence and caller path are positions | moved ledger: a position-only move is told from a verdict change, and the function body from its comments | TARGETED_KILL |
| `M312` | moved: the trace position is a position | moved ledger: a position-only move is told from a verdict change, and the function body from its comments | TARGETED_KILL |
| `M313` | moved: comments are not behaviour | moved ledger: a position-only move is told from a verdict change, and the function body from its comments | TARGETED_KILL |
| `M314` | moved: a function ends at the next declaration | moved ledger: a position-only move is told from a verdict change, and the function body from its comments | TARGETED_KILL |
| `M315` | moved: the derived tags | moved ledger: the three kinds of change are counted apart, from the rows | TARGETED_KILL |
| `M316` | moved: the source behaviour is read from the code | moved ledger: the three kinds of change are counted apart, from the rows | TARGETED_KILL |
| `M317` | moved: the pair is one to one | moved ledger: the three kinds of change are counted apart, from the rows | TARGETED_KILL |
| `M318` | moved: the first-layer tree is the before | moved ledger: the three kinds of change are counted apart, from the rows | TARGETED_KILL |
| `M319` | evidence window: the expression is where the line says | moved ledger: an adjudication's references are checked for range, expression and window | TARGETED_KILL |
| `M320` | evidence window: the range is inside the file | moved ledger: an adjudication's references are checked for range, expression and window | TARGETED_KILL |
| `M321` | evidence window: a file in the tree | moved ledger: an adjudication's references are checked for range, expression and window | TARGETED_KILL |
| `M322` | evidence window: the citation of the call site's own file is near it | moved ledger: an adjudication's references are checked for range, expression and window | TARGETED_KILL |
| `M323` | s0 retry identity: the operation names its call site | retry identity: the old identifier of a moved call site is refused as the operation identity | TARGETED_KILL |
| `M324` | s0 retry identity: a range inside the file | retry identity: a source reference at the old position, or outside its file, is refused | TARGETED_KILL |
| `M325` | s0 retry identity: a reference near the call site | retry identity: a source reference at the old position, or outside its file, is refused | TARGETED_KILL |
| `M326` | s0 retry identity: an edge reference includes its consumer line | retry identity: a source reference at the old position, or outside its file, is refused | TARGETED_KILL |
| `M327` | s0 retry identity: an edge names its consumer | retry identity: a trace that moved with its call site is clean, and its identity is derived from the current identifier | TARGETED_KILL |
| `M328` | s0 retry identity: a call site names its identifier | retry identity: a trace that moved with its call site is clean, and its identity is derived from the current identifier | TARGETED_KILL |
| `M329` | s0 retry identity: the gate runs on every subject | retry: the completeness gate is computed from the committed data and stops the command line with exit 10 | TARGETED_KILL |
<!-- /RELOCK-BLOCK:mutations -->

## 10. Open items

<!-- RELOCK-BLOCK:openitems -->
| Item | Statement |
|---|---|
| `OPEN-1` | Every finding is code-confirmed on the second target tree. None was exercised at run time and no production request was made. |
| `OPEN-2` | The summary cache is invalidated only by customer writes. A change to projects, tasks, work orders, approvals, alerts or sites reaches a cached summary only through its time limit, and without Redis the generation counter is per process. The number of production replicas was not observed. |
| `OPEN-3` | The backup freshness gate parses its verification record with text tools and trusts the producer of that record: it is a freshness check and not tamper evidence. The workflow does not define the maximum-age variable, so the script default applies. |
| `OPEN-4` | The zero-width class used by the stale-process-text detector omits U+200E and U+200F, while the invisible-character fold used elsewhere in the same checker removes them. A phrase interleaved with those two marks is not matched by the detector. The two marks are recorded here as a residual limitation of the checker; the checker was not changed for it. |
| `OPEN-5` | The retired-identity test matches the three name parts in order. A look-alike spelling is not matched, and the article pages that list a retired author were not part of this range. |
| `OPEN-6` | The S0 and S1 checkers are not wired into any workflow or package script, so no pull-request check runs them, and an absent check is not evidence of a pass. Read-only queries of the repository host at the time of this relock showed no classic branch protection on main and an active ruleset that requires a pull request with zero approvals and one status check named Validate; none of the security checkers is that check. Wiring them is a separate change and was not made here. |
| `OPEN-8` | R-65 and R-72 were re-derived for the surface the second layer added, factor by factor, in a structured revision of each risk. No factor moves, so their scores and severities are reproduced by arithmetic and the first relock's snapshot is unchanged. The customers axis widens the stored priority list of R-65 and adds no organization role that the industrial axis did not already admit. |
| `OPEN-9` | The name heuristic that lists auth, session, middleware, proxy and nginx paths also matches the article author page, so the derived list of such paths holds one entry that is not an authentication surface. |
| `OPEN-7` | A host-specific path appears in the historical edge document as provenance and in the selftest fixtures as synthetic input. Neither is personal data or a live location, and neither was changed. |
| `OPEN-10` | The fix for the performance suite's database guard (R-74) is a change to a test file that is part of the range under review. It is recorded here and in the register and is left for a separate, separately authorized change; this review changes no file of the product. |
<!-- /RELOCK-BLOCK:openitems -->

## 11. The corrective round

This section records what the first independent review of this layer found and how each finding is held now. It names no count: every figure of this report is in a generated table above.

**Position of HEAD (F-01).** The identity of this layer is its integration merge, a fixed commit named by the document. HEAD is not that identity. HEAD may be the merge itself, or a descendant of it such that the merge is an ancestor, no commit after it is a merge, and every commit after it, one by one, changed only the allowlisted paths; a product change that a later commit reverted still fails. An unrelated commit, a rewritten history and a history that lost the merge fail the ancestry test. The mutation campaign now attacks this gate with tests that build their own throw-away repositories and name the position they ask about, so a mutant is killed or survives the same way whether the artifacts are uncommitted or committed. The campaign tool refuses a manifest in which a mutant of the position logic is killed by a test that neither builds its own repository nor declares that it does not depend on the position, and `verify` re-runs those mutants at the repository position it is run in, so a record made at one position cannot stay green at another.

**Moved call sites (F-02).** The operation identity and the source references of the retry traces of the two moved notification call sites named the old positions. They are corrected, and the S0 scanner now derives the identity of every trace from the current identifier of its call site or edge, refuses a reference outside its file, and requires a citation of the call site's own file within a stated window of its current line. The moved ledger keeps both identifiers of every pair and the checker refuses an old identifier anywhere else.

**The command line (F-03).** One parser serves every mode. The layer is exactly one or two, given once, as `--layer=N`; no layer means the first, which is documented; every other spelling is a usage error that stops the command before any file is read or written.

**The risks (F-04, F-06).** R-65 and R-72 carry a structured, append-only revision of the second layer: the values they had before, all nine factors reviewed one by one, and the lists they gained. No factor moves, so their scores are reproduced by arithmetic and the first relock's snapshot is unchanged. RS-003 is a new finding that opens R-74 under the second layer's own scope; its severity is computed from its factors.

**The ledger (F-05).** Every changed path has a row, section 2a, and the aggregates are read from it.

**The three kinds of change.** classificationSemanticChanges, sourceBehaviorChanges and derivedTagChanges are different measures and are never summed or called by one name.

## 12. Reproduction

```
node scripts/security/s0/getprisma-callsite-inventory.mjs check
node scripts/security/s1/relock-delta-check.mjs check --layer=2
node scripts/security/s1/relock-delta-check.mjs check
node scripts/security/s1/risk-register-check.mjs check
node scripts/security/s1/relock-mutation-campaign.mjs verify
```

The first command proves the S0 inventory against the tree. The second proves this layer, the third proves the sealed first layer, and the fourth proves the canonical register that both layers feed. The fifth proves that the mutation record belongs to the current bytes and re-runs, at the repository position it is run in, the mutants that decide where HEAD may be.
