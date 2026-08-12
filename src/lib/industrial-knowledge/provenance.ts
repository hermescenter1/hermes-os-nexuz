// PHASE 101 — provenance sealing, canonicalisation and corpus validation.
//
// WHY SEALING EXISTS
// A reference system is authored as plain data. Authors write only what is
// genuinely local to each object (its subsystem, its source id, its domain and
// its safety class). Everything that belongs to the SYSTEM rather than to the
// object — project id, source type, version, revision and the content checksum
// — is stamped here, once, by `defineReferenceSystem`. An author therefore
// cannot forget to set provenance, and cannot set it inconsistently.
//
// CHECKSUM ORDERING
// The checksum identifies the CONTENT of a reference system, so it is computed
// over the canonical form of the AUTHORED data — before any node carries a
// checksum of its own. It is then stamped onto every node's provenance. This
// ordering is what keeps the value well-defined; including a node's own
// checksum in the input that produces it would be circular.
//
// CANONICAL FORM
// Keys are emitted in a fixed order and every collection is sorted by a stable
// identity key, so two systems describing the same plant produce identical
// bytes regardless of the order rows happened to be authored in. This mirrors
// `canonicalize()` in the Phase 94 import envelope deliberately: the two
// checksums answer the same question about the same kind of artefact.

import { createHash } from "node:crypto";
import { isHumanInvokable, isNonDiagnosticKind, isStructuralRelation } from "./types";
import type {
  AuthoredEdge,
  AuthoredNode,
  AuthoredReferenceSystem,
  FaultScenario,
  KnowledgeEdge,
  KnowledgeNode,
  NodeAttributes,
  Provenance,
  ReferenceSystem,
} from "./types";
import {
  checksumOfArtifact,
  countLines,
  normaliseSource,
  type SourceArtifact,
} from "./source-artifacts";

/* ── Canonicalisation ─────────────────────────────────────────────────────── */

/**
 * Attribute keys in a fixed emission order.
 *
 * An explicit list rather than `Object.keys().sort()`: adding a field to
 * `NodeAttributes` must be a deliberate act that also decides where it sits in
 * the canonical form, otherwise a purely additive type change would silently
 * move every checksum in the corpus.
 */
const ATTRIBUTE_ORDER: readonly (keyof NodeAttributes)[] = [
  "dataType",
  "address",
  "unit",
  "accessMode",
  "channelType",
  "deviceCategory",
  "networkZone",
  "protocol",
  "blockType",
  "stepNumber",
  "stepTimeoutSeconds",
  "alarmPriority",
  "requiresAck",
  "retentionDays",
  "sampleIntervalSeconds",
  "requiredPermission",
  "requiresConfirmation",
  "faultClass",
  "subsystem",
  "expectedState",
  "formula",
  // Appended, not inserted. A new attribute goes at the END of this list so it
  // cannot move any existing node's position in the canonical form; only nodes
  // that actually declare it see their checksum change. `humanInvokable` is in
  // here on purpose: whether a routine is operator-driven is part of the
  // engineering content, so flipping it must change the system's identity.
  "humanInvokable",
];

