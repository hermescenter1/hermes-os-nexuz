# Industrial Knowledge Library — Source & Runtime Inventory

Status: `PHASE_1_INVENTORY` (revision R1, 2026-09-23). This is a read-only audit. No code, schema, migration, data or
dependency was changed. No book, manual or standard was downloaded.

R1 changes:
- The Phase 101 "15 systems / HMI" drift is restated with counts and Git evidence (§1.2).
- Security findings moved to the register `knowledge-security-findings.md` (§5).
- The F-1 production state is recorded as `UNVERIFIED` (no production access).
- A citation path was corrected (`src/lib/services/knowledge-service.ts`).
- All backticked path citations in the five knowledge docs (182 at R1) were re-checked against the worktree (§7).

| Field | Value |
|---|---|
| Repository | `https://github.com/hermescenter1/hermes-os-nexuz.git` |
| Baseline | `origin/main` @ `1c7aa40579d501468212d6542ddac295f3aab685` ("Merge PR #102: fix Clarity runtime CSP"), fetched 2026-09-23 |
| Working branch | `feature/industrial-knowledge-library` (new, created from the baseline, no upstream set) |
| Working tree | isolated worktree `E:\hermes-knowledge-library` |
| Date of audit | 2026-09-23 |
| Primary checkout | `E:\hermes-os-nexuz` is on `feature/ats-recruitment-intelligence` with uncommitted ATS work; it was **not touched** by this work. Its dirty set grew from 22 to 41 ATS paths during the session, which points to a concurrent ATS session, not this one. |

## 0. Reconciliation with the brief

The brief's "initial findings" were taken from a different checkout
(`/workspace/scratch/.../hermes-phase111`, branch `feature/phase111-edge-gateway-foundation`).
On this machine and on the remote:

| Brief claim | Observed at `1c7aa40` |
|---|---|
| Branch `feature/phase111-edge-gateway-foundation` | **Does not exist** locally or on `origin` (`git branch -a` after `git fetch --prune`) |
| Untracked `docs/industrial/phase111-edge-gateway-foundation.md`, `tools/hermes-edge-gateway/` | **Not present** in this repository; nothing here could overwrite them |
| 7 library JSON files + `cases.json`, 30 entries + 14 cases | **Confirmed**: plc 5, electrical 5, cybersecurity 4, scada-hmi 4, maintenance 3, protocols 5, instrumentation 4 = 30; `cases.json` = 14 |
| No PDF/EPUB/DOCX/MOBI in the checkout | **Confirmed** — none in the tree (excluding `node_modules`) and none ever added in Git history (`git log --all --diff-filter=A -- '*.pdf' '*.epub' '*.mobi' '*.djvu'` is empty) |
| `src/lib/industrial-knowledge/` provenance + TIA/SCADA reference corpora | **Confirmed**; all corpora are `SYNTHETIC_ORIGINAL` (§1.2) |
| `AGENTS.md` | **Not present**; the repo's instructions are `CLAUDE.md` |

## 1. What exists today is not a book library

There is **no book, manual, standard, or third-party document** anywhere in the
repository, its history, or its runtime data paths. Everything that looks like
"library" content is Hermes-authored:

### 1.1 Static knowledge snippets — `src/lib/industrial/knowledge-data/`

- Library records (`plc.json` etc.): shape `{ category, libraries: [{ id, domains[], keywords[], keywordsDe[], vendor? }] }` — types at `src/lib/industrial/knowledge.ts:46-55`. They carry **only** match keywords.
- The visible text lives in the i18n catalogue `messages/{fa,en,de}.json` under `knowledge.<id>.{name,summary,p1,p2,p3,c1,c2}` (`knowledge.ts:13-21`). Example (`knowledge.s71500.summary`, en): "Modular high-end controller: performance, diagnostics, and fail-safe options." These are short original summaries, not excerpts.
- `cases.json`: 14 troubleshooting cases, `{ id, vendor, category, keywords[], en, fa }` with `symptoms/rootCause/resolution/rootCauses[]/verificationSteps[]/correctiveActions[]` (`src/lib/industrial/cases.ts:14-33`). No German body (`CASE_CONTENT_LOCALES = ["en","fa"]`, `cases.ts:54`).
- **No citation fields exist**: none of the 8 files has `title`, `author`, `publisher`, `url`, `license` or `source`. Nothing records where a statement comes from.
- `prisma/seed.ts:25,67-106` upserts both sets into `KnowledgeArticle` / `EngineeringCase` with `status: "published"` and ids `seed-<id>`.

