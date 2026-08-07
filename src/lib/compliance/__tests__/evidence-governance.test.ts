/**
 * Phase 97 — evidence-pack canonicalization + readiness fold (pure).
 * Proves: SAME_SNAPSHOT_SAME_DATA_SAME_HASH=1, INPUT_ORDER_CHANGES_HASH=0,
 * ITEM_ORDER_CHANGES_HASH=0, DUPLICATE_ITEM_CHANGES_HASH=0, and the fail-closed readiness
 * precedence CONFIGURATION_REQUIRED > INSUFFICIENT_EVIDENCE > REVIEW_REQUIRED > COMPLETE.
 */
import { describe, it, expect } from "vitest";
import { foldReadiness, normalizeReadiness, isSafeSchemaVersion, isEvidenceScopeType } from "../evidence-governance";
import { buildEvidenceManifest } from "../evidence-pack-db";
import type { SafeEvidenceItem } from "../evidence-projections";

const ORG = "org-A";
const target = { incidentId: null, processingActivityId: null, privacyRequestId: null };
const item = (over: Partial<SafeEvidenceItem>): SafeEvidenceItem => ({
  entityType: "PROCESSING_ACTIVITY", entityId: "x", evidenceCode: "PROCESSING_ACTIVITY_RECORD",
  evidenceStatus: "COMPLETE", sourceVersion: null, sourceUpdatedAt: null, safeMetadata: { a: 1 }, ...over,
});

describe("foldReadiness — fail-closed precedence", () => {
  it("empty is INSUFFICIENT_EVIDENCE (never a silent COMPLETE)", () => {
    expect(foldReadiness([])).toBe("INSUFFICIENT_EVIDENCE");
  });
  it("returns the most-cautious present state", () => {
    expect(foldReadiness(["COMPLETE", "COMPLETE"])).toBe("COMPLETE");
    expect(foldReadiness(["COMPLETE", "REVIEW_REQUIRED"])).toBe("REVIEW_REQUIRED");
    expect(foldReadiness(["REVIEW_REQUIRED", "INSUFFICIENT_EVIDENCE"])).toBe("INSUFFICIENT_EVIDENCE");
    expect(foldReadiness(["INSUFFICIENT_EVIDENCE", "CONFIGURATION_REQUIRED", "COMPLETE"])).toBe("CONFIGURATION_REQUIRED");
  });
  it("maps unknown/malformed to CONFIGURATION_REQUIRED (never dropped)", () => {
    expect(normalizeReadiness("WHATEVER")).toBe("CONFIGURATION_REQUIRED");
    expect(foldReadiness(["COMPLETE", "??"])).toBe("CONFIGURATION_REQUIRED");
  });
});

describe("buildEvidenceManifest — deterministic canonical hash", () => {
  it("input order does not change the manifest hash", () => {
    const a = buildEvidenceManifest(ORG, "ORGANIZATION", target, [item({ entityId: "a" }), item({ entityId: "b" }), item({ entityId: "c" })]);
    const b = buildEvidenceManifest(ORG, "ORGANIZATION", target, [item({ entityId: "c" }), item({ entityId: "a" }), item({ entityId: "b" })]);
    expect(a.manifestHash).toBe(b.manifestHash);
    expect(a.manifestHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("duplicate items collapse and do not change the hash", () => {
    const base = buildEvidenceManifest(ORG, "ORGANIZATION", target, [item({ entityId: "a" }), item({ entityId: "b" })]);
    const dup = buildEvidenceManifest(ORG, "ORGANIZATION", target, [item({ entityId: "a" }), item({ entityId: "b" }), item({ entityId: "a" })]);
    expect(dup.manifest.itemCount).toBe(2);
    expect(dup.manifestHash).toBe(base.manifestHash);
  });
  it("different data yields a different hash; different org yields a different hash", () => {
    const a = buildEvidenceManifest(ORG, "ORGANIZATION", target, [item({ entityId: "a" })]);
    const b = buildEvidenceManifest(ORG, "ORGANIZATION", target, [item({ entityId: "a", evidenceStatus: "REVIEW_REQUIRED" })]);
    const c = buildEvidenceManifest("org-B", "ORGANIZATION", target, [item({ entityId: "a" })]);
    expect(a.manifestHash).not.toBe(b.manifestHash);
    expect(a.manifestHash).not.toBe(c.manifestHash);
  });
  it("readiness is the fold of item statuses; sequence is 1..N contiguous", () => {
    const r = buildEvidenceManifest(ORG, "ORGANIZATION", target, [item({ entityId: "a", evidenceStatus: "COMPLETE" }), item({ entityId: "b", evidenceStatus: "CONFIGURATION_REQUIRED" })]);
    expect(r.readiness).toBe("CONFIGURATION_REQUIRED");
    expect(r.manifest.items.map((i) => i.sequence)).toEqual([1, 2]);
  });
});

describe("schema-version + scope guards", () => {
  it("accepts safe versions, rejects unsafe", () => {
    expect(isSafeSchemaVersion("1.0")).toBe(true);
    expect(isSafeSchemaVersion("10.42")).toBe(true);
    expect(isSafeSchemaVersion("1")).toBe(false);
    expect(isSafeSchemaVersion("v1.0")).toBe(false);
    expect(isSafeSchemaVersion("1.0; DROP")).toBe(false);
  });
  it("recognizes only the closed scope vocabulary", () => {
    expect(isEvidenceScopeType("ORGANIZATION")).toBe(true);
    expect(isEvidenceScopeType("INCIDENT")).toBe(true);
    expect(isEvidenceScopeType("EVERYTHING")).toBe(false);
  });
});
