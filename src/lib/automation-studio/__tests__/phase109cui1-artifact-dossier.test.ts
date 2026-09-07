/**
 * PHASE 109-C-UI.1 — the artifact dossier projection.
 *
 * The dossier is what turned fourteen empty panes into engineering surfaces, so
 * what it may and may not contain is the load-bearing contract here:
 *
 *   - it PROJECTS: every field traces to committed fixture data;
 *   - it INVENTS NOTHING: no value, state, series or geometry that the domain
 *     contract does not carry can appear, because there is nowhere for it to
 *     come from — asserted structurally rather than by reading the UI;
 *   - it is EXHAUSTIVE over the closed `ArtifactKind` union, so a kind added
 *     later cannot silently render without a discipline or a label.
 */

import { describe, expect, it } from "vitest";

import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";
import fa from "../../../../messages/fa.json";
import { buildDemoProject, DEMO_TESTS } from "../demo-project";
import {
  ARTIFACT_PROJECTION_KEYS,
  buildArtifactDossier,
  disciplineOf,
  KIND_MESSAGE_KEY,
  ORIGIN_MESSAGE_KEY,
  PROVENANCE_PROJECTION_KEYS,
} from "../artifact-dossier";
import {
  ALL_DATA_ORIGINS,
  type ArtifactKind,
  type EngineeringArtifact,
} from "../contract";

const project = buildDemoProject();
const byId = new Map(project.artifacts.map((a) => [a.id, a]));
const dossierFor = (id: string) =>
  buildArtifactDossier(project, byId.get(id)!, DEMO_TESTS);

const ALL_KINDS: readonly ArtifactKind[] = [
  "program-block", "data-block", "udt", "tag-table",
  "hmi-screen", "hmi-faceplate", "hmi-alarm", "hmi-trend",
  "scada-area", "scada-historian", "scada-report",
  "test-scenario", "document",
];

describe("109-C-UI.1 · every data origin has a translated label", () => {
  const CATALOGUES = { en, de, fa } as const;

  it("maps every member of the closed union to a distinct key", () => {
    const keys = ALL_DATA_ORIGINS.map((origin) => ORIGIN_MESSAGE_KEY[origin]);
    expect(keys.filter(Boolean).length).toBe(ALL_DATA_ORIGINS.length);
    expect(new Set(keys).size).toBe(ALL_DATA_ORIGINS.length);
  });

  it("resolves each key in all three catalogues", () => {
    // The raw member (`simulated`, `authored`) used to be the visible text in
    // every locale. A missing catalogue entry is that defect coming back.
    for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
      const origins = catalogue.automationStudio.origins as Record<string, string>;
      for (const origin of ALL_DATA_ORIGINS) {
        const key = ORIGIN_MESSAGE_KEY[origin];
        expect(origins[key], `${locale}.origins.${key}`).toBeTruthy();
      }
    }
  });

  it("derives the map, so it names no live origin in its own source", () => {
    // `phase109c1-invariants` forbids a live-origin literal anywhere in the
    // Studio outside the contract that declares the union, because such a
    // literal can only appear in an admit position. Deriving the map from
    // ALL_DATA_ORIGINS keeps the coverage without ever writing one.
    expect(ORIGIN_MESSAGE_KEY["live-readonly"]).toBe("liveReadonly");
    expect(ORIGIN_MESSAGE_KEY["live-controlled"]).toBe("liveControlled");
  });
});

describe("109-C-UI.1 · discipline and label coverage", () => {
  it("classifies every artifact kind, with no gap and no default", () => {
    for (const kind of ALL_KINDS) {
      expect(["plc", "hmi", "scada", "test", "document"], kind).toContain(disciplineOf(kind));
    }
  });

  it("gives every artifact kind a message key, so no raw union member reaches the reader", () => {
    // The kind was previously rendered verbatim ("hmi-faceplate") in all three
    // locales. A missing key here is that defect coming back.
    for (const kind of ALL_KINDS) {
      expect(KIND_MESSAGE_KEY[kind], kind).toBeTruthy();
    }
    expect(new Set(Object.values(KIND_MESSAGE_KEY)).size).toBe(ALL_KINDS.length);
  });

  it("covers every kind the fixture actually contains", () => {
    for (const artifact of project.artifacts) {
      expect(ALL_KINDS, artifact.name).toContain(artifact.kind);
    }
  });
});

