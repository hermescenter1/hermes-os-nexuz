# Phase 101-R — Industrial Brain runtime ownership

Who actually serves what on the Industrial Brain surfaces, and which of those
runtimes consumes the Phase 101 reference corpus.

This document exists because the answer is genuinely non-obvious: two unrelated
engines are reachable from one public route, and a reader who assumes they are
one engine would draw a false conclusion about where an answer came from.

## Standing facts

```text
PHASE101_REFERENCE_RUNTIME=IMPLEMENTED
LEGACY_ANALYZER_REPLACED=NO
AUTHENTICATED_ADAPTER_CONSUMER=NONE
PLANT_CONNECTION=NONE
PLANT_WRITE=NONE
```

`LEGACY_ANALYZER_REPLACED=NO` is the load-bearing one. Phase 101-R **added** a
corpus-backed reference diagnostic; it did not replace, wrap, re-implement or
deprecate the existing free-text analyser, which continues to serve
`POST /api/industrial-brain/analyze` exactly as before.

## Ownership table

| Surface | Runtime owner | Data source | Phase 101 role | Live/Reference |
| ------- | ------------- | ----------- | -------------- | -------------- |
| `/[locale]/industrial-brain` (page shell, hero, capability cards) | `src/app/[locale]/industrial-brain/page.tsx` — Server Component | translation catalogue only | none | Reference |
| `/[locale]/industrial-brain` → fault-report workspace | `src/components/industrial-brain/IndustrialBrainWorkspace.tsx` — Client Component | user-typed fault report, posted to the analyze API | **none** — does not import the corpus | Reference (user-supplied input, deterministic output) |
| `/[locale]/industrial-brain` → reference diagnostic panel | `src/components/industrial-brain/ReferenceDiagnosticPanel.tsx` — Server Component | Phase 101 sealed corpus, via the bridge | **consumer** | Reference (curated sample) |
| `POST /api/industrial-brain/analyze` | `src/lib/industrial-brain/analyzer.ts` (`analyzeIndustrialFault`) | keyword/heuristic rules over the request body | **none** — untouched by Phase 101-R | Reference (no plant data) |
| `POST /api/industrial-brain/save-case` | route + Prisma | authenticated user's own case record | none | Reference |
| `src/lib/industrial-knowledge/runtime/bridge.ts` | server-only module | `src/lib/industrial-knowledge/` sealed corpus | **the one seam** | Reference |
| `src/lib/industrial-knowledge/runtime/exposure.ts` | server-only module | published allowlist over the corpus | exposure policy | Reference |
| `/[locale]/brain`, `POST /api/brain` | `src/lib/industrial/brain-core.ts` | industrial knowledge Q&A corpus | none — a **separate capability** | Reference |
| authenticated Industrial Brain adapter | *does not exist* | — | reserved | — |

## What the reference panel is, and is not

**Is.** A deterministic replay. The panel hands a curated scenario's recorded
observations to the Phase 101 structural engine, which walks the sealed
reference design and reports supporting evidence, contradicting evidence,
missing evidence, ranked hypotheses, escalation conditions and read-only
verification steps — every one of them cited back to a corpus node.

**Is not.**

- Not connected to any plant, PLC, SCADA server, HMI, OPC UA server or MQTT
  broker. It opens no socket at all.
- Not fed by telemetry, live or historical. The observations are authored
  engineering metadata inside the corpus.
- Not a replacement for `analyzeIndustrialFault`. The two answer different
  questions from different inputs and share no code.
- Not capable of issuing a command, a write, a setpoint or an acknowledgement.
  `SAFE_ACTION` nodes are instructions addressed to a qualified human being.
- Not an authenticated surface, and not tenant-scoped, because it reads no
  tenant data. Nothing on this path touches Prisma, the session or a site id.

## Exposure

The corpus holds **85** authored fault scenarios across ten reference systems.
**7** of them are published on the anonymous surface; the rest are withheld and
are not reachable, resolvable or nameable through the bridge.

The published set is an explicit allowlist in `runtime/exposure.ts`. The
withheld set is never enumerated in this document, in a test fixture, or in any
response — it is derived as a set difference wherever it is needed, so it cannot
drift away from the corpus and cannot be leaked by the very artefacts that
describe it.

A request only ever consults the **published** index. An unpublished scenario is
not resolved and then refused; it is never looked up, so there is no code path
on which its content exists in a variable. Every refusal — unknown id,
unpublished id, oversized string, repeated parameter, malformed grammar —
produces one indistinguishable fail-closed state, because a response that
distinguished them would let a caller read corpus membership off the status.

## Server boundary

`bridge.ts`, `exposure.ts` and `case-query.ts` are server-only. The canonical
`import "server-only"` marker is unavailable in this repository — the package is
not installed and is not a Next 15.5.23 dependency — so the guarantee is
enforced in two halves that need no dependency:

- a module-scope runtime guard (`runtime/server-boundary.ts`) that throws if the
  module is evaluated in a browser realm, and
- a transitive client-graph gate
  (`runtime/__tests__/phase101r-client-boundary.test.ts`) that walks every
  `"use client"` module under `src/` and fails on any path that can reach the
  bridge, the exposure map, the query parser or the raw corpus.

The private corpus is expected to be present in the server bundle
(`.next/server/**`); that is where it belongs. Its presence in `.next/static/**`,
in served HTML, in an RSC/Flight payload or in browser JavaScript would be a
defect, and `scripts/ci/phase101r-client-leakage-scan.mjs` fails the build if it
ever appears there.
