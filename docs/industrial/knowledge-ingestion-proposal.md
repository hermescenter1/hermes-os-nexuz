# Industrial Knowledge Library — Ingestion & Publication Proposal

Status: `PHASE_1_PROPOSAL` (revision R1, 2026-09-23). This is a design for review only.

- No schema, migration, dependency, route or data change has been made.
- Nothing is to be implemented until the owner approves this document and the
  open decisions in §11.
- **Prerequisite:** the F-1 security blocker (`knowledge-security-findings.md`) is P0.
  No phase that touches `/api/brain` (P2c) starts before F-1 is fixed and verified.

Inputs:
- `docs/industrial/knowledge-source-inventory.md`: the current state, with evidence.
- `docs/industrial/knowledge-source-catalog.md`: candidate sources and licence decisions. The MVP is §2 there.
- `docs/industrial/knowledge-security-findings.md`: open findings F-1 to F-4.
- `docs/industrial/f1-document-rag-remediation-plan.md`: the F-1 fix plan and its regression tests.

R1 applies the owner instructions of 2026-09-23:
- MVP limited to confirmed commercial-use licences.
- No NC, IEC/ISA, Siemens or Mitsubishi ingestion.
- No commercial books in RAG without a reviewed explicit licence.
- Metadata-only public display, as each source's terms permit.
- Parser, embedding and scanner choices written up as options (§4A).
- D1–D9 marked decided or open (§11).

## 1. Goals and non-goals

**Goals**
1. A **source registry**: every external source has a record for bibliography, licence, edition, provenance and decision.
2. **Private, reproducible ingestion** of `ALLOWED` sources only, with page, section and heading provenance.
3. **Citable retrieval** in the Brain. Answers distinguish *source quotation*, *inference* and *Hermes-authored knowledge*, and flag version mismatch and uncertainty.
4. A **public, SEO-friendly catalogue** showing metadata, the official link, the licence and a Hermes-authored summary. Never source full text.

**Non-goals (explicitly out of scope)**
- Mirroring or republishing any book, manual or standard.
- Ingesting `METADATA_ONLY` or `BLOCKED_LICENSE_REVIEW` sources.
- Any OT write path. The library never issues PLC commands, CPU downloads or setpoint changes.
- Replacing the existing Hermes-authored snippets, the Phase 101 synthetic corpus, or the org-scoped Knowledge Engine. All three stay as they are and stay **separate**.

## 2. Separation of knowledge planes

| Plane | Today | Proposed rule |
|---|---|---|
| **Hermes-authored snippets** (`src/lib/industrial/knowledge-data`, `messages/*.knowledge`) | public, bundled to the client | Unchanged. They may *cite* registry sources as metadata (new optional `sourceRefs` → registry ids), and never embed source text. |
| **Synthetic reference corpus** (`src/lib/industrial-knowledge/reference`, `SYNTHETIC_ORIGINAL`) | server-only, 7 public scenarios | Unchanged. It is never merged into the reference library, and citations keep `sourceType ∈ {TIA,SCADA,HMI}_REFERENCE`. |
| **Tenant Knowledge Engine** (`IndustrialKnowledgeArticle` etc., `organizationId` required) | org-scoped | Unchanged. |
| **Reference library (new)** | — | A global, Hermes-curated, **read-only for tenants** corpus of `ALLOWED` sources. Separate tables, a separate module (`src/lib/knowledge-library/`), a separate citation kind `REFERENCE_SOURCE`. |
| **Tenant-private documents (later, Phase 3)** | `Document` pipeline (not tenant-safe: F-1, F-2) | Only after F-1/F-2 are fixed and malware scanning exists. Every row has `organizationId`, filtered in SQL. |

Retrieval results always carry their plane. The response contract must make it impossible to present synthetic or Hermes-authored text as a vendor source, or the reverse.

## 3. Data model (proposed, additive, not applied)

A single new additive migration. It adds no change to any existing table.

