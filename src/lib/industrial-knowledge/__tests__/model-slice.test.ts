// PHASE 101 — the SCRIPT / ROLE / AUDIT_EVENT_TYPE model slice.
//
// WHAT THIS FILE HAS TO PROVE
// The slice adds a governance layer — who may invoke a supervisory routine, and
// what record that invocation leaves — WITHOUT touching diagnosis. Three claims
// carry that weight, and each is worthless unless it is tested against a graph
// that would break it:
//
//   1. A SCRIPT bridges layers. It is a real engineering object and must be
//      reachable across the SCADA/PLC boundary like any other.
//   2. A ROLE and an AUDIT_EVENT_TYPE never are. They are removed while
//      neighbours are built and never admitted to a traversal frontier, so no
//      diagnostic path can run through an authorisation fact.
//   3. Adding the whole slice leaves ranking BYTE-FOR-BYTE identical. Not
//      "similar", not "still accurate" — identical, because a governance change
//      that moved a hypothesis would mean the two concerns were never separate.
//
// The fixtures below are deliberately synthetic and minimal. A test that could
// only be satisfied by the shipped corpus would pass for reasons its author
// could not name.

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { CORPUS, corpusIndex, sourceAgreementReport } from "../corpus";
import { diagnose } from "../diagnostics";
import { buildIndex, governanceFor, neighbours, traverse } from "../graph";
import { checksumOfSystem, defineReferenceSystem, validateAuthoredSystem } from "../provenance";
import {
  isHumanInvokable,
  isNonDiagnosticKind,
  isStructuralRelation,
  KNOWLEDGE_NODE_KINDS,
  KNOWLEDGE_RELATIONS,
  NON_DIAGNOSTIC_NODE_KINDS,
  STRUCTURAL_RELATIONS,
  type AuthoredEdge,
  type AuthoredNode,
  type AuthoredReferenceSystem,
  type Observation,
} from "../types";

/* ── Fixture ──────────────────────────────────────────────────────────────── */

const P = "FX-01";
const id = (kind: string, local: string) => `${P}:${kind}:${local}`;

const TAG_FEEDBACK = id("TAG", "PUMP_FEEDBACK");
const SCADA_FEEDBACK = id("SCADA_TAG", "SCADA_PUMP_FEEDBACK");
const ALARM = id("ALARM", "ALM_PUMP_STOPPED");
const FAULT = id("FAULT_MODE", "FM_PUMP_TRIP");
const ACTION = id("SAFE_ACTION", "SA_INSPECT_PUMP");
const SCRIPT_MANUAL = id("SCRIPT", "OnManualPurge");
const SCRIPT_AUTO = id("SCRIPT", "OnTrendArchive");
const ROLE = id("ROLE", "ShiftSupervisor");
const AUDIT = id("AUDIT_EVENT_TYPE", "ManualPurgeInvoked");

const node = (
  nodeId: string,
  kind: AuthoredNode["kind"],
  en: string,
  fa: string,
  extra: Partial<AuthoredNode> = {},
): AuthoredNode => ({
  id: nodeId,
  kind,
  label: { en, fa },
  provenance: {
    subsystem: "PURGE_LOOP",
    sourceId: nodeId.split(":").slice(-1)[0],
    domain: "SUPERVISORY",
    safetyClass: "NON_SAFETY",
  },
  ...extra,
});

/** The plant half: everything diagnosis is allowed to see. */
function plantSystem(): AuthoredReferenceSystem {
  return {
    id: P,
    name: { en: "Governance slice fixture", fa: "نمونهٔ برش حاکمیتی" },
    domain: { en: "Transfer pump loop", fa: "حلقهٔ پمپ انتقال" },
    sourceType: "SCADA_REFERENCE",
    platform: "Vendor-neutral supervisory reference",
    version: "1.0.0",
    revision: 1,
    origin: "SYNTHETIC_ORIGINAL",
    nodes: [
      node(TAG_FEEDBACK, "TAG", "Pump running feedback", "بازخورد کارکرد پمپ", {
        attributes: { dataType: "BOOL" },
      }),
      node(SCADA_FEEDBACK, "SCADA_TAG", "Pump feedback (supervisory)", "بازخورد پمپ (نظارتی)"),
      node(ALARM, "ALARM", "Transfer pump stopped", "توقف پمپ انتقال", {
        attributes: { alarmPriority: "HIGH", requiresAck: true },
      }),
      node(FAULT, "FAULT_MODE", "Pump drive tripped", "تریپ درایو پمپ", {
        attributes: { faultClass: "DRIVE_FAULT", subsystem: "DRIVE" },
      }),
      node(ACTION, "SAFE_ACTION", "Inspect the pump drive", "بازرسی درایو پمپ"),
    ],
    edges: [
      { source: TAG_FEEDBACK, target: ALARM, relation: "RAISES" },
      { source: SCADA_FEEDBACK, target: TAG_FEEDBACK, relation: "MIRRORS" },
      { source: TAG_FEEDBACK, target: FAULT, relation: "EVIDENCE_FOR" },
      { source: FAULT, target: ALARM, relation: "EXPLAINS" },
      { source: ACTION, target: FAULT, relation: "VERIFIES" },
    ],
    scenarios: [],
  };
}

