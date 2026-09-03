/**
 * PHASE 109-C1 — the local demo adapter.
 *
 * Mirrors the shape Phase 109-B0 established in `src/lib/dashboard-demo`: an
 * immutable descriptor whose classification is written LITERALLY rather than
 * inferred from the absence of a real source. Inference is how a surface ends up
 * silently presenting demo data as plant data the day a connection fails.
 *
 * INVARIANTS, enforced by tests rather than by convention:
 *   - no `fetch`, no network, no API route, no polling, no timer;
 *   - no `localStorage` or any other persistence;
 *   - deterministic: two calls produce structurally equal output;
 *   - every origin it can produce is in PERMITTED_ORIGINS_ROUND_1;
 *   - `liveConnection` is the literal `null`, not an optional that might arrive.
 */

import {
  assertPermittedOrigin,
  isEditableApprovalState,
  PROJECT_LIMITS,
  type DataOrigin,
  type EngineeringWorkspace,
  type ProvenanceRecord,
  type WorkspaceMode,
} from "./contract";
import {
  buildDemoProject,
  DEMO_BASELINE_VERSION,
  DEMO_DISCLOSURE,
  DEMO_EPOCH_MS,
  DEMO_PRODUCER,
  DEMO_TESTS,
  DEMO_VERSIONS,
  DEMO_WORKING_VERSION,
} from "./demo-project";

/**
 * What the workspace is, stated once. The UI reads this rather than deciding
 * for itself what to disclose.
 */
export interface WorkspaceSourceDescriptor {
  readonly classification: "SIMULATED";
  readonly origin: DataOrigin;
  readonly producer: string;
  readonly liveConnection: null;
  /** Message keys, so the disclosure is translatable rather than English-only. */
  readonly disclosureKeys: readonly string[];
}

const LOCAL_DEMO_DESCRIPTOR: WorkspaceSourceDescriptor = Object.freeze({
  classification: "SIMULATED",
  origin: "simulated",
  producer: DEMO_PRODUCER,
  liveConnection: null,
  disclosureKeys: Object.freeze([
    "disclosure.simulationWorkspace",
    "disclosure.noLiveController",
    "disclosure.noDownload",
  ]),
});

/**
 * Resolve the Studio's data source.
 *
 * There is no argument, no environment switch, no cookie and no search
 * parameter: nothing a request can carry may select a different mode. The only
 * source that exists in Round 1 is the local simulation.
 */
export function resolveWorkspaceSource(): WorkspaceSourceDescriptor {
  return LOCAL_DEMO_DESCRIPTOR;
}

export const WORKSPACE_PROVENANCE: ProvenanceRecord = Object.freeze({
  origin: "simulated",
  producer: DEMO_PRODUCER,
  recordedAtEpochMs: DEMO_EPOCH_MS,
  recordedBy: DEMO_PRODUCER,
  disclosure: DEMO_DISCLOSURE,
});

/** Modes Round 1 exposes. `simulation` is the only authoring mode. */
export const AVAILABLE_MODES: readonly WorkspaceMode[] = ["simulation", "review", "read-only"];

/**
 * Build the workspace.
 *
 * Every origin the project carries is re-checked against the Round 1 permit
 * list. That check is redundant while the only producer is this file — which is
 * exactly why it is here: the day an import adapter appears, the guard is
 * already in the path rather than being remembered.
 */
export function createLocalWorkspace(mode: WorkspaceMode = "simulation"): EngineeringWorkspace {
  const project = buildDemoProject();

  assertPermittedOrigin(project.provenance.origin);
  for (const artifact of project.artifacts) {
    // An artifact with no provenance is a validation FINDING (AES-C1-009), not
    // a crash: the workspace must still render so the engineer can see it.
    if (artifact.provenance && typeof artifact.provenance.origin === "string") {
      assertPermittedOrigin(artifact.provenance.origin);
    }
  }

  if (project.artifacts.length > PROJECT_LIMITS.maxArtifacts) {
    throw new Error(
      `[automation-studio] project exceeds the artifact limit ` +
        `(${project.artifacts.length} > ${PROJECT_LIMITS.maxArtifacts})`,
    );
  }
  for (const block of project.blocks) {
    if (block.sourceLines.length > PROJECT_LIMITS.maxSourceLines) {
      throw new Error(
        `[automation-studio] ${block.name} exceeds the source-line limit`,
      );
    }
  }

  return {
    project,
    mode,
    baselineVersion: DEMO_BASELINE_VERSION,
    workingVersion: DEMO_WORKING_VERSION,
    versions: DEMO_VERSIONS,
    tests: DEMO_TESTS,
    liveConnection: null,
  };
}

/** Whether the working version may be edited. Non-draft versions are read-only. */
export function workspaceIsEditable(workspace: EngineeringWorkspace): boolean {
  return (
    workspace.mode === "simulation" &&
    isEditableApprovalState(workspace.workingVersion.approval)
  );
}