```prisma
enum KnowledgeSourceKind      { BOOK MANUAL DATASHEET STANDARD WHITE_PAPER TRAINING GOVERNMENT_PUBLICATION ONLINE_HELP }
enum KnowledgeLicenseStatus   { PUBLIC_DOMAIN OPEN_LICENSE FREE_WITH_STATED_TERMS USER_SUPPLIED_LICENSED_COPY COMMERCIAL_LICENSE_REQUIRED UNKNOWN }
enum KnowledgeIngestDecision  { ALLOWED METADATA_ONLY BLOCKED_LICENSE_REVIEW }
enum KnowledgeSourceStatus    { DRAFT APPROVED PUBLISHED RETIRED }

model KnowledgeSource {            // one row per work + edition
  id               String   @id @default(cuid())
  slug             String   @unique
  catalogRef       String   @unique          // e.g. "O1", "O5" from the catalog
  kind             KnowledgeSourceKind
  title            String
  authors          Json                        // string[]
  issuer           String                      // publisher / issuing body
  edition          String?
  publishedOn      String?                     // as printed; no invented precision
  language         String                      // BCP-47
  officialUrl      String
  acquisitionUrl   String?                     // lawful download URL, if any
  licenseStatus    KnowledgeLicenseStatus
  licenseId        String?                     // SPDX id where one exists (CC-BY-4.0)
  licenseUrl       String?
  attributionText  String?
  shareAlike       Boolean  @default(false)
  ingestDecision   KnowledgeIngestDecision
  publicShowMetadata Boolean @default(true)
  publicAllowExcerpt Boolean @default(false)   // default: never
  applicability    Json     @default("[]")     // [{vendor, family, model?, software?, versionMin?, versionMax?, firmwareMin?, firmwareMax?}]
  supersededById   String?
  safetyClass      String   @default("UNKNOWN") // reuse NON_SAFETY | SAFETY_RELATED | SAFETY_CRITICAL | UNKNOWN
  status           KnowledgeSourceStatus @default(DRAFT)
  reviewedAt       DateTime?
  reviewedBy       String?
  reviewNotes      String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@index([ingestDecision, status])
}

model KnowledgeSourceSummary {     // Hermes-authored, publishable, trilingual
  id        String @id @default(cuid())
  sourceId  String
  locale    String                  // fa | en | de
  summary   String
  @@unique([sourceId, locale])
}

model KnowledgeSourceFile {        // private bytes of an ALLOWED source
  id            String   @id @default(cuid())
  sourceId      String
  sha256        String   @unique
  sizeBytes     Int
  mimeType      String
  storageKey    String            // private store only, never public/
  retrievedFrom String
  retrievedAt   DateTime
  parserName    String
  parserVersion String
  pageCount     Int?
  ocrUsed       Boolean  @default(false)
  ocrMeanConfidence Float?
  @@index([sourceId])
}

model KnowledgeSourceChunk {
  id            String   @id @default(cuid())
  fileId        String
  sourceId      String            // denormalised for gating joins
  ordinal       Int
  pageStart     Int?
  pageEnd       Int?
  sectionPath   String?           // "3 > 3.2 > 3.2.1"
  heading       String?
  text          String
  textSha256    String
  language      String
  tokenCount    Int
  embedding     Unsupported("vector(1536)")?
  embeddingModel String?
  @@unique([fileId, ordinal])
  @@index([sourceId])
  // Raw-SQL migration adds a generated tsvector column + GIN index ('simple' config;
  // Postgres ships no Persian dictionary) and an HNSW cosine index on embedding.
}

model KnowledgeIngestRun {
  id             String   @id @default(cuid())
  manifestSha256 String
  mode           String            // DRY_RUN | COMMIT
  gitCommit      String
  parserVersions Json
  counts         Json              // {sources, files, chunksAdded, chunksUnchanged, rejected}
  status         String
  startedAt      DateTime @default(now())
  finishedAt     DateTime?
  operator       String
}
```

**Database-level gates**
- A trigger or `CHECK` rejects a `KnowledgeSourceFile` or `KnowledgeSourceChunk` row whose source is not `ingestDecision = 'ALLOWED'`. The rule sits in the database, not in the importer.
- Retrieval SQL always joins `KnowledgeSource` and requires `ingestDecision = 'ALLOWED' AND status IN ('APPROVED','PUBLISHED')`. Retiring a source removes it from answers without deleting rows.

