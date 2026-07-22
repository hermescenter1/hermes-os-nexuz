// PHASE 94B4 — the single place Phase 94 services are wired together.
//
// WHY ONE COMPOSITION MODULE
// A route that builds its own service can silently omit a dependency — an audit
// port, the approved secret provider — and still compile. Constructing them
// here once means a route cannot obtain a half-wired service: it asks for the
// bundle or it gets nothing.
//
// Routes never import Prisma, repositories or adapters. They import from here.

import { getPrisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import {
  createGatewayAuthLookup,
  createOtRepositories,
  createTransactionManager,
  type OtPrismaClient,
  type OtTransactionalPrismaClient,
} from "../persistence/prisma-adapters";
import { envSecretProvider } from "../envelope-signature";
import { loggerMetricSink } from "../metrics";
import { createAuditPort } from "../services/core";
import { createImportService, type EngineeringImportService } from "../services/import-service";
import { createAnalysisService, type EngineeringAnalysisService } from "../services/analysis-service";
import { createFindingService, type EngineeringFindingService } from "../services/finding-service";
import { createGatewayEnvelopeService, type GatewayEnvelopeService } from "../services/gateway-service";
import type { OtRepositories } from "../persistence/ports";
import type { GatewayAuthLookup } from "../machine-context";
import type { SecretProvider } from "../envelope-signature";

export interface OtServices {
  repos: OtRepositories;
  imports: EngineeringImportService;
  analysis: EngineeringAnalysisService;
  findings: EngineeringFindingService;
  gateway: GatewayEnvelopeService;
  /**
   * PHASE 94B4.1 — everything the envelope route needs to authenticate a
   * machine. Grouped so a route cannot construct half of it: a route that
   * forgot the secret provider, or substituted its own, would otherwise still
   * compile and would verify nothing.
   */
  machineAuth: {
    lookup: GatewayAuthLookup;
    secrets: SecretProvider;
    simulatorAllowed: boolean;
  };
}

/**
 * Test seam.
 *
 * A test may install doubles so HTTP behaviour can be exercised without a
 * database. Production never calls this; `resolveOtServices` falls back to the
 * real wiring whenever no override is installed.
 */
let override: OtServices | null = null;

export function __setOtServicesForTests(services: OtServices | null): void {
  override = services;
}

/**
 * Build (or reuse) the service bundle.
 *
 * Returns null when the database is unavailable — the platform degrades to
 * session storage in that mode, and an OT route has nothing to serve. The
 * caller maps that to a safe 503 rather than throwing.
 */
export async function resolveOtServices(): Promise<OtServices | null> {
  if (override) return override;

  const db = (await getPrisma()) as unknown as OtTransactionalPrismaClient | null;
  if (!db) return null;

  const repos = createOtRepositories(db as OtPrismaClient);
  const audit = createAuditPort(recordAuditEvent);
  const metrics = loggerMetricSink;

  return {
    repos,
    imports: createImportService({
      imports: repos.imports,
      projects: repos.projects,
      tx: createTransactionManager(db),
      audit,
      metrics,
    }),
    analysis: createAnalysisService({
      projects: repos.projects,
      findings: repos.findings,
      audit,
      metrics,
    }),
    findings: createFindingService({ findings: repos.findings, audit, metrics }),
    gateway: createGatewayEnvelopeService({ nonces: repos.nonces, audit, metrics }),
    machineAuth: {
      lookup: createGatewayAuthLookup(db as OtPrismaClient),
      // Only the server-approved reference map. A route never sees a secret.
      secrets: envSecretProvider,
      // Simulator envelopes stay off unless explicitly enabled for the env.
      simulatorAllowed: process.env.OT_SIMULATOR_ENABLED === "1",
    },
  };
}