### 1.2 Synthetic reference corpus — `src/lib/industrial-knowledge/`

- 10 sealed systems (`reference/index.ts:23-34`): TIA-01…05 and SCADA-01…05, every one `origin: "SYNTHETIC_ORIGINAL"` (`types.ts:443-447`, the only allowed value).
- Per-node provenance (`types.ts:242-259`): `projectId, subsystem, sourceType ∈ {TIA_REFERENCE, SCADA_REFERENCE, HMI_REFERENCE}, sourceId, version, revision, checksum (SHA-256), domain, safetyClass`. **There is no licence field and no edition/page field**; licensing appears only in file-header comments (e.g. `reference/tia-01-steel-rolling.ts:4-7`).
- Deterministic engine `diagnose()` (`diagnostics.ts:230-447`, version `phase101-structural-1.0.0`) — no clock, no network, no LLM; every citation carries project, source id, safety class, domain and subsystem (`cite`, `diagnostics.ts:199-216`).
- Runtime seam `runtime/bridge.ts`; only 7 of 85 scenarios are public (`runtime/exposure.ts:50-58`); server-only guard `runtime/server-boundary.ts:44-52`.
- **Doc drift (corrected, with evidence).** `docs/industrial/phase101-existing-state-matrix.md` §4 "What Phase 101 adds" (`:66-75`) lists 5 TIA + 5 SCADA + **5 HMI** reference systems (`reference/hmi-0{1..5}-*.ts`, `:71`), `retrieval.ts`/`envelope-projection.ts` (`:72`) and `command-center.ts` (`:75`). `:86` says "All 15 reference systems". The repository shows otherwise:
  - `git ls-tree HEAD src/lib/industrial-knowledge/reference/` has **12 files**: `_authoring.ts`, `index.ts`, and **10** system files (`tia-01…05`, `scada-01…05`). There are **0** `hmi-*` files.
  - `reference/index.ts:23-34` registers exactly **10** systems.
  - `git log --all --oneline -- <path>` (every local and remote ref, after `git fetch --prune`) returns **0 commits** for `reference/hmi-*`, `industrial-knowledge/retrieval.ts`, `envelope-projection.ts` and `command-center.ts`. They **never existed on any branch**; this is not a merge loss.
  - `runtime/exposure.ts:4` reads "85 authored fault scenarios across ten reference systems".
  - The test `__tests__/scada-04-reference.test.ts:656` asserts `expect(CORPUS.length).toBe(10)`. That test exists but **was not executed** in this session, because the worktree has no `node_modules`.
  - `HMI_REFERENCE` exists only as an enum value (`types.ts:237`) that no system uses. `types.ts:30` references the absent `envelope-projection.ts`.
  - **Correct statement: 10 synthetic systems (5 TIA, 5 SCADA), 0 HMI systems, 85 scenarios, 7 public.** The matrix row describes planned deliverables that were never built. This document does not edit the matrix; correcting it is a follow-up for its owner.
- `docs/industrial/phase101r-runtime-ownership.md:12-18` records `AUTHENTICATED_ADAPTER_CONSUMER=NONE`, `PLANT_CONNECTION=NONE`, `PLANT_WRITE=NONE` — still true.

**Conclusion:** the corpus is original, synthetic reference material. It must never be presented as a Siemens project, a TIA Portal file, or a vendor document, and it must stay separated from any real third-party source text.

