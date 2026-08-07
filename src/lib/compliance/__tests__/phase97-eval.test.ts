/**
 * PHASE 97 — offline compliance-governance evaluation (deterministic, no network, no DB,
 * no secrets). One result per invariant group; a single machine-readable summary line;
 * fail-closed (any group failing fails the suite). Invoked by
 * scripts/ci/phase97-compliance-governance-eval.mjs (npm run eval:phase97).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { foldReadiness } from "../evidence-governance";
import { buildEvidenceManifest } from "../evidence-pack-db";
import {
  projectProcessingActivity, projectPrivacyRequest, projectLegalDocument, projectRetentionPolicy,
  projectLegalHold, projectDataExportRequest, projectDataDeletionRequest, projectSubprocessor,
  projectDataTransfer, projectComplianceIncident, type SafeEvidenceItem,
} from "../evidence-projections";
import { createEvidencePackSchema } from "../evidence-schema";

const ROOT = resolve(__dirname, "..", "..", "..", "..");
const routeDir = resolve(ROOT, "src/app/api/compliance");
const results: Record<string, boolean> = {};
function group(name: string, fn: () => void) {
  it(name, () => { fn(); results[name] = true; });
}
const noForbidden = (i: SafeEvidenceItem, forbidden: string[]) => {
  const blob = JSON.stringify(i);
  return forbidden.every((f) => !blob.includes(f));
};

describe("PHASE 97 — compliance governance invariant groups", () => {
  group("PROCESSING_INVENTORY", () => {
    const i = projectProcessingActivity({ id: "a", legalBasisStatus: "CONFIGURATION_REQUIRED" });
    expect(i.evidenceStatus).toBe("CONFIGURATION_REQUIRED");
    expect(noForbidden(i, ["name", "purpose", "description"])).toBe(true);
  });
  group("PRIVACY_REQUEST_LIFECYCLE", () => {
    expect(projectPrivacyRequest({ id: "p", status: "COMPLETED" }).evidenceStatus).toBe("COMPLETE");
    expect(noForbidden(projectPrivacyRequest({ id: "p", status: "PENDING" }), ["email", "ipAddress", "userAgent", "description"])).toBe(true);
  });
  group("LEGAL_DOCUMENT_GOVERNANCE", () => {
    const i = projectLegalDocument({ id: "d", lifecycle: "PUBLISHED", version: "1.0" });
    expect(i.evidenceStatus).toBe("COMPLETE");
    expect(noForbidden(i, ["content", "title"])).toBe(true);
  });
  group("RETENTION_AND_LEGAL_HOLDS", () => {
    expect(projectRetentionPolicy({ id: "r" }).evidenceStatus).toBe("CONFIGURATION_REQUIRED"); // no retentionDays
    expect(projectLegalHold({ id: "h", status: "ACTIVE" }).evidenceStatus).toBe("COMPLETE");
  });
  group("SUBJECT_EXPORT_GOVERNANCE", () => {
    expect(noForbidden(projectDataExportRequest({ id: "e", lifecycle: "DELIVERED" }), ["email", "packageKey", "downloadUrl"])).toBe(true);
  });
  group("SUBJECT_ERASURE_GOVERNANCE", () => {
    expect(noForbidden(projectDataDeletionRequest({ id: "x", lifecycle: "COMPLETED" }), ["planJson", "email", "reason"])).toBe(true);
  });
  group("SUBPROCESSOR_AND_TRANSFER_GOVERNANCE", () => {
    expect(noForbidden(projectSubprocessor({ id: "s", lifecycle: "APPROVED" }), ["legalEntity", "name"])).toBe(true);
    expect(projectDataTransfer({ id: "t", transferMechanismStatus: "CONFIGURATION_REQUIRED" }).evidenceStatus).toBe("CONFIGURATION_REQUIRED");
  });
  group("COMPLIANCE_INCIDENTS", () => {
    const i = projectComplianceIncident({ id: "i", lifecycle: "OPEN", summaryCode: "SEC_REVIEW" });
    expect(JSON.stringify(i).includes("sensitiveSummary")).toBe(false);
    expect(JSON.stringify(i).includes("SEC_REVIEW")).toBe(true);
  });
  group("COMPLIANCE_EVIDENCE_PACKS", () => {
    const mk = (over: Partial<SafeEvidenceItem>): SafeEvidenceItem => ({ entityType: "X", entityId: "a", evidenceCode: "C", evidenceStatus: "COMPLETE", sourceVersion: null, sourceUpdatedAt: null, safeMetadata: {}, ...over });
    const a = buildEvidenceManifest("o", "ORGANIZATION", { incidentId: null, processingActivityId: null, privacyRequestId: null }, [mk({ entityId: "a" }), mk({ entityId: "b" })]);
    const b = buildEvidenceManifest("o", "ORGANIZATION", { incidentId: null, processingActivityId: null, privacyRequestId: null }, [mk({ entityId: "b" }), mk({ entityId: "a" }), mk({ entityId: "a" })]);
    expect(a.manifestHash).toBe(b.manifestHash);            // order + dedup invariant
    expect(foldReadiness([])).toBe("INSUFFICIENT_EVIDENCE"); // fail-closed
    createEvidencePackSchema.parse({ scopeType: "ORGANIZATION" }); // strict schema accepts a valid minimal input
    expect(createEvidencePackSchema.safeParse({ scopeType: "ORGANIZATION", organizationId: "x" }).success).toBe(false); // rejects client org
  });
  group("COMPLIANCE_UI_LOCALIZATION", () => {
    const leaves = (o: Record<string, unknown>, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => v && typeof v === "object" ? leaves(v as Record<string, unknown>, p + k + ".") : [p + k]);
    const e = leaves((en as Record<string, unknown>).complianceCenter as Record<string, unknown>).sort();
    const f = leaves((fa as Record<string, unknown>).complianceCenter as Record<string, unknown>).sort();
    const d = leaves((de as Record<string, unknown>).complianceCenter as Record<string, unknown>).sort();
    expect(f).toEqual(e); expect(d).toEqual(e); expect(e.length).toBeGreaterThan(60);
  });
  group("TENANT_ISOLATION", () => {
    // EVERY evidence-pack route file (discovered dynamically — no hardcoded list) must
    // derive the org server-side and predicate on it; there is NO public/guardless route.
    const evDir = resolve(routeDir, "evidence-packs");
    const routeFiles: string[] = [];
    const findRoutes = (dir: string) => {
      for (const n of readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, n.name);
        if (n.isDirectory()) findRoutes(p);
        else if (n.name === "route.ts") routeFiles.push(p);
      }
    };
    findRoutes(evDir);
    expect(routeFiles.length).toBeGreaterThanOrEqual(4);
    for (const f of routeFiles) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} must be guarded`).toContain("requireComplianceOrgScope");
      expect(src, `${f} must predicate on the server-derived org`).toContain("scope.organizationId");
    }
  });
  group("AUDIT_HYGIENE", () => {
    // Evidence audit metadata carries only ids/enums/counts/hash — never manifest content or personal data.
    const revoke = readFileSync(resolve(routeDir, "evidence-packs/[id]/revoke/route.ts"), "utf8");
    expect(revoke).toContain("recordAuditEvent");
    expect(/manifestJson|safeMetadata|sensitiveSummary|email/.test(revoke)).toBe(false);
  });
  group("MIGRATION_INTEGRITY", () => {
    const mig = resolve(ROOT, "prisma/migrations/20260820000017_phase97_compliance_evidence_packs/migration.sql");
    expect(existsSync(mig)).toBe(true);
    // Strip `--` comments (which legitimately NAME the forbidden operations) before scanning.
    const sql = readFileSync(mig, "utf8").split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
    expect(/DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i.test(sql)).toBe(false); // additive only
    expect(sql).toContain("compliance_evidence_pack_item_immutable"); // immutability trigger present
  });
  group("DESTRUCTIVE_EXECUTION_DISABLED", () => {
    // The evidence-pack service never hard-deletes; the client exposes no destructive control.
    const svc = readFileSync(resolve(ROOT, "src/lib/compliance/evidence-pack-db.ts"), "utf8");
    expect(/\.delete\(|\.deleteMany\(|DROP |TRUNCATE/.test(svc)).toBe(false);
    const client = readFileSync(resolve(ROOT, "src/components/compliance/ComplianceCenterClient.tsx"), "utf8");
    expect(/method:\s*["']DELETE["']/i.test(client)).toBe(false);
  });

  it("ALL invariant groups pass (fail-closed summary)", () => {
    const groups = ["PROCESSING_INVENTORY", "PRIVACY_REQUEST_LIFECYCLE", "LEGAL_DOCUMENT_GOVERNANCE", "RETENTION_AND_LEGAL_HOLDS", "SUBJECT_EXPORT_GOVERNANCE", "SUBJECT_ERASURE_GOVERNANCE", "SUBPROCESSOR_AND_TRANSFER_GOVERNANCE", "COMPLIANCE_INCIDENTS", "COMPLIANCE_EVIDENCE_PACKS", "COMPLIANCE_UI_LOCALIZATION", "TENANT_ISOLATION", "AUDIT_HYGIENE", "MIGRATION_INTEGRITY", "DESTRUCTIVE_EXECUTION_DISABLED"];
    const summary = { phase: "97", groups: Object.fromEntries(groups.map((g) => [g, results[g] === true ? "PASS" : "FAIL"])), overall: groups.every((g) => results[g] === true) ? "PASS" : "FAIL" };
    console.log("PHASE97_EVAL_SUMMARY " + JSON.stringify(summary));
    expect(summary.overall).toBe("PASS");
    for (const g of groups) expect(results[g], `${g} did not run/pass`).toBe(true);
  });
});