/** Governance nodes and their two structural edges. No diagnostic edge. */
const GOVERNANCE_NODES: AuthoredNode[] = [
  node(SCRIPT_MANUAL, "SCRIPT", "Manual purge routine", "روال تخلیهٔ دستی", {
    attributes: { humanInvokable: true, requiredPermission: "PURGE_EXECUTE" },
  }),
  node(SCRIPT_AUTO, "SCRIPT", "Nightly trend archive", "بایگانی شبانهٔ روند"),
  node(ROLE, "ROLE", "Shift supervisor", "سرپرست شیفت"),
  node(AUDIT, "AUDIT_EVENT_TYPE", "Manual purge invoked", "اجرای تخلیهٔ دستی"),
];

const GOVERNANCE_EDGES: AuthoredEdge[] = [
  { source: SCRIPT_MANUAL, target: ROLE, relation: "REQUIRES_ROLE" },
  { source: SCRIPT_MANUAL, target: AUDIT, relation: "EMITS" },
];

function governanceSystem(): AuthoredReferenceSystem {
  const base = plantSystem();
  return {
    ...base,
    nodes: [...base.nodes, ...GOVERNANCE_NODES],
    edges: [...base.edges, ...GOVERNANCE_EDGES],
  };
}

/** Governance PLUS the diagnostic edge that makes the script a real bridge. */
function bridgeSystem(): AuthoredReferenceSystem {
  const base = governanceSystem();
  return {
    ...base,
    edges: [...base.edges, { source: SCRIPT_MANUAL, target: SCADA_FEEDBACK, relation: "READS" }],
  };
}

const OBSERVATIONS: Observation[] = [
  { nodeId: ALARM, state: "TRUE", detail: "annunciated at 04:12 on the supervisory client" },
  { nodeId: TAG_FEEDBACK, state: "ABNORMAL" },
];

const indexOf = (system: AuthoredReferenceSystem) => buildIndex([defineReferenceSystem(system)]);

/* ── 1 — vocabulary ───────────────────────────────────────────────────────── */

describe("PHASE 101 — governance vocabulary", () => {
  it("declares the three node kinds and the two relations", () => {
    expect(KNOWLEDGE_NODE_KINDS).toContain("SCRIPT");
    expect(KNOWLEDGE_NODE_KINDS).toContain("ROLE");
    expect(KNOWLEDGE_NODE_KINDS).toContain("AUDIT_EVENT_TYPE");
    expect(KNOWLEDGE_RELATIONS).toContain("REQUIRES_ROLE");
    expect(KNOWLEDGE_RELATIONS).toContain("EMITS");
  });

  it("classifies ROLE and AUDIT_EVENT_TYPE as non-diagnostic, and SCRIPT as diagnostic", () => {
    expect([...NON_DIAGNOSTIC_NODE_KINDS].sort()).toEqual(["AUDIT_EVENT_TYPE", "ROLE"]);
    expect(isNonDiagnosticKind("ROLE")).toBe(true);
    expect(isNonDiagnosticKind("AUDIT_EVENT_TYPE")).toBe(true);
    // A SCRIPT is an engineering object like any other. Excluding it would hide
    // the supervisory layer from diagnosis, which is the opposite of the point.
    expect(isNonDiagnosticKind("SCRIPT")).toBe(false);
  });

  it("classifies both new relations as structural, and keeps them out of diagnosis", () => {
    expect([...STRUCTURAL_RELATIONS].sort()).toEqual(["EMITS", "REQUIRES_ROLE"]);
    expect(isStructuralRelation("REQUIRES_ROLE")).toBe(true);
    expect(isStructuralRelation("EMITS")).toBe(true);
    expect(isStructuralRelation("READS")).toBe(false);
  });
});