**Why not reuse `Document`/`DocumentTextChunk`**
- They have no licence or edition provenance.
- `DocumentTextChunk` has no tenant column (F-1).
- The 500-character chunks have no page or section information.
- Extending them would change a live path that `/api/brain` already reads.

## 4. Ingestion pipeline (offline, separate from deploy)

The design copies the Phase 106 journal-import pattern, which is proven in this repository: `docs/phase106/production-import-runbook.md`, `scripts/journal/import-articles.mjs` and `.github/workflows/journal-import.yml`.

1. **Manifest in Git** (`knowledge/manifests/<catalogRef>.json`). It holds metadata only and never text: registry fields, the official acquisition URL, the expected `sha256`, the parser, the page range and the applicability. Every manifest change is reviewed through a PR.
2. **Acquisition** (`scripts/knowledge/acquire.mjs`), run manually by an operator:
   - Fetches only URLs listed in a manifest, from a **host allowlist** (for the MVP: `www.ibiblio.org`, `eng.libretexts.org`, plus the exact host recorded for O4).
   - Refuses cross-host redirects, `file:`/private IPs and bodies over the size cap.
   - Verifies the manifest `sha256`.
   - No end-user-supplied URL is ever fetched, so there is no SSRF surface.
3. **Parse** (`scripts/knowledge/ingest.mjs`), inside the importer container, **not** in the web runtime:
   - The container runs with no network, a read-only root filesystem, a CPU/memory/time budget, a maximum page count and a maximum extracted-text size.
   - Only text is extracted. PDF JavaScript, actions, forms and embedded files are never executed or followed. Office macros are not supported, since DOCX is out of scope for the MVP.
   - OCR is off by default. If an owner-approved source needs OCR, pages below the confidence threshold are dropped and counted.
4. **Chunk:**
   - Heading-aware, bounded to about 800–1200 tokens with overlap.
   - Every chunk records the page range, section path and heading.
   - Language detection is recorded.
   - `textSha256` is used for dedup.
5. **Dry run by default:**
   - Prints `DRY_RUN=PASS`, the counts and the diff against the database without writing.
   - `--commit` writes in one transaction per source.
   - Re-running with the same manifest must print `chunksUnchanged = N, chunksAdded = 0`.
   - No `--force`, and no deletes. A changed file (new sha) creates a new `KnowledgeSourceFile`; the old one is retired, not overwritten.
6. **Embeddings** are an optional second pass. They are **not enabled** until an option in §4A.2 is chosen. The Phase 95 model registry and tenant policy decide whether any external embedding API may be called.
7. **Production path:**
   - A manual `workflow_dispatch` workflow runs against the protected `production` environment.
   - The commit must be on main and the worktree clean.
   - The dry run must pass, and an exact confirmation phrase is required.
   - It runs a profile-gated compose service (`knowledge-import`).
   - A verified pre-import backup is a precondition.
   - The deploy itself never writes corpus data.

## 4A. Technical options (recorded, not chosen, not executed)

Nothing in this section has been installed, configured or run. Each choice needs owner approval, and the evidence behind it (a spike in a disposable worktree, or a licence and security review of the dependency) must be presented before adoption.

What the MVP sources actually are:
- O1 and O2 are Kuphaldt PDFs, some of them very large.
- O4 and O5 are LibreTexts HTML books.
- So the MVP needs **HTML → text** and **PDF → text** only. No DOCX, EPUB or OCR.

### 4A.1 Parser (D5)

| Option | What it is | Cost | Risk | Impact |
|---|---|---|---|---|
| P-A: `pdftotext` (poppler-utils) in the importer image only | system binary called from the importer script | Low: an OS package in a separate Dockerfile stage, no web-image change | Native C parser with past CVEs, mitigated by no network, a read-only filesystem, time/memory limits and a non-root user. Emits page breaks (`\f`), which gives page provenance. | Good page fidelity; no JS dependency added to the app |
| P-B: `pdfjs-dist` (npm) in the importer only | Mozilla PDF.js text layer | Low–medium: a new npm dependency, which CLAUDE.md requires approval for | JS parser in the same runtime as the importer; must run with scripting disabled; larger install; lockfile change | Page-accurate text; pure JS |
| P-C: HTML → text for LibreTexts (O4, O5) | a DOM parser plus heading-aware extraction. The only DOM library in the repo is `jsdom`, and only as a **devDependency** (`package.json:84,96`). Using it in the importer means promoting it, or adding a vetted parser, in the importer image only. | Low | HTML from an allowlisted host only; strip scripts and styles; never execute | Gives a heading/section path for LibreTexts; no page numbers (use section anchors) |
| P-D: defer PDFs, HTML sources only (O4, O5) | skip O1/O2 until a PDF parser is approved | Lowest | Lowest | The MVP loses the strongest source (O1 instrumentation) |

