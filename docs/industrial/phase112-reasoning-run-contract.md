# Phase 112 — Reasoning Run Contract

**Status:** implemented, review-ready (uncommitted)
**Baseline:** `origin/main` @ `562f997246b74c790df1b6974438041abee46469`
**Schema version:** `1.0.0` (`REASONING_RUN_SCHEMA_VERSION`)

This document is the contract for a persisted, immutable **Reasoning Run**: what it
is, what it stores, how it is created, and the invariants that hold for its life.

---

## 1. What a Reasoning Run is (and is not)

A Reasoning Run is an **append-only, tenant-scoped, cryptographically verifiable
record of one persisted industrial reasoning execution**. It captures exactly what
input and evidence the engine saw, which engine/version produced the output, the
exact output, and digests that let anyone verify the stored artifacts have not
changed.

It is **not**:

- the public `/api/industrial-brain/analyze` endpoint — that stays **stateless**
  and anonymous and persists nothing;
- the legacy `AnalysisRecord` table — those rows are not runs, are never
  backfilled, and are not exact-replay capable;
- a certified safety determination — reasoning output is **decision support**.

## 2. Surfaces

| Method | Route | Permission | Purpose |
|---|---|---|---|
| POST | `/api/industrial-brain/runs` | `manage_industrial` | Create a run |
| GET  | `/api/industrial-brain/runs/[id]` | `view_industrial` | Read a run + verified artifacts |
| POST | `/api/industrial-brain/runs/[id]/replay` | `view_industrial` (ARCHIVAL) / `manage_industrial` (EXECUTION) | Replay |

All are authenticated with server-resolved tenant context; `organizationId`,
`userId`, `siteId`, `assetId` and role are **never** trusted from the client. All
responses are `Cache-Control: no-store`.

## 3. Create pipeline (`createReasoningRun`)

1. Resolve the exact registered engine from the version registry — **fail closed**
   (`ENGINE_UNAVAILABLE`) if the id/version is not registered.
2. Freeze the **engine manifest** (identity + all version/checksum fields) *before*
   execution.
3. Normalize + canonicalize the input (`engine.normalize`, then sanitize to
   canonicalizable JSON).
4. Execute the deterministic engine **once**. No I/O, no side effects.
5. Derive bounded, **allowlisted** artifacts from trusted server output.
6. Compute each artifact digest and the manifest digest.
7. Persist the run + artifacts **atomically** in one transaction.
8. Idempotency: INSERT under `UNIQUE(organizationId, idempotencyKey)` is the lock.
   A retried identical request returns the **same** run (`IDEMPOTENT_REPLAY`);
   the same key with a different request fingerprint is rejected
   (`KEY_FINGERPRINT_MISMATCH`, HTTP 409).

The client supplies **only** raw input + a mandatory idempotency key — never an
output snapshot, a precomputed digest, or org/user/site ownership.

## 4. Stored fields (`ReasoningRun`)

Identity/scope: `id`, `organizationId`, `siteId?`, `assetId?`, `initiatedByUserId?`
(loose reference — no FK, so a governed user erasure never has to edit an immutable
row), `sourceChannel`, `status`.

Engine manifest: `engineId`, `engineVersion`, `rulePackVersion`,
`caseCorpusVersion?`, `caseCorpusChecksum?`, `graphRevision?`, `graphChecksum?`,
`documentCorpusChecksum?`, `modelProvider?`, `modelVersion?`, `modelConfigVersion?`,
`schemaVersion`.

Idempotency/lineage: `idempotencyKey`, `requestFingerprint`, `parentRunId?`.

Timing/digests: `startedAt`, `completedAt?`, `inputDigest`, `outputDigest`,
`manifestDigest`, `errorClass?`.

> Missing versions are **never** defaulted to `latest`/`current`/`unknown`. The
> deterministic Industrial Brain consults no case corpus, graph, document corpus,
> model or provider, so those fields are explicit `null` (not-applicable).

## 5. Artifacts (`ReasoningRunArtifact`)

Immutable typed snapshots, at most one of each kind per run
(`UNIQUE(organizationId, runId, kind)`). Every artifact carries a canonical JSON
`payload`, its lowercase-SHA-256 `digest`, and a positive `byteSize`.

Kinds created on every run: `RAW_INPUT`, `NORMALIZED_INPUT`, `EVIDENCE`,
`ENGINE_MANIFEST`, `ANALYSIS_OUTPUT`, `REASONING_MAP`, `UNCERTAINTY`, `SAFE_ACTION`.
`HUMAN_DECISION` is reserved for a trusted server workflow and is **never** created
by the create route.

- `RAW_INPUT` is rebuilt by **allowlist** from the known request fields only, so a
  client cannot smuggle extra keys, a fake output, or a secret into the ledger.
- `ANALYSIS_OUTPUT` is the **semantic** output — non-semantic runtime metadata
  (`processingMs`) is excluded, so the ledger is fully deterministic and the
  recorded `outputDigest` equals this artifact's digest.

## 6. Invariants (enforced, not merely documented)

- **Immutable content while retained:** DB `BEFORE UPDATE` triggers reject every
  UPDATE on `ReasoningRun`, `ReasoningRunArtifact`, `ReasoningReplayAttempt`; the
  application repository exposes create/read only (no update/upsert/delete).
- **Deletable under a governed path:** rows remain deletable (org/tenant cascade,
  and a future retention/privacy executor) so lawful retention deletion is
  possible — no blanket "no DELETE" rule.
- **Tenant isolation at the query level:** reads filter by `(organizationId, id)`;
  foreign/missing ids are a uniform 404; site/asset-bound runs additionally require
  site access.
- **Digest formats:** `CHECK` constraints enforce lowercase SHA-256 hex on every
  digest column and `byteSize > 0`; a `CHECK` enforces terminal-state consistency.
- **Idempotency + fingerprint:** `UNIQUE(organizationId, idempotencyKey)` +
  `requestFingerprint` comparison.
- **Replay never mutates the original** and appends a separate immutable record.

## 7. Source channels & status

`sourceChannel ∈ {INTERACTIVE, TELEMETRY, ALARM, EVIDENCE_UPDATE, REPLAY}`. The
HTTP create route always records `INTERACTIVE`; other channels are reserved for
future server-internal callers.

`status ∈ {PENDING, RUNNING, COMPLETED, FAILED}`. The current synchronous service
persists only terminal `COMPLETED` runs (engine execution errors are surfaced to
the caller and **no** row is written); `FAILED`/`PENDING`/`RUNNING` are reserved
for a future asynchronous flow.