describe("109-C-UI.1 · the projection is faithful to the fixture", () => {
  it("collects an HMI screen's bindings from the reference list, not from a copy", () => {
    const dossier = dossierFor("art-hmi-overview");
    expect(dossier.discipline).toBe("hmi");
    expect(dossier.bindings.map((r) => r.symbolName)).toEqual([
      "Motor_101_RunFb",
      "Motor_102_RunFb",
    ]);
    // Everything it holds is a reference that names this artifact. Nothing is
    // synthesised, so a reference the fixture does not carry cannot appear.
    for (const reference of [...dossier.reads, ...dossier.writes, ...dossier.bindings, ...dossier.alarms]) {
      expect(project.references).toContain(reference);
      expect(reference.artifactId).toBe("art-hmi-overview");
    }
  });

  it("separates a SCADA area's binding from its write, which is the seeded defect", () => {
    const dossier = dossierFor("art-scada-area");
    expect(dossier.discipline).toBe("scada");
    expect(dossier.bindings.map((r) => r.symbolName)).toEqual(["Line_01_AutoMode"]);
    // AES-C1-008: the area writes a symbol declared read-only. If the surface
    // folded writes into bindings, the reviewer would never see it.
    expect(dossier.writes.map((r) => r.symbolName)).toEqual(["Motor_101_RunFb"]);
  });

  it("reports an alarm list's alarm references", () => {
    const dossier = dossierFor("art-hmi-alarms");
    expect(dossier.alarms.map((r) => r.symbolName)).toEqual([
      "Motor_101_Fault",
      "Motor_101_Overload",
    ]);
    expect(dossier.bindings).toEqual([]);
  });

  it("lists the symbols a tag table declares, and only those", () => {
    const dossier = dossierFor("art-tags");
    expect(dossier.declaredSymbols.map((s) => s.name)).toEqual(["Line_01_SpareTag"]);
    for (const declaration of dossier.declaredSymbols) {
      expect(declaration.declaredIn).toBe("art-tags");
    }
  });

  it("orders references by line, so the surface reads top to bottom", () => {
    const dossier = dossierFor("art-hmi-motor");
    const lines = dossier.bindings.map((r) => r.line);
    expect([...lines].sort((a, b) => a - b)).toEqual(lines);
  });

  it("relates tests by the symbols the artifact actually touches", () => {
    // The overview screen binds Motor_101_RunFb, which two scenarios cover.
    const overview = dossierFor("art-hmi-overview");
    expect(overview.relatedTests.map((t) => t.id)).toEqual(["test-start", "test-timeout"]);

    // The document touches nothing, so it relates to nothing. An empty result
    // is the point: a surface that always found "related" tests would be
    // decoration, not a relationship.
    expect(dossierFor("art-doc-functional").relatedTests).toEqual([]);
    expect(dossierFor("art-doc-functional").referenceCount).toBe(0);
  });

  it("counts references as the sum of its four buckets", () => {
    for (const artifact of project.artifacts) {
      const d = buildArtifactDossier(project, artifact, DEMO_TESTS);
      expect(d.referenceCount, artifact.name).toBe(
        d.reads.length + d.writes.length + d.bindings.length + d.alarms.length,
      );
    }
  });

  it("is deterministic: two builds of the same artifact are structurally equal", () => {
    expect(dossierFor("art-scada-historian")).toEqual(dossierFor("art-scada-historian"));
  });
});