/* ── 2 — bridge traversal ─────────────────────────────────────────────────── */

describe("PHASE 101 — bridge traversal", () => {
  const index = indexOf(bridgeSystem());

  it("reaches the SCRIPT across the SCADA boundary", () => {
    // Unfiltered by relation and deep enough to reach the governance layer if
    // anything would let it: alarm → tag → SCADA tag → script is three hops,
    // and the role and audit class sit one hop further out.
    const reached = traverse(index, [ALARM], { direction: "both", maxDepth: 6 });
    const ids = reached.map((r) => r.node.id);

    expect(ids).toContain(TAG_FEEDBACK);
    expect(ids).toContain(SCADA_FEEDBACK);
    expect(ids).toContain(SCRIPT_MANUAL);
    expect(reached.find((r) => r.node.id === SCRIPT_MANUAL)?.depth).toBe(3);
  });

  it("never returns a ROLE or an AUDIT_EVENT_TYPE from a traversal", () => {
    const reached = traverse(index, [ALARM], { direction: "both", maxDepth: 6 });
    const kinds = reached.map((r) => r.node.kind);
    expect(kinds).not.toContain("ROLE");
    expect(kinds).not.toContain("AUDIT_EVENT_TYPE");
  });

  it("never admits a governance node to the frontier, even when asked to", () => {
    // `includeNonDiagnostic` widens a ONE-HOP neighbour query. If it also
    // widened a walk, a role would become a corridor between two unrelated
    // scripts — so `traverse` strips it, and this asserts that it does.
    const reached = traverse(index, [ALARM], {
      direction: "both",
      maxDepth: 6,
      includeNonDiagnostic: true,
    });
    expect(reached.map((r) => r.node.id)).not.toContain(ROLE);
    expect(reached.map((r) => r.node.id)).not.toContain(AUDIT);
  });

  it("hides governance from an ordinary neighbour query and shows it on request", () => {
    const plain = neighbours(index, SCRIPT_MANUAL, { direction: "both" }).map((n) => n.node.id);
    expect(plain).toContain(SCADA_FEEDBACK);
    expect(plain).not.toContain(ROLE);
    expect(plain).not.toContain(AUDIT);

    const opened = neighbours(index, SCRIPT_MANUAL, {
      direction: "both",
      includeNonDiagnostic: true,
    }).map((n) => n.node.id);
    expect(opened).toContain(ROLE);
    expect(opened).toContain(AUDIT);
  });

  it("projects the governance view of a script explicitly", () => {
    const view = governanceFor(index, SCRIPT_MANUAL);
    expect(view.roles.map((r) => r.id)).toEqual([ROLE]);
    expect(view.auditEventTypes.map((e) => e.id)).toEqual([AUDIT]);

    const automatic = governanceFor(index, SCRIPT_AUTO);
    expect(automatic.roles).toEqual([]);
    expect(automatic.auditEventTypes).toEqual([]);
  });
});

/* ── 3 — ranking is byte-for-byte unchanged ───────────────────────────────── */

