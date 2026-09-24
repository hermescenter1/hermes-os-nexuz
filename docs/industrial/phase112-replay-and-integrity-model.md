# Phase 112 — Replay & Integrity Model

**Status:** implemented, review-ready (uncommitted)
**Canonical profile:** `hermes-canonical-json/1.0.0` (`CANONICAL_PROFILE_VERSION`)

This document defines the canonical JSON profile, the digest scheme, and the two
distinct replay modes. The distinction below is load-bearing and must never be
blurred.

---

## 1. Archival replay vs. execution replay

```text
ARCHIVAL REPLAY
= retrieve the immutable historical snapshots and VERIFY their hashes.
  No engine execution. No external side effect.

EXECUTION REPLAY
= verify integrity first, resolve the EXACT registered engine version, re-run the
  FROZEN normalized input, and compare the canonical semantic-output digest with
  the original. Refused (ENGINE_VERSION_UNAVAILABLE) when the historical engine is
  not registered.
```

Archival retrieval is **never** called an execution replay. Deterministic
equivalence is **never** claimed when the historical engine version is
unavailable — that case returns `ENGINE_VERSION_UNAVAILABLE`.

## 2. Canonical JSON profile (Hermes profile, not RFC 8785)

Implemented standalone in `src/lib/reasoning-runs/canonical-json.ts` (independent
of `tia-companion/canonical.ts` — see the validation report for the duplication
note and consolidation path). The profile:

- recursive lexicographic object-key ordering by **Unicode code point**;
- array order preserved;
- strings, booleans, `null`, and **finite** numbers only (`-0` → `0`,
  locale-independent numeric formatting via the standard JSON projection);
- **rejects** `undefined`, `NaN`, `±Infinity`, `BigInt`, functions, symbols,
  sparse array holes, cyclic objects, and any non-plain object (Date/Map/Set/RegExp
  /class instances) — nothing is coerced silently;
- UTF-8 SHA-256, lowercase hex.

This is a **documented Hermes profile**. It is *not* claimed to be RFC 8785
compliant.

## 3. Digest scheme

- **Artifact digest** = SHA-256 over the canonical bytes of the artifact payload.
  Verifiable from stored bytes alone (engine-agnostic).
- **`inputDigest`** = digest of the `NORMALIZED_INPUT` artifact.
- **`outputDigest`** = digest of the `ANALYSIS_OUTPUT` artifact, which is the
  **semantic** output. Non-semantic runtime metadata (`processingMs`) is excluded
  by the engine's documented `semanticProjection`, so:
  - the ledger is deterministic (identical semantic input ⇒ identical digest);
  - `outputDigest` is verifiable from stored bytes;
  - an execution replay compares against it without any false mismatch on
    wall-clock time.
- **`manifestDigest`** = SHA-256 that binds `{profile, manifest fields,
  inputDigest, outputDigest, sorted[{kind, artifactDigest}]}`. Changing any
  artifact, any declared version, the input digest, or the output digest changes
  the manifest digest.

### What is and is not in the semantic output hash

Included: everything the analysis *means* — classification, alarms, signal matrix,
reasoning map, uncertainty, risk, likely causes, checklist, recommended actions,
related knowledge, confidence, and the analyzer's constant `engineVersion` literal.

Excluded: `processingMs` (wall-clock elapsed time — non-semantic runtime metadata).

## 4. Engine version registry

`src/lib/reasoning-runs/engine-registry.ts` is a **static, in-process** map from
`(engineId, engineVersion)` to a concrete engine instance. It:

- **fails closed** — an unregistered id/version resolves to `null`;
- performs **no** dynamic import from caller-controlled text and **no** remote code
  loading;
- lets future versions coexist without rewriting old records.

Current registered engine: `hermes-industrial-brain@1.0.0`
(rule pack `industrial-brain-rules/1.0.0`). `ENGINE_VERSION` must be bumped when the
analyzer's semantics change; an old, unbumped, or unknown version returns
`ENGINE_VERSION_UNAVAILABLE` on execution replay rather than a misleading result.

## 5. Integrity verification (`verifyRunIntegrity`)

Pure; no DB or engine calls. Detects and reports every issue:

| Issue | Meaning |
|---|---|
| `ARTIFACT_DIGEST_MISMATCH` | a stored artifact payload no longer hashes to its digest |
| `ARTIFACT_BYTESIZE_MISMATCH` | a stored artifact's byte size no longer matches |
| `MISSING_ARTIFACT` | a required artifact kind is absent |
| `INPUT_DIGEST_MISMATCH` | `NORMALIZED_INPUT` digest ≠ `run.inputDigest` |
| `OUTPUT_DIGEST_MISMATCH` | `ANALYSIS_OUTPUT` digest ≠ `run.outputDigest` |
| `MANIFEST_SNAPSHOT_MISMATCH` | stored `ENGINE_MANIFEST` ≠ the run's manifest fields |
| `MANIFEST_DIGEST_MISMATCH` | recomputed manifest digest ≠ `run.manifestDigest` |

A read (`GET`) verifies integrity before returning a replay-capable result and
returns a clear integrity error (HTTP 409) otherwise. A replay verifies integrity
**before** any engine execution.

## 6. Replay outcomes (`ReasoningReplayAttempt`)

| Outcome | When |
|---|---|
| `ARCHIVAL_VERIFIED` | archival replay, integrity OK — snapshots returned |
| `MATCH` | execution replay, fresh semantic digest == original |
| `MISMATCH` | execution replay, fresh semantic digest != original (bounded, non-sensitive summary; no plant data echoed) |
| `ENGINE_VERSION_UNAVAILABLE` | execution replay, engine version not registered — executable replay refused |
| `INTEGRITY_FAILURE` | integrity failed before any execution |

Every replay appends a **separate** immutable `ReasoningReplayAttempt` row and
**never** mutates the original run, its artifacts, or its digests. Execution replay
runs only the pure analysis engine — it triggers no OT action, work order,
notification, automation, CMMS, gateway or external side effect, and no
recommendation is ever acted upon.

## 7. Retention / deletion boundary

"Immutable" means append-only and non-editable **while retained**. DB triggers
reject UPDATE; DELETE is intentionally permitted so a governed retention/privacy
path (and ordinary org/tenant cascades) can erase runs. The application repository
never issues deletes on its own. Wiring reasoning runs into the existing
`RetentionPolicy`/`LegalHold`/`DataDeletionRequest` governance is defined follow-up
work (see the validation report).