describe("109-C-UI.1 · the surface cannot fabricate plant data", () => {
  it("exposes no top-level field that could carry a value, state, series or geometry", () => {
    const dossier = dossierFor("art-hmi-trends");
    expect(Object.keys(dossier).sort()).toEqual([
      "alarms", "artifact", "bindings", "declaredSymbols", "discipline",
      "reads", "referenceCount", "relatedTests", "touchedSymbols", "writes",
    ]);
  });

  it("PROJECTS the artifact instead of passing the contract object through", () => {
    /*
     * THE DEFECT THIS REPLACES.
     *
     * The first version of this suite pinned only the dossier's own key set
     * while `dossier.artifact` was the `EngineeringArtifact` REFERENCE. A field
     * added to that interface - `currentValue`, `activeAlarms`, `lastReading` -
     * would have travelled straight through to every HMI and SCADA pane and
     * this test would still have been green, because it was measuring the wrong
     * object. A pinned key set on a pass-through proves nothing about what
     * passes through it.
     *
     * The control below is the one that matters: an artifact carrying
     * fabricated runtime fields goes IN, and the projection that comes out does
     * not have them. No contract change is needed to run it, and none was made.
     */
    const source = byId.get("art-hmi-overview")!;
    const contaminated = {
      ...source,
      currentValue: 41.7,
      activeAlarms: ["Motor_101_Fault"],
      lastReading: { at: 1, quality: "good" },
      isOnline: true,
    } as unknown as EngineeringArtifact;

    const dossier = buildArtifactDossier(project, contaminated, DEMO_TESTS);

    for (const fabricated of ["currentValue", "activeAlarms", "lastReading", "isOnline"]) {
      expect(Object.keys(dossier.artifact), fabricated).not.toContain(fabricated);
      expect(
        (dossier.artifact as unknown as Record<string, unknown>)[fabricated],
        fabricated,
      ).toBeUndefined();
    }
    // Not the same object, which is what makes the guarantee structural rather
    // than a promise about today's field list.
    expect(dossier.artifact).not.toBe(contaminated);
  });

  it("pins the artifact and provenance projections field by field", () => {
    const dossier = dossierFor("art-hmi-overview");
    expect(Object.keys(dossier.artifact).sort()).toEqual([...ARTIFACT_PROJECTION_KEYS]);
    expect(Object.keys(dossier.artifact.provenance!).sort()).toEqual([
      ...PROVENANCE_PROJECTION_KEYS,
    ]);
  });

  it("keeps every identity, provenance and lock field the surface needs", () => {
    // A narrowing that quietly dropped a field would be its own defect.
    const source = byId.get("art-doc-functional")!;
    const projected = dossierFor("art-doc-functional").artifact;
    expect(projected.id).toBe(source.id);
    expect(projected.path).toBe(source.path);
    expect(projected.name).toBe(source.name);
    expect(projected.kind).toBe(source.kind);
    expect(projected.version).toBe(source.version);
    expect(projected.checksum).toBe(source.checksum);
    expect(projected.modifiedBy).toBe(source.modifiedBy);
    expect(projected.readOnly).toBe(true);
    expect(projected.provenance?.origin).toBe(source.provenance.origin);
    expect(projected.provenance?.producer).toBe(source.provenance.producer);
    expect(projected.provenance?.disclosure).toBe(source.provenance.disclosure);
  });

  it("projects a provenance record that is also not the contract object", () => {
    const source = byId.get("art-hmi-faceplate")!;
    const projected = dossierFor("art-hmi-faceplate").artifact.provenance!;
    expect(projected).not.toBe(source.provenance);
    expect(projected.origin).toBe(source.provenance.origin);
  });

  it("never presents an artifact whose provenance claims a live origin", () => {
    for (const artifact of project.artifacts) {
      const origin = artifact.provenance?.origin;
      if (!origin) continue; // AES-C1-009 is a finding, not a crash
      expect(ALL_DATA_ORIGINS).toContain(origin);
      expect(["live-readonly", "live-controlled"], artifact.name).not.toContain(origin);
    }
  });

  it("reports a missing provenance record as missing, never as an empty one", () => {
    // Shift_Report is the fixture's seeded AES-C1-009. `null` is the honest
    // answer; an empty object would render as a record that says nothing.
    expect(dossierFor("art-scada-report").artifact.provenance).toBeNull();
  });
});