### 1.3 Org-scoped Knowledge Engine (tenant data, not a reference library)

`prisma/schema.prisma:1715-2014`: `KnowledgeCategory`, `IndustrialKnowledgeArticle` (with `sourceType` enum `MANUAL | ENGINEERING_STANDARD | MAINTENANCE_HISTORY | FAILURE_ANALYSIS | VENDOR_DOCUMENTATION | INTERNAL_CASE`, `version`, `status`, `authorId`), `IndustrialFailureMode`, `IndustrialRootCause`, `IndustrialMaintenanceProcedure`, `IndustrialEngineeringCase`, `AssetKnowledgeLink`, graph tables. Every row has a required `organizationId`. There are no url, licence, edition, page or citation columns and no locale column. APIs: `/api/knowledge/{articles,cases,failures,procedures,search}`. Their guard chain is `requirePlatformAuth → requireOrgActor(ctx.orgId) → requirePermission("view_knowledge"|"manage_knowledge")` (e.g. `src/app/api/knowledge/articles/route.ts:14-21`), with `limit ≤ 100`. Tenant isolation is tested (`src/app/api/knowledge/__tests__/org-knowledge-access.test.ts`, `tenant-isolation.test.ts`).

### 1.4 Generic document pipeline (exists, but not fit for a licensed library)

- `Document` (`schema.prisma:128-154`) has a nullable `tenantId`. `DocumentTextChunk` (`:182-200`) has **no tenant column and no FK**. `DocumentChunk` (`:226-245`) has a required `vector(1536)`.
- pgvector is enabled (`prisma/migrations/20260616000000_add_document_chunk_pgvector/migration.sql:20`), with HNSW cosine indexes.
- `POST /api/documents` is gated by platform `admin` only (`src/app/api/documents/route.ts:39-49`). `Document.tenantId` is **never written**, and `list()` is an unfiltered `findMany` (`src/lib/documents/document-repository.ts:128`).
- Extraction supports only `.txt/.md/.markdown` (`src/lib/documents/extraction.ts:6-11`). PDF/DOCX are refused with `unsupported_extraction_type` (`processing.ts:80-86`). **No PDF/DOCX/OCR/zip/XML parser dependency exists** in `package.json`.
- Chunking is by character count: 500 characters with 50 overlap (`src/lib/rag/config.ts:122-123`). It has no page, section or heading provenance.
- Storage uses the `ObjectStorage` interface (`src/lib/documents/object-storage.ts:39-45`). Only the local-disk provider is implemented (`.data/documents`). The `minio`/`s3` providers are stubs that reject every call (`:111-125`).

## 2. Surfaces (UI, API, SEO)

### 2.1 Public (unauthenticated) pages

Middleware protects only paths listed in `PROTECTED_PATHS` (`src/lib/auth/rbac.ts:143-168`). The matcher excludes `/api` (`src/middleware.ts:168`).

| Route | Content | Notes |
|---|---|---|
| `/[locale]/library` | server page + client `LibraryClient` | the client imports all 8 JSON files via `src/lib/services/knowledge-service.ts:1-2` (a comment admits it is "bundled into the client-side `LibraryClient`", `:19-21`) |
| `/[locale]/library/[article]` | server, prebuilt for 30 ids × 3 locales | JSON-LD `articleSchema` (`:73-91`) |
| `/[locale]/library/cases`, `/cases/[id]` | server wrapper + client `CaseExplorerClient` | case bodies rendered directly (`cases/[id]/page.tsx:83`) |
| `/[locale]/library/vendor/[vendor]` | server | — |
| `/[locale]/articles/*` (Journal) | server, `force-dynamic` | `Article` model (`schema.prisma:6595-6652`), no `organizationId`; `ArticleKnowledgeMetadata` (`:6872-6894`) has `sourceReliability`, `evidenceLevel`, `linkedStandard`, `humanReviewed` |
| `/[locale]/brain`, `/[locale]/industrial-brain`, `/[locale]/academy` | public shells | Brain API itself requires authoring |

