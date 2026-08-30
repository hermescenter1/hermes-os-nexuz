# Hermes OS — Architecture

## Boundary principle
The frontend depends only on the **service-interface layer** in
`src/lib/services/`. It never imports a route handler or a data source
directly. This is the seam that lets V1 (Next.js BFF + mock data) become
Phase 2 (FastAPI microservices) without touching the frontend.

```
Frontend (App Router pages/components)
        │  imports types + functions only
        ▼
src/lib/services/*  ── interface layer (stable contract)
        │  V1: calls Next.js API routes (BFF)
        ▼
src/app/api/*       ── BFF: mock data + real LLM proxy
        ┊  Phase 2: re-point service impls at ↓
        ▼
FastAPI microservices (separate repos/containers)
```

## V1 (current)
- Next.js 15 App Router + TypeScript, BFF via `src/app/api/*`.
- Industrial telemetry on the Executive Dashboard is **simulated**, and says so
  on screen. Copilot will use a **real LLM** (Step 4).
- next-intl, locale-prefixed routes `/fa` and `/en`, RTL/LTR per locale.

### Dashboard data source (Phase 109-B0)
The anonymous `/api/telemetry` route is **retired**. It served plant-shaped
values (OEE, alarms, PLC scan times, SCADA latency) over an unauthenticated
endpoint with no tenant, no site, no source identity, no acquisition semantics
and no provenance, so a caller could not tell what the numbers were. It was
removed rather than authenticated in place, and **nothing replaced it** — there
is no demo endpoint, no metrics endpoint and no client-selected mode parameter.

The Executive Dashboard keeps its demonstration through an **isolated local
presentation adapter** (`src/lib/dashboard-demo`): it performs no HTTP or
network request, imports no gateway, socket, protocol or database client, and
exposes no route. The mode is resolved on the **server** as an immutable
descriptor and is never inferred from an absent real source. Every frame carries
its own classification, connection mode, scope, source identity, acquisition
time, receipt time, quality and provenance, and the client refuses to render
operational values when that envelope is missing or invalid.

Two axes are kept distinct and neither contains `LIVE_CONTROL`:

| Axis | Values |
| --- | --- |
| Record classification | `REAL` · `SIMULATED` · `REPLAYED` · `IMPORTED` |
| Connection mode | `SIMULATED` · `LIVE_READ_ONLY` · `HISTORICAL_REPLAY` |

Telemetry `IMPORTED` means historical or measurement data ingested from a
historian, a file or a source export. It is unrelated to `EngineeringImport`,
which is an engineering project export.

**No live Historian, gateway, PLC, OPC UA, Modbus, MQTT or factory connection is
shipped.** Authenticated ingestion, tenant/site scoping and persistence remain
future work and are not implemented anywhere in this repository.

## Future extraction targets (FastAPI / Python) — NOT SHIPPED
None of the following exists in this product today. They are candidate future
services, listed so the seam they would attach to is documented:
- **AI Gateway** ← `ai-gateway.ts`
- **OPC UA Gateway**, **Modbus TCP Gateway**, **MQTT Gateway** ← `industrial-connectors.ts`
- **Historian** + **industrial telemetry ingestion** ← would attach to the
  provenance contract in `src/lib/dashboard-demo/contract.ts`. There is no
  telemetry service interface any more; `telemetry-service.ts` was retired in
  Phase 109-B0.
- **Authentication** ← `auth-service.ts`
- **Audit logs** ← cross-cutting; new `audit-service.ts` interface when needed

## Future infrastructure (not in V1)
- **PostgreSQL** — historian long-term store, users, audit, library content.
- **Redis** — cache + pub/sub fan-out for live telemetry, rate limiting.
- **WebSocket** — push live telemetry/alarms to dashboard (V1 may poll first).
- **Docker Compose** — local orchestration of web + FastAPI services + PG + Redis + broker.
- **On-premise deployment** — air-gapped factory installs; all services
  containerized, no hard dependency on external cloud except optional LLM egress
  (which can be swapped for a self-hosted model behind the AI Gateway).

## Build order (each step keeps the app runnable)
1. ✅ Scaffold + i18n + RTL foundation
2. Layout shell + navigation + service pages
3. Dashboard + simulated telemetry (local demo adapter; no endpoint)
4. Copilot UI + real LLM backend route
5. Knowledge library
6. Polish
