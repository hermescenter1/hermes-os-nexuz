# Hermes OS — V1 Enterprise Demo

Bilingual (Persian/English) industrial AI platform. Next.js 15 App Router + TypeScript.

## Run
```bash
npm install
npm run dev      # http://localhost:3000 -> redirects to /fa
npm run build    # production build
npm start        # serve the build
```

Routes: `/fa` (RTL, default) and `/en` (LTR).

## Status
Step 1 complete: scaffold + i18n + RTL/LTR foundation + service-interface seam.
Dashboard, copilot, and library are NOT implemented yet (see `docs/ARCHITECTURE.md`).

## Architecture seam
Frontend depends only on `src/lib/services/*`. V1 backs these with a Next.js
BFF + mock data; Phase 2 swaps in FastAPI microservices with no frontend change.