`/[locale]/knowledge`, `/industrial`, `/journal`, `/resources` and `/docs` do not exist as index pages.

### 2.2 Protected pages

- `/knowledge/studio` and `/knowledge/case-studio` require login plus `<RequireCapability capability="authoring">` and are noindex.
- `/dashboard/knowledge/*` uses the `dashboard` rule.
- `/documents/*` is limited to admin, superadmin and engineer (`rbac.ts:321-323`).

### 2.3 SEO

- `src/app/sitemap.ts` (force-dynamic) lists:
  - `/library/<id>` × fa/en/de (`:198-200`)
  - `/library/cases/<id>` × en/fa (`:214-218`)
  - `/library/vendor/<id>` (`:226-228`)
  - published and indexable Journal articles (`:270-282`)
- Database `KnowledgeArticle`/`EngineeringCase` rows are **not** in the sitemap.
- `robots.ts:160-165` allows training crawlers (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended) on `/library/`, `/services/` and `/academy/`.
  - **Implication:** any third-party text ever rendered under `/library/` would be offered to AI crawlers. A future public catalogue must contain only Hermes-authored summaries and bibliographic metadata.

### 2.4 i18n

- Locales are `fa` (default), `en` and `de` (`src/i18n/locales.ts:25,37`).
- Namespaces used: `knowledge`, `library`, `knowledgeCases`, `caseExplorer`, `brain`, `knowledgeStudio`, `caseStudio`, `ke`, `journal`, `documents`, `engineeringDocuments`, `adminDocuments`, `industrialBrain`.
- `fa.json` is CRLF in the worktree.
- Adding a top-level namespace requires the pinned leaf counts and the German-gate coupling to be bumped (see the existing i18n gates).

## 3. Brain answer paths and retrieval

| Path | Behaviour | Citations | Evidence |
|---|---|---|---|
| `POST /api/brain` | Requires authoring plus a same-origin check (`src/app/api/brain/route.ts:442-455`). Deterministic keyword pipeline (`runPipeline`, `:490`); an optional LLM rephrase goes directly to Anthropic via `src/lib/llm/gateway.ts` (model pinned at `:75-82`). | Default path: message-catalogue library ids only (`buildCitations`, `:106-116`); the LLM output has no citations. | Merges published DB rows (`getPublishedCorpus`, `:488`). |
| Governed path (`HERMES_AI_GOVERNANCE_ENFORCED=1`) | Deterministic result is authoritative; the LLM only rephrases. | Server-issued ids `S1…`, all verified by `verifyCitations` (`src/lib/ai-governance/citation-verifier.ts:49-85`); one bad id rejects the whole output. | Retrieved text goes into an `UNTRUSTED_RETRIEVED_DATA` fence (`src/lib/ai-governance/prompt-envelope.ts:39-61`). `screenForInjection` runs **on the question only** (`src/lib/ai-governance/runtime/brain-governance.ts:76`). Corpus sources get `checksum: null`, `version: "published"` (`src/lib/ai-governance/runtime/brain-adapter.ts:110-128`). |
| `POST /api/industrial-brain/analyze` | Fully deterministic legacy analyzer | `source` fields | rate limit, 32 KB cap, Zod |
| Phase 101 reference panel | Deterministic, curated scenario ids only | full node provenance | — |
| RAG layer `src/lib/rag/*` | Flags `HERMES_RAG_BRAIN_ENABLED` + `HERMES_RAG_ENABLED`. Embeddings: mock (default), OpenAI, or local. | scored chunks | Re-embeds on every request; no durable ingestion (`vector-store-pgvector.ts:37-42`). |
| Document search `src/lib/documents/search.ts` | Flag `HERMES_DOCUMENT_RAG_ENABLED`, off by default (`brain/route.ts:838-850`) | chunk and document ids | **See finding F-1** |
| Knowledge search `src/lib/knowledge/search.ts` | deterministic weighted matching | record ids | org-scoped |

