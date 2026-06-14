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
- Industrial telemetry **simulated**. Copilot will use a **real LLM** (Step 4).
- next-intl, locale-prefixed routes `/fa` and `/en`, RTL/LTR per locale.

## Phase 2 extraction targets (FastAPI / Python)
Each maps to one or more service interfaces, swapped behind the same contract:
- **AI Gateway** ← `ai-gateway.ts`
- **OPC UA Gateway**, **Modbus TCP Gateway**, **MQTT Gateway** ← `industrial-connectors.ts`
- **Historian** + **Industrial telemetry engine** ← `telemetry-service.ts`
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
3. Dashboard + simulated telemetry
4. Copilot UI + real LLM backend route
5. Knowledge library
6. Polish