function canonicalAttributes(attrs: NodeAttributes | undefined): Array<[string, unknown]> {
  if (!attrs) return [];
  const out: Array<[string, unknown]> = [];
  for (const key of ATTRIBUTE_ORDER) {
    const value = attrs[key];
    if (value !== undefined) out.push([key, value]);
  }
  return out;
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Stable identity of an edge, independent of authoring order. */
export function edgeKey(edge: AuthoredEdge): string {
  return `${edge.relation}|${edge.source}|${edge.target}`;
}

/**
 * Deterministic edge id. Two corpora with the same edges produce the same ids,
 * which is what lets an edge be cited in a reasoning trace and resolved later.
 */
export function edgeIdOf(edge: AuthoredEdge): string {
  return `E:${edge.source}-[${edge.relation}]->${edge.target}`;
}

/** Order-stable serialisation of an authored system. Input to the checksum. */
export function canonicalizeSystem(system: AuthoredReferenceSystem): string {
  const canonical = {
    id: system.id,
    name: system.name,
    domain: system.domain,
    sourceType: system.sourceType,
    platform: system.platform,
    version: system.version,
    revision: system.revision,
    origin: system.origin,
    nodes: [...system.nodes]
      .sort((a, b) => byString(a.id, b.id))
      .map((n) => ({
        id: n.id,
        kind: n.kind,
        label: n.label,
        description: n.description ?? null,
        attributes: canonicalAttributes(n.attributes),
        provenance: {
          subsystem: n.provenance.subsystem,
          sourceId: n.provenance.sourceId,
          domain: n.provenance.domain,
          safetyClass: n.provenance.safetyClass,
        },
      })),
    edges: [...system.edges]
      .sort((a, b) => byString(edgeKey(a), edgeKey(b)))
      .map((e) => ({
        source: e.source,
        target: e.target,
        relation: e.relation,
        note: e.note ?? null,
      })),
    scenarios: [...system.scenarios]
      .sort((a, b) => byString(a.id, b.id))
      .map((s) => ({
        id: s.id,
        title: s.title,
        narrative: s.narrative,
        observations: [...s.observations]
          .sort((a, b) => byString(a.nodeId, b.nodeId))
          .map((o) => ({ nodeId: o.nodeId, state: o.state, detail: o.detail ?? null })),
        groundTruth: {
          subsystem: s.groundTruth.subsystem,
          faultClass: s.groundTruth.faultClass,
          faultModeId: s.groundTruth.faultModeId,
          supportingNodeIds: [...s.groundTruth.supportingNodeIds].sort(byString),
          expectedMissingNodeIds: [...s.groundTruth.expectedMissingNodeIds].sort(byString),
          expectedSafeActionIds: [...s.groundTruth.expectedSafeActionIds].sort(byString),
          requiresEscalation: s.groundTruth.requiresEscalation,
        },
      })),
    // Artefacts enter the checksum by their CONTENT hash rather than their
    // text, so the system checksum still covers every byte of engineering
    // source while the canonical form stays a readable size.
    artifacts: [...(system.artifacts ?? [])]
      .sort((a, b) => byString(a.local, b.local))
      .map((art) => ({
        local: art.local,
        language: art.language,
        layer: art.layer,
        fileName: art.fileName,
        declares: [...art.declares].sort(byString),
        contentChecksum: checksumOfArtifact(art.content),
        provenance: {
          subsystem: art.provenance.subsystem,
          sourceId: art.provenance.sourceId,
          domain: art.provenance.domain,
          safetyClass: art.provenance.safetyClass,
        },
      })),
  };
  return JSON.stringify(canonical);
}

/** SHA-256 of the canonical form. The immutable content identity. */
export function checksumOfSystem(system: AuthoredReferenceSystem): string {
  return createHash("sha256").update(canonicalizeSystem(system), "utf8").digest("hex");
}

/* ── Validation ───────────────────────────────────────────────────────────── */

export interface ValidationIssue {
  /** Stable machine-readable defect class. */
  code:
    | "DUPLICATE_NODE_ID"
    | "DUPLICATE_EDGE"
    | "DANGLING_EDGE_SOURCE"
    | "DANGLING_EDGE_TARGET"
    | "SELF_EDGE"
    | "UNKNOWN_OBSERVATION_NODE"
    | "DUPLICATE_OBSERVATION"
    | "UNKNOWN_FAULT_MODE"
    | "FAULT_MODE_KIND_MISMATCH"
    | "FAULT_MODE_UNCLASSIFIED"
    | "UNKNOWN_SUPPORTING_NODE"
    | "UNKNOWN_MISSING_NODE"
    | "UNKNOWN_SAFE_ACTION"
    | "SAFE_ACTION_KIND_MISMATCH"
    | "MISSING_NODE_IS_OBSERVED"
    | "DUPLICATE_SCENARIO_ID"
    | "ID_PREFIX_MISMATCH"
    | "EMPTY_LABEL"
    | "DUPLICATE_ARTIFACT_LOCAL"
    | "ARTIFACT_DECLARES_UNKNOWN_NODE"
    | "EMPTY_ARTIFACT"
    | "ROLE_ON_AUTOMATIC_SCRIPT"
    | "REQUIRES_ROLE_TARGET_NOT_ROLE"
    | "EMITS_TARGET_NOT_AUDIT_EVENT"
    | "GOVERNANCE_NODE_ON_DIAGNOSTIC_RELATION";
  /** The offending object's id — never its content. */
  ref: string;
  detail?: string;
}

/**
 * Structural validation of an authored system.
 *
 * Returns issues rather than throwing on the first one so a corpus test can
 * report every defect in a single run. `defineReferenceSystem` escalates a
 * non-empty result to a throw, because a structurally invalid reference system
 * must never reach the retrieval or reasoning layers.
 */
export function validateAuthoredSystem(system: AuthoredReferenceSystem): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodesById = new Map<string, AuthoredNode>();

  for (const node of system.nodes) {
    if (nodesById.has(node.id)) {
      issues.push({ code: "DUPLICATE_NODE_ID", ref: node.id });
      continue;
    }
    nodesById.set(node.id, node);

    if (!node.id.startsWith(`${system.id}:`)) {
      issues.push({
        code: "ID_PREFIX_MISMATCH",
        ref: node.id,
        detail: `expected prefix "${system.id}:"`,
      });
    }
    if (!node.label.en.trim() || !node.label.fa.trim()) {
      issues.push({ code: "EMPTY_LABEL", ref: node.id });
    }
    if (node.kind === "FAULT_MODE") {
      const { faultClass, subsystem } = node.attributes ?? {};
      if (!faultClass || !subsystem) {
        issues.push({
          code: "FAULT_MODE_UNCLASSIFIED",
          ref: node.id,
          detail: "a FAULT_MODE must declare both faultClass and subsystem",
        });
      }
    }
  }

  const seenEdges = new Set<string>();
  for (const edge of system.edges) {
    const key = edgeKey(edge);
    if (seenEdges.has(key)) issues.push({ code: "DUPLICATE_EDGE", ref: key });
    seenEdges.add(key);

    if (edge.source === edge.target) issues.push({ code: "SELF_EDGE", ref: key });
    if (!nodesById.has(edge.source)) {
      issues.push({ code: "DANGLING_EDGE_SOURCE", ref: key, detail: edge.source });
    }
    if (!nodesById.has(edge.target)) {
      issues.push({ code: "DANGLING_EDGE_TARGET", ref: key, detail: edge.target });
    }

    /* Governance slice — fail closed on every dimension.
     *
     * These four rules are what make the traversal exclusion in `graph.ts` a
     * guarantee rather than a hope. A ROLE or an AUDIT_EVENT_TYPE can only ever
     * sit at the far end of its own structural relation, so removing those
     * kinds from a diagnostic walk cannot silently remove anything else with
     * them — and no engineering relation can be authored onto a governance node
     * to sneak one back onto a diagnostic path. */
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);

    if (edge.relation === "REQUIRES_ROLE") {
      // An automatic routine has no operator to authorise. Attaching a role to
      // one would state that a human stands behind an action no human takes —
      // exactly the claim an audit trail must never be able to make.
      if (sourceNode && !isHumanInvokable(sourceNode)) {
        issues.push({
          code: "ROLE_ON_AUTOMATIC_SCRIPT",
          ref: key,
          detail: `${edge.source} does not declare humanInvokable: true`,
        });
      }
      if (targetNode && targetNode.kind !== "ROLE") {
        issues.push({
          code: "REQUIRES_ROLE_TARGET_NOT_ROLE",
          ref: key,
          detail: `${edge.target} is a ${targetNode.kind}`,
        });
      }
    }

    if (edge.relation === "EMITS" && targetNode && targetNode.kind !== "AUDIT_EVENT_TYPE") {
      issues.push({
        code: "EMITS_TARGET_NOT_AUDIT_EVENT",
        ref: key,
        detail: `${edge.target} is a ${targetNode.kind}`,
      });
    }

    if (!isStructuralRelation(edge.relation)) {
      for (const endpoint of [sourceNode, targetNode]) {
        if (endpoint && isNonDiagnosticKind(endpoint.kind)) {
          issues.push({
            code: "GOVERNANCE_NODE_ON_DIAGNOSTIC_RELATION",
            ref: key,
            detail: `${endpoint.id} is a ${endpoint.kind} and may only carry ${["REQUIRES_ROLE", "EMITS"].join("/")}`,
          });
        }
      }
    }
  }

  const seenScenarios = new Set<string>();
  for (const scenario of system.scenarios) {
    if (seenScenarios.has(scenario.id)) {
      issues.push({ code: "DUPLICATE_SCENARIO_ID", ref: scenario.id });
    }
    seenScenarios.add(scenario.id);

    const observed = new Set<string>();
    for (const obs of scenario.observations) {
      if (!nodesById.has(obs.nodeId)) {
        issues.push({
          code: "UNKNOWN_OBSERVATION_NODE",
          ref: scenario.id,
          detail: obs.nodeId,
        });
      }
      if (observed.has(obs.nodeId)) {
        issues.push({ code: "DUPLICATE_OBSERVATION", ref: scenario.id, detail: obs.nodeId });
      }
      observed.add(obs.nodeId);
    }

    const gt = scenario.groundTruth;
    const faultMode = nodesById.get(gt.faultModeId);
    if (!faultMode) {
      issues.push({ code: "UNKNOWN_FAULT_MODE", ref: scenario.id, detail: gt.faultModeId });
    } else if (faultMode.kind !== "FAULT_MODE") {
      issues.push({
        code: "FAULT_MODE_KIND_MISMATCH",
        ref: scenario.id,
        detail: `${gt.faultModeId} is a ${faultMode.kind}`,
      });
    }

    for (const id of gt.supportingNodeIds) {
      if (!nodesById.has(id)) {
        issues.push({ code: "UNKNOWN_SUPPORTING_NODE", ref: scenario.id, detail: id });
      }
    }
    for (const id of gt.expectedMissingNodeIds) {
      if (!nodesById.has(id)) {
        issues.push({ code: "UNKNOWN_MISSING_NODE", ref: scenario.id, detail: id });
        continue;
      }
      // A node the scenario supplies an observation for cannot simultaneously
      // be evidence the engine is expected to report as MISSING. Getting this
      // wrong would make the missing-evidence metric unearnable — a scoring
      // bug that would look like a reasoning failure.
      const supplied = scenario.observations.find((o) => o.nodeId === id);
      if (supplied && supplied.state !== "ABSENT") {
        issues.push({ code: "MISSING_NODE_IS_OBSERVED", ref: scenario.id, detail: id });
      }
    }
    for (const id of gt.expectedSafeActionIds) {
      const action = nodesById.get(id);
      if (!action) {
        issues.push({ code: "UNKNOWN_SAFE_ACTION", ref: scenario.id, detail: id });
      } else if (action.kind !== "SAFE_ACTION") {
        issues.push({
          code: "SAFE_ACTION_KIND_MISMATCH",
          ref: scenario.id,
          detail: `${id} is a ${action.kind}`,
        });
      }
    }
  }

  const seenArtifacts = new Set<string>();
  for (const artifact of system.artifacts ?? []) {
    if (seenArtifacts.has(artifact.local)) {
      issues.push({ code: "DUPLICATE_ARTIFACT_LOCAL", ref: artifact.local });
    }
    seenArtifacts.add(artifact.local);

    if (normaliseSource(artifact.content).trim().length === 0) {
      issues.push({ code: "EMPTY_ARTIFACT", ref: artifact.local });
    }
    // An artefact that claims to implement a node the corpus has never heard of
    // would produce a provenance citation pointing at nothing — the exact
    // failure mode the provenance gate exists to catch.
    for (const nodeId of artifact.declares) {
      if (!nodesById.has(nodeId)) {
        issues.push({
          code: "ARTIFACT_DECLARES_UNKNOWN_NODE",
          ref: artifact.local,
          detail: nodeId,
        });
      }
    }
  }

  return issues;
}

