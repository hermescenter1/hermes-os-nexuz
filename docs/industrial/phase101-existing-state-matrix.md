# Phase 101 — Existing-State Matrix (LOOP 0)

Produced before any file was modified, from a read-only sweep of the Phase 101
worktree at base `cbfa292`. Classification vocabulary is the one the phase brief
requires: `EXISTING` / `PARTIAL` / `MISSING` / `REUSE` / `EXTEND`.

> The purpose of this matrix is to prevent Phase 101 from rebuilding
> architecture that already exists. Everything marked `REUSE` is consumed
> as-is; everything marked `EXTEND` is added to without changing its
> current behaviour.

## 1. Brain / reasoning

| Capability | Where | State | Phase 101 disposition |
|---|---|---|---|
| Industrial fault analyzer (deterministic, bilingual, 1719 LOC) | `src/lib/industrial-brain/analyzer.ts` | EXISTING | **REUSE** — becomes the *baseline* arm of the before/after benchmark. Not modified. |
| Analyzer output contract (classification, signal matrix, reasoning map, uncertainty, risk, likely causes, evidence gaps) | `src/lib/industrial-brain/types.ts` | EXISTING | **REUSE** — Phase 101 reasoning output is a strict superset in spirit; no edits to this file. |
| Analyze request contract + hardened route (rate limit, media type, bounded body) | `src/lib/industrial-brain/request-contract.ts`, `src/app/api/industrial-brain/analyze/route.ts` | EXISTING | **REUSE** — the security pattern is copied for the new Phase 101 route. |
| Keyword rule reasoning engine (14 rules, AND-of-ORs) | `src/lib/industrial/reasoning.ts` | EXISTING | **REUSE** — untouched. Phase 101 adds a *structural* engine beside it, not instead of it. |
| Cause ranking / cause catalog / root cause / confidence | `src/lib/industrial/cause-ranking.ts`, `cause-catalog.ts`, `root-cause.ts`, `confidence.ts` | EXISTING | **REUSE** — the confidence banding vocabulary is mirrored, the modules are not edited. |
| Engineering case corpus (JSON, bilingual, keyword-matched) | `src/lib/industrial/knowledge-data/cases.json`, `cases.ts` | EXISTING | **REUSE** — Phase 101 corpus is a *separate*, structurally-typed corpus; the case DB stays authoritative for narrative cases. |
| Hybrid retrieval (score → rank → confidence band) | `src/lib/retrieval/*` | EXISTING | **REUSE** as the model for scoring transparency (`ScoreBreakdown`). Phase 101 retrieval is graph-structured, not keyword-scored. |
| RAG pipeline, pgvector store, embedding providers | `src/lib/rag/*` | EXISTING | **REUSE (not invoked)** — Phase 101 deliberately performs **no** embedding or provider call in deterministic paths. |
| AI governance (provider policy, injection screen, citation verifier, RAG provenance, unsafe-output block, execution trace) | `src/lib/ai-governance/*` | EXISTING | **REUSE** — the unsafe-output and provenance vocabulary constrain Phase 101 output; the offline eval harness is the model for the Phase 101 benchmark. |
| Deterministic offline eval harness | `src/lib/ai-governance/evaluation/harness.ts` | EXISTING | **REUSE** — pattern for `benchmark.ts` (identifiers and counts only, never fixture content). |

## 2. Engineering-artefact ingestion (Phase 94 OT Edge)

| Capability | Where | State | Phase 101 disposition |
|---|---|---|---|
| Canonical import envelope v1.0 (`.strict()` Zod, bounded, canonicalised, SHA-256 checksum) | `src/lib/ot-edge/import-envelope.ts` | EXISTING | **REUSE** — Phase 101 emits this envelope by projection. Its enums (`SAFETY_CLASSES`, `NETWORK_ZONES`, `DEVICE_CATEGORIES`, `PROTOCOLS`, `KNOWN_DATA_TYPES`) are imported, never re-declared. |
| `EngineeringImport` → `EngineeringProject` → `AutomationTag` / `AlarmDefinition` / `IndustrialNetworkNode` → `EngineeringFinding` | `prisma/schema.prisma` | EXISTING | **REUSE** — Phase 101 adds **no migration**. The reference corpus projects onto this exact shape. |
| Deterministic analysis rules (`OT-*`, advisory only, `humanApprovalRequired`) | `src/lib/ot-edge/analysis-rules.ts` | EXISTING | **REUSE** — Phase 101 safe actions inherit the "advisory, never a remediation command" posture. |
| Branded trusted authorization scope | `src/lib/ot-edge/service-context.ts` (`OtServiceContext`) | EXISTING | **REUSE** — the Phase 101 command-centre service accepts only this branded context. |
| Engineering import/project/finding HTTP surface | `src/app/api/engineering/**` | EXISTING | **REUSE** — authz pattern copied; routes not modified. |

### Gaps in the ingestion model that Phase 101 must fill