**Recommendation:** P-A + P-C, confined to the importer image. Fall back to P-D if no PDF parser is approved.

### 4A.2 Embeddings (D6)

| Option | Cost | Risk | Impact |
|---|---|---|---|
| E-A: none; Postgres FTS only (`'simple'` config + GIN) | None | None external; no data leaves the host | Keyword recall only; weaker for paraphrased or Persian queries |
| E-B: external API (the configured OpenAI `text-embedding-3-small`, 1536-dim, as used by the existing pipeline) | Per-token cost for the corpus (one-off) plus every query | **Every user question leaves the host.** Provider availability and terms for an Iranian operator are a counsel question (D1 family). Requires the Phase 95 provider policy. | Best semantic recall; reuses the existing `vector(1536)` + HNSW infrastructure |
| E-C: local embedding server (the existing `HERMES_LOCAL_EMBEDDING_URL` adapter) | A model plus a CPU/GPU service to operate | Model licence review; ops burden; dimension must match the column | No data egress; semantic recall |

**Recommendation:** E-A for the MVP. Evaluate E-C later with a measured recall benchmark.

### 4A.3 Malware scanning (D7)

| Option | Cost | Risk | Impact |
|---|---|---|---|
| M-A: none for P2; rely on host allowlist + pinned `sha256` + a sandboxed parser | None | Residual risk: a malicious file at an official URL whose checksum was pinned at review time | Adequate only for the curated official sources in the MVP |
| M-B: ClamAV sidecar (`clamd`) scanning in the importer before parse | A new compose service, signature updates, about 1 GB RAM | Signature-based coverage only; a new container to patch | Required baseline before **any** user-supplied file (P3) |
| M-C: external scanning API | Per-file cost | **Uploads leave the host**; licensed or confidential content is exposed to a third party | Not recommended for licensed or tenant data |

**Recommendation:** M-A for P2 (official sources only). M-B is a **hard precondition** for P3 tenant uploads. M-C is rejected.

## 5. Retrieval and answer contract

- A new server-only module `src/lib/knowledge-library/`: `registry.ts`, `retrieval.ts` and `citations.ts`.
  - It uses the same runtime guard as `industrial-knowledge/runtime/server-boundary.ts`.
  - A client-graph test (as in `phase101r-client-boundary.test.ts`) proves no client component imports it.
- Retrieval is hybrid: Postgres FTS (`'simple'` config) plus optional pgvector, bounded `topK ≤ 8` and a per-chunk text cap.
- **Brain integration** is a new evidence layer in `/api/brain`, behind `HERMES_REFERENCE_LIBRARY_ENABLED` (default **off**, so the response is byte-identical when off). It is used only through the **Phase 95 governed path**:
  - Chunks go inside the `UNTRUSTED_RETRIEVED_DATA` fence (`src/lib/ai-governance/prompt-envelope.ts`).
  - `screenForInjection` is **extended to retrieved chunks**. Today it screens only the question: `runtime/brain-governance.ts:76`.
  - Citations are server-issued ids verified by `citation-verifier.ts`.
  - The deterministic result stays authoritative.
- **Citation shape**: `{ kind: "REFERENCE_SOURCE", catalogRef, title, edition, pageStart, pageEnd, sectionPath, licenseId, officialUrl }`.
- **Statement labels** in the response: `SOURCE_QUOTE` (short, attributed), `INFERENCE` (Hermes reasoning over sources) and `HERMES_AUTHORED` (snippets or cases), plus `UNKNOWN` / `CONFLICT` markers when sources disagree or the evidence is missing.
- **Version applicability:**
  - The question context (vendor, model, software version, firmware) is matched against `applicability`.
  - Chunks from a superseded edition or a non-matching version are returned with a `VERSION_MISMATCH` or `SUPERSEDED` flag and are **never** phrased as current instructions.
  - If no applicable source exists, the answer says so.