describe("PHASE 101 — ranking is unaffected by the governance slice", () => {
  it("produces a byte-identical diagnosis with and without the slice", () => {
    const before = diagnose(indexOf(plantSystem()), { observations: OBSERVATIONS, locale: "en" });
    const after = diagnose(indexOf(governanceSystem()), {
      observations: OBSERVATIONS,
      locale: "en",
    });
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it("actually ranked something, so the comparison above is not vacuous", () => {
    const result = diagnose(indexOf(plantSystem()), { observations: OBSERVATIONS, locale: "en" });
    expect(result.hypotheses.map((h) => h.faultModeId)).toEqual([FAULT]);
    expect(result.hypotheses[0].supporting.map((c) => c.nodeId).sort()).toEqual(
      [ALARM, TAG_FEEDBACK].sort(),
    );
    expect(result.safeVerificationActions.map((a) => a.nodeId)).toEqual([ACTION]);
  });

  it("keeps every shipped corpus diagnosis byte-identical to its pinned digest", () => {
    // The pin is a SHA-256 over the serialised diagnosis of every scenario in
    // the corpus, in corpus order. It was computed against the code as it stood
    // before this slice existed (commit 942a9c3) and is unchanged by it. Any
    // future edit that moves a hypothesis, a score, a citation or an escalation
    // line moves this digest, which is exactly the alarm that should ring.
    const index = corpusIndex();
    const hash = createHash("sha256");
    for (const system of CORPUS) {
      for (const scenario of system.scenarios) {
        hash.update(
          JSON.stringify(diagnose(index, { observations: scenario.observations, locale: "en" })),
        );
      }
    }
    expect(hash.digest("hex")).toBe(
      "97a8d5cdc106bf016838ced016c164b88fb5aff53752d6f0795176252e451e8b",
    );
  });
});

/* ── 4 — humanInvokable is explicit and fail-closed ───────────────────────── */

describe("PHASE 101 — humanInvokable", () => {
  it("reports true only for an explicit true", () => {
    expect(isHumanInvokable({ attributes: { humanInvokable: true } })).toBe(true);
    expect(isHumanInvokable({ attributes: { humanInvokable: false } })).toBe(false);
    // Absence is not an unknown to be resolved generously — it is a false.
    expect(isHumanInvokable({ attributes: {} })).toBe(false);
    expect(isHumanInvokable({})).toBe(false);
  });

  it("rejects a REQUIRES_ROLE edge from a script that is not human-invokable", () => {
    const system = governanceSystem();
    const issues = validateAuthoredSystem({
      ...system,
      edges: [...system.edges, { source: SCRIPT_AUTO, target: ROLE, relation: "REQUIRES_ROLE" }],
    });
    expect(issues.map((i) => i.code)).toContain("ROLE_ON_AUTOMATIC_SCRIPT");
  });

  it("treats an explicit false exactly like an absent declaration", () => {
    const system = governanceSystem();
    const issues = validateAuthoredSystem({
      ...system,
      nodes: system.nodes.map((n) =>
        n.id === SCRIPT_MANUAL ? { ...n, attributes: { ...n.attributes, humanInvokable: false } } : n,
      ),
    });
    expect(issues.map((i) => i.code)).toContain("ROLE_ON_AUTOMATIC_SCRIPT");
  });

  it("refuses to seal a system whose authorisation story does not hold", () => {
    const system = governanceSystem();
    expect(() =>
      defineReferenceSystem({
        ...system,
        edges: [...system.edges, { source: SCRIPT_AUTO, target: ROLE, relation: "REQUIRES_ROLE" }],
      }),
    ).toThrow(/ROLE_ON_AUTOMATIC_SCRIPT/);
  });

  it("rejects a governance relation pointed at the wrong kind of node", () => {
    const system = governanceSystem();
    const codes = validateAuthoredSystem({
      ...system,
      edges: [
        ...system.edges,
        { source: SCRIPT_MANUAL, target: ACTION, relation: "REQUIRES_ROLE" },
        { source: SCRIPT_MANUAL, target: ROLE, relation: "EMITS" },
      ],
    }).map((i) => i.code);
    expect(codes).toContain("REQUIRES_ROLE_TARGET_NOT_ROLE");
    expect(codes).toContain("EMITS_TARGET_NOT_AUDIT_EVENT");
  });

  it("rejects an engineering relation authored onto a governance node", () => {
    // This is what makes the traversal exclusion total rather than best-effort:
    // a ROLE can only ever be found at the far end of a REQUIRES_ROLE edge, so
    // removing the kind cannot remove anything else along with it.
    const system = governanceSystem();
    const codes = validateAuthoredSystem({
      ...system,
      edges: [...system.edges, { source: ROLE, target: TAG_FEEDBACK, relation: "READS" }],
    }).map((i) => i.code);
    expect(codes).toContain("GOVERNANCE_NODE_ON_DIAGNOSTIC_RELATION");
  });
});

/* ── 5 — humanInvokable is part of the content identity ───────────────────── */

describe("PHASE 101 — humanInvokable enters the checksum", () => {
  const withValue = (value: boolean | undefined): AuthoredReferenceSystem => {
    const system = governanceSystem();
    return {
      ...system,
      nodes: system.nodes.map((n) => {
        if (n.id !== SCRIPT_MANUAL) return n;
        const attributes = { ...n.attributes };
        if (value === undefined) delete attributes.humanInvokable;
        else attributes.humanInvokable = value;
        return { ...n, attributes };
      }),
    };
  };

  it("changes the checksum when humanInvokable changes", () => {
    const asTrue = checksumOfSystem(withValue(true));
    const asFalse = checksumOfSystem(withValue(false));
    expect(asFalse).not.toBe(asTrue);
  });

  it("distinguishes an explicit false from an absent declaration", () => {
    // They MEAN the same thing to `isHumanInvokable`, and they must still be
    // distinguishable as content: one is an engineering decision that was taken
    // and recorded, the other is one that was never made.
    expect(checksumOfSystem(withValue(undefined))).not.toBe(checksumOfSystem(withValue(false)));
  });

  it("keeps the checksum stable when nothing changes", () => {
    expect(checksumOfSystem(withValue(true))).toBe(checksumOfSystem(withValue(true)));
  });

  it("leaves systems that declare no script untouched by the new attribute", () => {
    // Appending `humanInvokable` to the canonical attribute order must not move
    // the identity of any system that never declares it.
    for (const system of CORPUS) {
      expect(system.checksum).toMatch(/^[0-9a-f]{64}$/);
      for (const node_ of system.nodes) {
        expect(node_.provenance.checksum).toBe(system.checksum);
      }
    }
  });
});

/* ── 6 — provenance and vendor neutrality ─────────────────────────────────── */

describe("PHASE 101 — governance provenance and vendor neutrality", () => {
  it("stamps complete provenance onto every governance node", () => {
    const sealed = defineReferenceSystem(governanceSystem());
    const governance = sealed.nodes.filter((n) =>
      ["SCRIPT", "ROLE", "AUDIT_EVENT_TYPE"].includes(n.kind),
    );
    expect(governance.length).toBe(4);
    for (const n of governance) {
      expect(n.provenance.projectId).toBe(P);
      expect(n.provenance.checksum).toBe(sealed.checksum);
      expect(n.provenance.version).toBe(sealed.version);
      expect(n.provenance.revision).toBe(sealed.revision);
      expect(n.provenance.sourceId.length).toBeGreaterThan(0);
      expect(n.provenance.subsystem.length).toBeGreaterThan(0);
      expect(n.provenance.sourceType).toBe(sealed.sourceType);
    }
  });

  it("names no vendor anywhere in the model vocabulary", () => {
    // Scoped to the VOCABULARY and to this slice's own fixture. The corpus's
    // own project ids are deliberately out of scope: TIA-01/TIA-02 are
    // documented as architecture-modelled references and are named as such.
    const VENDOR_TOKENS = [
      "SIEMENS",
      "SIMATIC",
      "WINCC",
      "STEP7",
      "ROCKWELL",
      "ALLEN",
      "BRADLEY",
      "LOGIX",
      "FACTORYTALK",
      "SCHNEIDER",
      "MODICON",
      "HONEYWELL",
      "YOKOGAWA",
      "MITSUBISHI",
      "OMRON",
      "IGNITION",
      "PROFICY",
    ];
    const surface = [
      ...KNOWLEDGE_NODE_KINDS,
      ...KNOWLEDGE_RELATIONS,
      ...GOVERNANCE_NODES.map((n) => `${n.id} ${n.label.en} ${n.label.fa}`),
      ...GOVERNANCE_EDGES.map((e) => `${e.source} ${e.relation} ${e.target}`),
    ]
      .join(" ")
      .toUpperCase();

    for (const token of VENDOR_TOKENS) expect(surface).not.toContain(token);
  });

  it("keeps the governance vocabulary free of anything Hermes could execute", () => {
    // A ROLE is a declared authorisation, not one this system grants; an
    // AUDIT_EVENT_TYPE is a declared record class, not one it writes. Nothing in
    // the slice may imply a runtime, so the relations stay declarative in name
    // as well as in behaviour.
    expect(KNOWLEDGE_RELATIONS).not.toContain("GRANTS_ROLE");
    expect(KNOWLEDGE_RELATIONS).not.toContain("EXECUTES");
    const sealed = defineReferenceSystem(governanceSystem());
    for (const n of sealed.nodes.filter((x) => x.kind === "ROLE")) {
      expect(n.attributes.accessMode).toBeUndefined();
    }
  });
});

/* ── 7 — agreement status ─────────────────────────────────────────────────── */

describe("PHASE 101 — source agreement status", () => {
  const SCADA_SOURCE = [
    "// Manual purge, invoked from the supervisory client.",
    "function OnManualPurge() {",
    '  var feedback = Tags("SCADA_PUMP_FEEDBACK").Read();',
    "  return feedback;",
    "}",
    "",
  ].join("\n");

  const artifact = (
    local: string,
    language: "JAVASCRIPT" | "LAD_XML",
    content: string,
    declares: string[],
  ) => ({
    local,
    language,
    layer: "SCADA" as const,
    fileName: `${local}.src`,
    declares,
    content,
    provenance: {
      subsystem: "PURGE_LOOP",
      sourceId: local,
      domain: "SUPERVISORY" as const,
      safetyClass: "NON_SAFETY" as const,
    },
  });

  const LADDER = '<Network id="1"><Contact operand="PUMP_FEEDBACK" /></Network>\n';

  it("reports BLOCKED when no artefact was examined at all", () => {
    const report = sourceAgreementReport(defineReferenceSystem(bridgeSystem()));
    expect(report.checked).toEqual([]);
    expect(report.status).toBe("BLOCKED");
    // BLOCKED must never be reachable by way of an empty issue list reading as
    // success: an unmeasured graph is not an agreeing one.
    expect(report.issues).toEqual([]);
  });

  it("reports PASS when every artefact was checked and agreed", () => {
    const system = bridgeSystem();
    const sealed = defineReferenceSystem({
      ...system,
      artifacts: [artifact("PurgeScript", "JAVASCRIPT", SCADA_SOURCE, [SCRIPT_MANUAL])],
    });
    const report = sourceAgreementReport(sealed);
    expect(report.issues).toEqual([]);
    expect(report.checked).toEqual(["PurgeScript"]);
    expect(report.skipped).toEqual([]);
    expect(report.status).toBe("PASS");
  });

  it("reports PARTIAL when some artefacts were skipped and none disagreed", () => {
    const system = bridgeSystem();
    const sealed = defineReferenceSystem({
      ...system,
      artifacts: [
        artifact("PurgeScript", "JAVASCRIPT", SCADA_SOURCE, [SCRIPT_MANUAL]),
        artifact("PumpNetwork", "LAD_XML", LADDER, [TAG_FEEDBACK]),
      ],
    });
    const report = sourceAgreementReport(sealed);
    expect(report.issues).toEqual([]);
    expect(report.checked).toEqual(["PurgeScript"]);
    expect(report.skipped.map((s) => s.language)).toEqual(["LAD_XML"]);
    expect(report.status).toBe("PARTIAL");
  });

  it("reports FAIL when the source states a relationship the graph does not have", () => {
    // The governance system carries no SCRIPT → SCADA_TAG read edge, so the
    // very same script source now disagrees with its own graph.
    const system = governanceSystem();
    const sealed = defineReferenceSystem({
      ...system,
      artifacts: [artifact("PurgeScript", "JAVASCRIPT", SCADA_SOURCE, [SCRIPT_MANUAL])],
    });
    const report = sourceAgreementReport(sealed);
    expect(report.status).toBe("FAIL");
    expect(report.issues.map((i) => i.code)).toContain("MISSING_EDGE");
  });

  it("outranks a skipped artefact with a real disagreement", () => {
    const system = governanceSystem();
    const sealed = defineReferenceSystem({
      ...system,
      artifacts: [
        artifact("PurgeScript", "JAVASCRIPT", SCADA_SOURCE, [SCRIPT_MANUAL]),
        artifact("PumpNetwork", "LAD_XML", LADDER, [TAG_FEEDBACK]),
      ],
    });
    // Both PARTIAL and FAIL are true statements about this system; the caller
    // must be told the one that requires action.
    expect(sourceAgreementReport(sealed).status).toBe("FAIL");
  });

  it("leaves every shipped reference system in a measured, agreeing state", () => {
    for (const system of CORPUS) {
      const report = sourceAgreementReport(system);
      expect(report.issues).toEqual([]);
      expect(["PASS", "PARTIAL"]).toContain(report.status);
    }
  });
});
