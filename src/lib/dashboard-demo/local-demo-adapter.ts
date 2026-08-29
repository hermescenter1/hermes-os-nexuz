/**
 * PHASE 109-B0 — isolated local demo adapter for the Executive Dashboard.
 *
 * ISOLATION IS THE POINT. This module:
 *   · performs no HTTP request and no network request of any kind;
 *   · imports no gateway, socket, protocol, broker or database client;
 *   · exposes no route — nothing under src/app may import it;
 *   · cannot be selected as a fallback for a live source, because there is no
 *     live source in this code path to fall back FROM;
 *   · has no client-controlled live/demo toggle and no query-parameter mode
 *     selector;
 *   · never claims to reconnect to a plant;
 *   · never borrows a real customer, tenant, site, gateway or factory identity.
 *
 * The mathematics is the pre-existing deterministic simulator in
 * `src/lib/industrial/simulator.ts` — smooth functions of wall-clock time. What
 * changes in B0 is not the numbers but the ENVELOPE around them: every frame
 * now states its own classification, connection mode, source, scope,
 * acquisition time, receipt time, quality and provenance, and the dashboard
 * refuses to render operational values when that envelope is absent or invalid.
 *
 * The mode is not derived from the absence of a real source. It is written
 * here, literally and unconditionally, as SIMULATED.
 */

import { simulateSnapshot } from "@/lib/industrial/simulator";
import type {
  ClassifiedDashboardFrame,
  DashboardSourceDescriptor,
  TelemetryProvenance,
  TelemetryScope,
  TelemetrySourceIdentity,
} from "./contract";
import { SUPPORTED_FRAME_VERSION } from "./contract";

/**
 * A recognisably synthetic scenario identity. It is not, and must never be
 * replaced by, a customer name, a plant name, a site code or a gateway serial.
 * The human-readable name lives in the message catalogue so it is disclosed in
 * every locale.
 */
export const LOCAL_DEMO_SOURCE: TelemetrySourceIdentity = {
  kind: "DEMO_SCENARIO",
  id: "hermes-demo-scenario-01",
  labelKey: "dashboard.provenance.scenarioName",
};

export const LOCAL_DEMO_PROVENANCE: TelemetryProvenance = {
  adapter: "hermes.dashboard.local-demo-adapter",
  adapterVersion: "109-B0",
  producedBy: "LOCAL_DEMO_ADAPTER",
  network: "NONE",
};

/**
 * A demo frame belongs to no organization and no plant site. That is stated
 * explicitly rather than left as two absent fields, so a future ingestion path
 * cannot mistake "unscoped" for "not yet populated" — and the contract rejects
 * a DEMO_NO_TENANT scope that carries an identifier anyway.
 */
export const LOCAL_DEMO_SCOPE: TelemetryScope = {
  organizationId: null,
  siteId: null,
  scopeKind: "DEMO_NO_TENANT",
};

/**
 * The single descriptor the server hands to the dashboard surface. It is a
 * module-level constant: there is no argument, no environment variable, no
 * request parameter and no branch that can produce a different one.
 *
 * It carries the full identity — scope, source and provenance included — so the
 * frame validator can compare every immutable field rather than only the mode.
 */
export const LOCAL_DEMO_DESCRIPTOR: DashboardSourceDescriptor = {
  classification: "SIMULATED",
  connectionMode: "SIMULATED",
  scope: LOCAL_DEMO_SCOPE,
  source: LOCAL_DEMO_SOURCE,
  provenance: LOCAL_DEMO_PROVENANCE,
  resolvedBy: "SERVER",
};

/**
 * Resolve the dashboard's data source. Called from the SERVER component so the
 * mode is fixed before the client surface ever renders.
 *
 * This function takes no input on purpose. A resolver that accepted a mode
 * argument, read a search parameter, or fell back to SIMULATED when a live
 * source was unavailable would reintroduce exactly the defect Phase 109-B0
 * retired: a synthetic value presented under a boundary that implies it might
 * have been real.
 */
export function resolveDashboardSource(): DashboardSourceDescriptor {
  return LOCAL_DEMO_DESCRIPTOR;
}

/**
 * Produce one classified demo frame.
 *
 * LOCAL-ADAPTER TIME INVARIANT — enforced, not assumed:
 *   snapshot.ts === acquisitionTs === receivedTs === now
 *
 * The simulator stamps the snapshot with the same instant it was asked to
 * compute, so for a locally generated frame the observation time, the envelope's
 * acquisition time and the receipt time are one instant. They are still stored
 * separately because a replay or an ingestion path will need them to differ, and
 * `validateDashboardFrame` checks both the ordering and the envelope/body
 * agreement — a frame whose two clocks disagree is rejected rather than shown.
 */
export function createLocalDemoFrame(now: number = Date.now()): ClassifiedDashboardFrame {
  const snapshot = simulateSnapshot(now);
  return {
    frameVersion: SUPPORTED_FRAME_VERSION,
    classification: "SIMULATED",
    connectionMode: "SIMULATED",
    quality: "GOOD",
    scope: LOCAL_DEMO_SCOPE,
    source: LOCAL_DEMO_SOURCE,
    provenance: LOCAL_DEMO_PROVENANCE,
    acquisitionTs: snapshot.ts,
    receivedTs: snapshot.ts,
    snapshot,
  };
}