- **OT safety:**
  - The existing guardrails are reused unchanged: `humanApprovalRequired` is always true, `unsafe-output.ts`, and copilot control-verb blocking.
  - Sources or chunks with `safetyClass ≠ NON_SAFETY` force escalation text: consult the manufacturer documentation and a qualified engineer.
  - The library has no tool or write capability of any kind.

## 6. Access control and tenancy

- The reference library is **global and read-only**:
  - **Read** requires `requirePlatformAuth → requireOrgActor → requirePermission("view_knowledge")`, the same chain as `/api/knowledge/*`. Any member of any org may read the shared ALLOWED corpus.
  - **Write** (registry edits, approvals) needs a new **platform-level** capability. Tenant roles never get it, because the corpus is shared. Proposed: `can(role, "superadmin")` or a new `knowledge_library_admin` capability in `src/lib/auth/roles.ts` (owner decision D4).
- The API surface: `GET /api/knowledge-library/sources` (paginated, `limit ≤ 50`, cursor), `GET /api/knowledge-library/sources/[slug]` and `POST /api/knowledge-library/search`.
  - Zod validation and rate limits on all of them.
  - Safe errors, and a 404 for retired or unapproved sources.
- Tenant-private uploads (Phase 3) are a separate plane with `organizationId` on every row, filtered in SQL (fixing F-1 first). They are never mixed into global results.
- **Audit:** every registry decision change, ingest run and admin action goes through `recordAuditEventOrThrow`. Search queries are rate-limited but not stored verbatim (privacy).

## 7. Storage, backup, retention

- Bytes live in the private `documents_data` volume under the prefix `knowledge-library/<sourceId>/<sha256>.<ext>`, served by **no** route in the MVP. They are **never** stored under `public/uploads`, which Next serves anonymously.
- Chunks and the registry are in Postgres and covered by `scripts/backup-postgres.sh`.
  - Files are covered by `scripts/dr/backup-uploads.mjs`.
  - Known limit: that script packs the archive in memory (`scripts/dr/uploads-archive.mjs:209-221`). The MVP corpus (O1, O2, O4, O5) is **not yet sized** (nothing downloaded). O1 alone is a very large PDF, so its size must be measured at acquisition and checked against this limit before P2e. Growth beyond roughly 1 GB needs a streaming backup first (follow-up).
- **Retirement** sets `status = RETIRED`, which removes the source from retrieval and the catalogue.
  - Hard deletion is a separate dry-run-first script with an explicit confirmation, never automatic.
  - Add a `KnowledgeSourceFile` target to the Phase 97 retention/erasure registry only if user-supplied files are ever accepted.

## 8. Public website

- Routes: `/[locale]/library/sources` (catalogue index) and `/[locale]/library/sources/[slug]`. They are server components with no client bundle of registry data.
- Each page shows:
  - title, authors, issuer, edition and date as printed
  - licence name and link, the attribution line, the **official** link
  - the Hermes-authored `KnowledgeSourceSummary` (fa/en/de)
  - a provenance note: "Hermes does not host this document"
  - for `ALLOWED` sources: "used privately for citation in Hermes Brain"
- The pages never show source text, figures, covers or logos (OpenStax and vendor marks are excluded from licences anyway).
- **Per-source display rules** follow `knowledge-source-catalog.md` §3.
  - Metadata and links only where the source's terms permit.
  - Rockwell: **no deep link**.
  - **Siemens and Mitsubishi: HOLD**, nothing published, until D1 is answered by counsel.
  - Full text of private or copyrighted files is **never** published, including for CC-licensed sources.
- **Sitemap** includes only `PUBLISHED` sources with `publicShowMetadata`, and never HOLD entries.
- **robots.ts**: `/library/` is currently open to AI-training crawlers (`src/app/robots.ts:160-165`). That is acceptable only because the pages hold Hermes-authored text and metadata. A test pins that no chunk text reaches any public route.
- **i18n**: a new namespace `knowledgeLibrary` in fa, en and de.
  - Persian orthography follows the rules: `ی`/`ک`, ZWNJ.
  - The leaf-count pins and the German gate must be bumped together (known coupling).