| Concept required by the phase brief | State today | Phase 101 disposition |
|---|---|---|
| PLC **block** (OB/FB/FC/DB/UDT) as a first-class object | MISSING | **NEW** (`PLC_BLOCK` node kind) |
| **I/O point** (channel, DI/DO/AI/AO) distinct from a tag | MISSING | **NEW** (`IO_POINT`) |
| **Equipment** (the driven machine) distinct from the controller device | PARTIAL (`IndustrialAsset` exists, but no engineering-artefact link) | **NEW** (`EQUIPMENT`), projected onto device metadata |
| **Sequence** / **state** / step transitions | MISSING | **NEW** (`SEQUENCE`, `STATE`) |
| **Permissive** and **interlock** as separate, addressable conditions | MISSING | **NEW** (`PERMISSIVE`, `INTERLOCK`) |
| **SCADA tag** distinct from the PLC tag it mirrors | PARTIAL (one flat `AutomationTag` space) | **NEW** (`SCADA_TAG`, `MIRRORS` relation) |
| **HMI screen / object / faceplate**, navigation hierarchy | MISSING | **NEW** (`HMI_SCREEN`, `HMI_OBJECT`) |
| **Historian / trend evidence source** | PARTIAL (`AssetHealthHistory`, `time-series/*` at runtime) | **NEW** (`EVIDENCE_SOURCE`) as an *engineering* declaration |
| **Fault mode** with declared observable signature | PARTIAL (`IndustrialFailureMode` DB model, unused by the brain) | **NEW** (`FAULT_MODE`) in the corpus |
| **Safe action** (verification, REVIEW_ONLY) | PARTIAL (`recommendation` on a finding) | **NEW** (`SAFE_ACTION`) with an explicit safety gate |
| **Recipe** / **KPI-OEE** engineering objects | MISSING | **NEW** (`RECIPE`, `KPI`) |
| Deterministic **fault scenario + ground truth** fixtures | MISSING | **NEW** (`FaultScenario`) |

## 3. Graph, digital twin, multi-site

| Capability | Where | State | Phase 101 disposition |
|---|---|---|---|
| Engineering knowledge graph (16 node types, 11 relation types, impact scoring) | `src/lib/eng-graph/*` | EXISTING | **REUSE (parallel)** — that graph is derived from *repository/runtime* data. Phase 101's graph is derived from *engineering artefacts*; they answer different questions, so neither is replaced. |
| Knowledge-graph builder / query / reasoning | `src/lib/knowledge-graph/*` | EXISTING | **REUSE (not modified)** |
| Digital twin nodes / relations / health | `src/lib/digital-twin/*` | EXISTING | **REUSE (not modified)** |
| Predictive, time-series, alarms, KPI/OEE runtime analytics | `src/lib/predictive/*`, `src/lib/time-series/*` | EXISTING | **REUSE** — Phase 101 declares *where* evidence would come from; it does not re-implement the analytics. |
| Site/tenant isolation helpers | `src/lib/org/context.ts`, `src/lib/site/context.ts`, `src/lib/org/rbac.ts`, `src/lib/site/rbac.ts` | EXISTING | **REUSE** — mandatory for every Phase 101 surface. |

## 4. What Phase 101 adds

| Loop | Deliverable | Location |
|---|---|---|
| 1 | Canonical provenance-bearing engineering model | `src/lib/industrial-knowledge/types.ts`, `provenance.ts`, `corpus.ts`, `graph.ts` |
| 2 | 5 TIA Portal reference systems | `src/lib/industrial-knowledge/reference/tia-0{1..5}-*.ts` |
| 3 | 5 enterprise SCADA reference systems | `src/lib/industrial-knowledge/reference/scada-0{1..5}-*.ts` |
| 4 | 5 advanced HMI reference systems | `src/lib/industrial-knowledge/reference/hmi-0{1..5}-*.ts` |
| 5 | Structured, provenance-preserving ingestion + retrieval | `src/lib/industrial-knowledge/retrieval.ts`, `envelope-projection.ts` |
| 6 | Structural diagnostic reasoning engine | `src/lib/industrial-knowledge/diagnostics.ts` |
| 7 | Fault injection fixtures + before/after benchmark | scenario data per system, `benchmark.ts` |
| 8 | Executive command centre | `src/lib/industrial-knowledge/command-center.ts`, API route, page |

**No Prisma migration.** **No change to any predecessor security or release gate.**
**No external provider call on any deterministic path.**

## 5. Safety posture inherited and enforced

`DIRECT_PLC_DOWNLOAD=False`, `LIVE_CONNECTION_MODE=READ_ONLY`, `EXPORT_FIRST=True`,
`ENGINEER_APPROVAL_REQUIRED=True`, `SIMULATION_BEFORE_DEPLOYMENT=True`,
`SIS_AND_SAFETY_PLC_SCOPE=REVIEW_ONLY`.

All 15 reference systems are **original synthetic engineering references** authored
for this repository. No customer, proprietary or licensed vendor project material is
included, and no file in this phase claims to be a real Siemens `.apXX` binary.
Producing a genuine TIA Portal / TIA Openness export requires licensed Windows
tooling that is not available in this environment — that is recorded honestly as an
**owner/tooling gate**, and the canonical structured representation is built instead.