**Full-text search:** no `tsvector`, `pg_trgm` or GIN full-text index exists in the schema or in any of the 76 migrations (`ls -d prisma/migrations/*/` = 76 directories = 76 tracked `migration.sql` files; `grep -rliE "tsvector|pg_trgm|to_tsvector|gin_trgm_ops|USING gin" prisma/migrations` = 0 files; re-checked 2026-09-24. The earlier "77" was a miscount). No external search engine is present.

**Safety guardrails that exist and must be preserved:**
- `src/lib/llm/guardrails.ts:35-42`: no execution, no safety bypass, no unsafe forcing, human approval, LOTO notice.
- `screenQuestion`: `:77-90`.
- `humanApprovalRequired: true` is always set (`brain/route.ts:507,613`), and governance can only raise it (`brain-governance.ts:192-193`).
- `unsafe-output.ts:13-47` covers fa/en/de.
- Copilot blocks control verbs (`src/lib/copilot/safety.ts:37-72`).
- The TIA companion types every write/download capability as literal `false` (`src/lib/tia-companion/contract.ts:395-421`).
- Phase 101 `isReviewOnly` treats anything other than `NON_SAFETY` as review-only, including `UNKNOWN` (`types.ts:484-486`).

## 4. Storage, security and operations machinery that can be reused

| Concern | Existing mechanism | Gap for a licensed library |
|---|---|---|
| Secure upload | Media hub (Phase 102): `requirePlatformAuth → requireTrustedOrigin → requireOrgActor → requirePermission("manage_media") → rate limit → entitlement`, **magic-byte** + extension + MIME agreement (`src/lib/media/validation.ts:136-171,479`), server-minted keys, authenticated byte serving (`byte-serving-auth.ts:228`), hardened reads (`secure-read.ts`) | `/api/documents` has none of this: no tenant scoping, no magic-byte check, and it accepts `application/octet-stream` |
| Malware scanning | **None** (recorded as `BLOCKED_OWNER` in `docs/phase102/architecture.md:133,163,219`). Workaround: terminal `QUARANTINED` state | needed before accepting any user-supplied PDF/DOCX |
| Archive handling | None for user archives; `scripts/dr/uploads-archive.mjs` is an internal backup format | no zip-bomb limits, no entry caps |
| Object storage | `ObjectStorage` (local only) | S3/MinIO adapter missing |
| Volumes | `docker-compose.prod.yml`: `uploads_data` → `/app/public/uploads` (served **publicly** by Next), `documents_data` → `/app/.data/documents` (private) (`:58,65,275-281`); nginx proxies everything (`deploy/nginx/default.conf:44-60`), `client_max_body_size 50M` | private library bytes must live in `documents_data`-class storage, **never** under `public/` |
| Backup/restore | `scripts/backup-postgres.sh` + `scripts/dr/backup-uploads.mjs` (both volumes, AES-256-GCM `.hbk`) | the uploads archive is packed fully in memory (`uploads-archive.mjs:209-221`), which will not scale to a large corpus |
| Audit | `recordAuditEvent` / `recordAuditEventOrThrow` (`src/lib/audit/audit-service.ts:366,411`); `DOCUMENT_UPLOADED/DELETED` actions exist | — |
| Retention / erasure | `src/lib/compliance/retention-engine.ts` (plan-only, legal hold wins) | no `Document`/blob target in `erasure-targets.ts` |
| Safe content import | Phase 106: `docs/phase106/production-import-runbook.md` (dry-run default, `--commit`, idempotent `Unchanged: N`, no delete/force), `scripts/journal/import-articles.mjs`, manual `.github/workflows/journal-import.yml` with the protected `production` environment and a confirmation phrase, a profile-gated compose service | reuse this pattern exactly |
| AuthZ | `requirePlatformAuth` (`src/lib/api/auth.ts:609`), `requireOrgActor` (`src/lib/org/context.ts:115`), `requirePermission`/`can` (`src/lib/org/rbac.ts:287-299`), `requireSiteActor` (`src/lib/site/context.ts:100`), `canOnSite` (`src/lib/site/rbac.ts:26`). The CLAUDE.md name `requireActor` no longer exists | no library-specific permission; `view_knowledge`/`manage_knowledge` exist (`rbac.ts:57-58`) |