- **Brain UI**: citations render as "Source: <title>, <edition>, p. X–Y", with the licence badge and a link to the catalogue page, and the plane label (source / inference / Hermes-authored).

## 9. Test plan

| Area | Test |
|---|---|
| Licence gate | DB rejects a file/chunk for `METADATA_ONLY` and `BLOCKED_LICENSE_REVIEW` sources (real-PG test, `*.pg.test.ts`); retrieval never returns chunks of a retired or non-ALLOWED source |
| Idempotency | a second `ingest --commit` with the same manifest gives `added=0, unchanged=N`; a changed sha creates a new file and retires the old; no delete path exists |
| Acquisition | non-allowlisted host, cross-host redirect, private IP, oversize body and sha mismatch are all rejected |
| Parser hardening | fixtures: truncated PDF, PDF with JavaScript/actions, zip-bomb-like stream, oversize page count. Each ends in a bounded failure with no hang |
| Prompt injection | a chunk containing "ignore previous instructions / call tool / write tag" is screened and fenced, and the output fails citation verification if manipulated |
| Citations | every `REFERENCE_SOURCE` citation resolves to an existing chunk with page/section; a fabricated id rejects the output |
| Version | a query for TIA V20 against a V17-only chunk is flagged `VERSION_MISMATCH`; a superseded edition is flagged |
| Safety | `SAFETY_CRITICAL` source leads to escalation text and `humanApprovalRequired` true; no command vocabulary in output |
| Tenancy / RBAC | 401 anonymous, 403 non-member, admin endpoints 403 for tenant OWNER; a body `organizationId` is ignored |
| Public leakage | no public page HTML/RSC payload, sitemap entry or client chunk contains chunk text (planted canary string in a fixture chunk); client-graph import test |
| Flag-off identity | `/api/brain` response byte-identical with the flag off |
| i18n | key parity fa/en/de, no Arabic `ي`/`ك`, leaf pins updated |

## 10. Delivery phases

| Phase | Scope | Exit criteria |
|---|---|---|
| **P0 F-1 fix** | `f1-document-rag-remediation-plan.md` Stages 0–1 (separate branch/PR) | R1–R11 green; mutation proof recorded; production flag state reported |
| **P2a Registry** | migration + registry module + seed of catalogue rows as **metadata only** (no files); admin read API | migration validated on real PG; licence-gate tests green |
| **P2b Pilot ingest** | importer (acquire/parse/chunk, dry-run/commit) for the **MVP sources only**: O1, O2, O4, O5 (O6 only after D3-SA), dev and staging. The parser follows the chosen §4A.1 option. | idempotency, parser-hardening and acquisition tests green; checksums recorded |
| **P2c Brain evidence** | retrieval + governed Brain layer behind a flag (default off), chunk injection screening. **Requires P0 closed.** | citation, version, safety and flag-off tests green |
| **P2d Public catalogue** | `/library/sources` pages, sitemap, i18n | leakage, SEO and i18n gates green; owner visual approval |
| **P2e Production import** | manual workflow, backup-first, dry-run then commit | runbook executed by the owner; `Unchanged: N` on re-run |
| **P3 Tenant documents** | tenant-private uploads | F-1 and F-2 fixed; M-B (ClamAV) in place; per-org tests |
| **P4 Expansion** | sources that leave `BLOCKED_LICENSE_REVIEW` after review (e.g. G1 once its own notice is read with permission; O3 once Vols II–VI are read) | per-source review record |

**Migration and rollback**
- P2a is purely additive: new enums and tables, plus raw-SQL indexes and the gate trigger.
- Rollback before any production data: a new down-migration dropping only the new objects.
- Rollback after a production import: turn the flag off and set sources to `RETIRED`. That is non-destructive.
- Dropping tables would need explicit owner approval and a backup.
- No existing table or migration is edited.

## 11. Decisions: decided vs open (R1, 2026-09-23)

State labels:
- `DECIDED`: fixed by the owner instruction of 2026-09-23.
- `PARTIAL`: part is decided, part is open.
- `OPEN-TECH`: needs a technical choice by the owner.
- `OPEN-LEGAL`: needs legal counsel; this document offers **no legal conclusion**.