/* ── Sealing ──────────────────────────────────────────────────────────────── */

export class ReferenceSystemError extends Error {
  readonly issues: ValidationIssue[];
  constructor(systemId: string, issues: ValidationIssue[]) {
    const summary = issues
      .slice(0, 8)
      .map((i) => `${i.code}(${i.ref}${i.detail ? ` → ${i.detail}` : ""})`)
      .join(", ");
    super(
      `reference system ${systemId} is invalid: ${issues.length} issue(s) — ${summary}` +
        (issues.length > 8 ? " …" : ""),
    );
    this.name = "ReferenceSystemError";
    this.issues = issues;
  }
}

function stampProvenance(
  node: AuthoredNode,
  system: AuthoredReferenceSystem,
  checksum: string,
): Provenance {
  return {
    projectId: system.id,
    subsystem: node.provenance.subsystem,
    sourceType: system.sourceType,
    sourceId: node.provenance.sourceId,
    version: system.version,
    revision: system.revision,
    checksum,
    domain: node.provenance.domain,
    safetyClass: node.provenance.safetyClass,
  };
}

/**
 * Validate, checksum and seal an authored reference system.
 *
 * Throws on any structural defect. Reference systems are module-level
 * constants, so a defect surfaces at import time — in the test run and in the
 * build — rather than at the moment an engineer asks a diagnostic question.
 */