## 5. Findings discovered during the audit

These are out of scope for Phase 1 and are reported, not fixed. The security findings (F-1 to F-4) are maintained with evidence, impact, priority and a proposed fix in **`knowledge-security-findings.md`**. The F-1 remediation plan, with regression tests, is in **`f1-document-rag-remediation-plan.md`**.

| Id | Priority | Finding (summary) | State |
|---|---|---|---|
| F-1 | **P0, security blocker** | With `HERMES_DOCUMENT_RAG_ENABLED=true`, `POST /api/brain` returns document chunk text across tenants: `search()` has no tenant predicate, and `DocumentTextChunk` has no tenant column. | OPEN. Production flag state **UNVERIFIED**: this session has no production access, so the flag was neither read nor changed. The operator check procedure is in the register §F-1.4. |
| F-2 | P1 | The document pipeline never writes `Document.tenantId`; list, read, process and delete are unscoped; platform-`admin` gate only. | OPEN |
| F-3 | P2 | Anonymous `GET /api/knowledge` does an unbounded full read, then filters in JavaScript. No draft leak was observed. | OPEN |
| F-4 | P3 | The avatar upload trusts the declared MIME type (public path). | OPEN (noted) |
| F-5 | INFO | Stale comments claim RAG, the AI router and document search are "not wired into /api/brain". All three are wired in. | `src/lib/ai/router.ts:15-22`; `rag-pipeline.ts:20`; `documents/search.ts:10-14`; `schema.prisma:202` | Reported |
| F-6 | INFO | The Phase 101 state matrix lists 15 systems including 5 HMI systems, plus `retrieval.ts`, `envelope-projection.ts` and `command-center.ts`. Git shows 10 systems and 0 HMI systems, and the other files never existed on any ref. | §1.2 | Reported (matrix not edited) |

## 6. Missing pieces for the requested capability

1. A source/edition registry with licence, provenance and checksum. None exists anywhere.
2. Page, section and heading-aware extraction for PDF, DOCX or EPUB. No parser is installed.
3. Durable, idempotent ingestion runs with a manifest and parser version. The current RAG re-embeds on every request.
4. Citations to a real source, edition and page. Current citations point only at catalogue ids or synthetic nodes.
5. Product-version applicability (TIA Portal version, CPU firmware, model). No such fields exist.
6. A tenant-safe document store and retrieval (F-1, F-2).
7. Malware scanning and parser sandboxing.
8. A public catalogue with bibliographic metadata and attribution. There is no such page or model.

## 7. Validation performed in Phase 1

- `git fetch origin --prune`, `git status`, `git worktree list`, `git branch -a`, `git log --all --diff-filter=A` (book extensions): read-only.
- `node -e` record counts over the 8 JSON files.
- Direct source reads to confirm F-1, F-3, `Document`/`DocumentTextChunk` shape and the `/api/brain` auth prologue.
- **R1:**
  - `git fetch` confirmed `origin/main` is still `1c7aa40`.
  - `git ls-tree` and `git log --all -- <path>` were run for the Phase 101 corpus claims.
  - A scripted check covered all 182 backticked path citations across the five knowledge docs. There were 0 out-of-range line numbers. Every cited file exists and every cited line number is within its file's length. The only "missing" hits are intentionally absent files: proposed new files and the never-built Phase 101 items.
  - About 25 key citations were spot-read for content, e.g. `requirePlatformAuth` at `src/lib/api/auth.ts:609`, the sitemap loops, the `PROTECTED_PATHS` start, and the 500/50 chunk constants.
- **No** lint, typecheck, test or build was run, because no code was changed. `scada-04-reference.test.ts` was cited, not executed.