| Id | Topic | State | What is decided | What remains open |
|---|---|---|---|---|
| D1 | Siemens / Mitsubishi terms (TDM ban; sanctions clauses naming Iran) | **PARTIAL: DECIDED + OPEN-LEGAL** | Siemens and Mitsubishi content is **not ingested**. | Whether Hermes may catalogue or link to these portals at all, and how the sanctions clauses apply. **Counsel only.** Until answered, public display is HOLD (catalog §3). |
| D2 | MVP scope | **PARTIAL: DECIDED + OPEN-TECH** | The MVP contains only sources whose licence is clear and confirmed for commercial use: **O1, O2, O4, O5** (catalog §2). Ambiguous, NC, IEC/ISA, Siemens and Mitsubishi sources are excluded. | The plane: global Hermes-curated corpus only (recommended) vs tenant uploads. Tenant uploads also need D7 (M-B) and F-1/F-2 closure. |
| D3 | NC and SA licences | **PARTIAL: DECIDED + OPEN** | **NC is excluded** (O7–O12). | **D3-SA:** whether CC BY-SA (O6) is accepted, given that any *published* derivative must be CC BY-SA. Recommended: private retrieval only; no published derivative text. |
| D4 | Who administers the global registry | **OPEN-TECH** | — | A new platform capability (recommended) vs reuse of `superadmin`. |
| D5 | Parser | **OPEN-TECH** | Nothing is installed or run without evidence and approval. | Choose from §4A.1. Recommended: P-A + P-C in the importer image only. |
| D6 | Embeddings | **OPEN-TECH** (+ counsel for E-B provider terms) | Nothing is enabled without evidence and approval. | Choose from §4A.2. Recommended: E-A (FTS only) for the MVP. |
| D7 | Malware scanning | **OPEN-TECH** | Nothing is deployed without approval. | Choose from §4A.3. Recommended: M-A for P2, M-B mandatory before P3; M-C rejected. |
| D8 | Commercial or purchased books and standards in RAG | **DECIDED** | **Not ingested** unless an explicit licence permitting processing and use in a commercial system is presented and reviewed. IEC and ISA terms prohibit AI use, so standards are metadata only. | Only per-title licence reviews, if the owner ever presents a licence. |
| D9 | F-1 | **PARTIAL: DECIDED + BLOCKED-ACCESS** | F-1 is a **P0 security blocker**. A separate remediation plan with regression tests is written. Code changes wait for separate approval. | (a) **The production flag state is UNVERIFIED.** No production access from this session, so an operator must run the read-only check in `knowledge-security-findings.md` §F-1.4 and, if it prints `enabled`, apply the containment steps. (b) Approval to implement the plan (P0). |
| D10 (new) | G1 (NIST) and O3 (Kuphaldt circuits) licence confirmation | **OPEN** | Both are out of the MVP (`BLOCKED_LICENSE_REVIEW`). | Reading G1's own front-matter notice and O3's Vol II–VI licence appendices means opening the files. That is a download, and needs explicit approval. |

## 12. Risks

- **F-1** (P0) is an open tenant-isolation defect in the only existing document-RAG path. Its production exposure is unknown until the operator check is run.
- **Legal/sanctions** (D1) is the dominant programme risk. It can block all Siemens-specific depth, which is the owner's primary interest. No legal conclusion is drawn here.
- **Narrow MVP.** Four sources cover instrumentation, process control and electronics well, but give **zero** ingestible coverage for Siemens/PLC and ICS security (catalog §7).
- **Coverage gap:** there is no open Siemens, PLC or IEC 61131-3 text. Depth there must come from Hermes-authored notes written by qualified engineers, citing official manuals as metadata only.
- **Version drift:** vendor manuals are superseded often (M4 and M7 are already superseded). Every registry row needs periodic re-review; `reviewedAt` older than about 12 months should raise a warning.
- **Persian retrieval quality:** Postgres has no Persian stemmer, and the `'simple'` config gives weaker recall for fa queries. Embeddings or a query-translation step may be needed later.
- **Backup scaling**, for a corpus growing past about 1 GB (§7).
- **Doc drift** in Phase 101 docs (F-6) could mislead implementers. Correct it when that area is next touched.