export function defineReferenceSystem(system: AuthoredReferenceSystem): ReferenceSystem {
  const issues = validateAuthoredSystem(system);
  if (issues.length > 0) throw new ReferenceSystemError(system.id, issues);

  const checksum = checksumOfSystem(system);

  const nodes: KnowledgeNode[] = system.nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    label: n.label,
    ...(n.description ? { description: n.description } : {}),
    attributes: n.attributes ?? {},
    provenance: stampProvenance(n, system, checksum),
  }));

  const edges: KnowledgeEdge[] = system.edges.map((e) => ({
    id: edgeIdOf(e),
    source: e.source,
    target: e.target,
    relation: e.relation,
    ...(e.note ? { note: e.note } : {}),
  }));

  const scenarios: FaultScenario[] = system.scenarios;

  const artifacts: SourceArtifact[] = (system.artifacts ?? []).map((art) => {
    const content = normaliseSource(art.content);
    return {
      id: `${system.id}:SRC:${art.local}`,
      local: art.local,
      language: art.language,
      layer: art.layer,
      fileName: art.fileName,
      declares: [...art.declares],
      content,
      checksum: checksumOfArtifact(content),
      lineCount: countLines(content),
      provenance: {
        projectId: system.id,
        subsystem: art.provenance.subsystem,
        sourceType: system.sourceType,
        sourceId: art.provenance.sourceId,
        version: system.version,
        revision: system.revision,
        checksum,
        domain: art.provenance.domain,
        safetyClass: art.provenance.safetyClass,
      },
    };
  });

  return {
    id: system.id,
    name: system.name,
    domain: system.domain,
    sourceType: system.sourceType,
    platform: system.platform,
    version: system.version,
    revision: system.revision,
    origin: system.origin,
    nodes,
    edges,
    scenarios,
    artifacts,
    checksum,
  };
}
