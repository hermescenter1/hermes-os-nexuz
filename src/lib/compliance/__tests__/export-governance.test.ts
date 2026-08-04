/**
 * Phase 97 Part G — export governance pure logic (I/O-free).
 * Lifecycle, parent eligibility, allow-listed collection (secret exclusion),
 * deterministic package + hash, tokens, and the disabled-execution / fail-closed
 * expiry posture.
 */
import { describe, it, expect } from "vitest";
import {
  EXPORT_TRANSITIONS, canTransitionExport, exportTransitionAction, isExecutorStep,
  isActiveExportLifecycle, isTerminalExportLifecycle, isKnownExportLifecycle,
  isExportExecutionEnabled, resolveExportExpiry, readExportExpiryPolicyConfig,
  assessParentExportEligibility,
} from "../export-lifecycle";
import { EXPORT_SOURCES, FORBIDDEN_EXPORT_FIELDS, collectExportSources, type ExportPrisma } from "../export-sources";
import { buildExportPackage, verifyExportPackage, computeExportContentHash } from "../export-package";
import { generateExportToken, hashExportToken, looksLikeExportToken } from "../export-token";
import { runGovernedExport } from "../export-executor";

describe("export lifecycle", () => {
  it("REQUESTED→AUTHORISED needs approve; other API transitions need manage", () => {
    expect(exportTransitionAction("REQUESTED", "AUTHORISED")).toBe("approve");
    expect(exportTransitionAction("REQUESTED", "CANCELLED")).toBe("manage");
    expect(exportTransitionAction("READY", "REVOKED")).toBe("manage");
  });
  it("executor steps are NOT API-callable transitions", () => {
    expect(exportTransitionAction("AUTHORISED", "COLLECTING")).toBeNull();
    expect(isExecutorStep("AUTHORISED", "COLLECTING")).toBe(true);
    expect(isExecutorStep("PACKAGING", "READY")).toBe(true);
  });
  it("rejects invalid/self transitions and unknown states", () => {
    expect(canTransitionExport("REQUESTED", "READY")).toBe(false);
    expect(canTransitionExport("READY", "READY")).toBe(false);
    expect(isKnownExportLifecycle("BOGUS")).toBe(false);
  });
  it("terminal states have no outgoing transitions; active set is correct", () => {
    for (const t of ["EXPIRED", "FAILED", "REVOKED", "CANCELLED"]) { expect(EXPORT_TRANSITIONS[t as keyof typeof EXPORT_TRANSITIONS]).toEqual([]); expect(isTerminalExportLifecycle(t)).toBe(true); }
    expect(isActiveExportLifecycle("READY")).toBe(true);
    expect(isActiveExportLifecycle("REVIEW_REQUIRED")).toBe(false);
  });
  it("legacy REVIEW_REQUIRED can only be CANCELLED (never auto-authorised)", () => {
    expect(EXPORT_TRANSITIONS.REVIEW_REQUIRED).toEqual(["CANCELLED"]);
  });
});

describe("parent eligibility (fail-closed)", () => {
  const ok = { requestType: "DATA_EXPORT", status: "APPROVED", identityVerifiedAt: new Date() };
  it("accepts an approved, identity-verified, export-typed parent", () => { expect(assessParentExportEligibility(ok).ok).toBe(true); });
  it("rejects an incompatible type / unapproved / unverified parent", () => {
    expect(assessParentExportEligibility({ ...ok, requestType: "OBJECTION" }).code).toBe("PARENT_TYPE_INCOMPATIBLE");
    expect(assessParentExportEligibility({ ...ok, status: "IN_REVIEW" }).code).toBe("PARENT_NOT_APPROVED");
    expect(assessParentExportEligibility({ ...ok, identityVerifiedAt: null }).code).toBe("IDENTITY_NOT_VERIFIED");
  });
});

describe("execution posture + expiry policy", () => {
  it("execution is disabled by default", () => {
    expect(isExportExecutionEnabled({})).toBe(false);
    expect(isExportExecutionEnabled({ COMPLIANCE_EXPORT_EXECUTION_ENABLED: "true" })).toBe(true);
  });
  it("no configured retention → CONFIGURATION_REQUIRED, no expiry", () => {
    expect(resolveExportExpiry(null, new Date()).status).toBe("CONFIGURATION_REQUIRED");
    expect(readExportExpiryPolicyConfig({}).retentionDays).toBeUndefined();
    const cfg = readExportExpiryPolicyConfig({ COMPLIANCE_EXPORT_RETENTION_DAYS: "7" });
    expect(resolveExportExpiry(cfg, new Date("2026-01-01T00:00:00Z")).expiresAt?.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });
});

// A synthetic Prisma that HONOURS `select` (projects rows to the selected keys) —
// so a secret column present in storage is never returned when it isn't selected.
function selectingDb(store: Record<string, Record<string, unknown>[]>): ExportPrisma {
  const captured: Array<{ model: string; where: Record<string, unknown>; select: Record<string, boolean> }> = [];
  const make = (model: string) => ({
    findMany: async (args: unknown) => {
      const { where = {}, select = {} } = (args ?? {}) as { where?: Record<string, unknown>; select?: Record<string, boolean> };
      captured.push({ model, where, select });
      const rows = (store[model] ?? []).filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
      const keys = Object.keys(select).filter((k) => select[k]);
      return rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])));
    },
  });
  const db: ExportPrisma = { user: make("user"), organizationMember: make("organizationMember"), privacyRequest: make("privacyRequest"), legalAcceptance: make("legalAcceptance"), consentRecord: make("consentRecord") };
  (db as unknown as { __captured: typeof captured }).__captured = captured;
  return db;
}

describe("allow-listed collection excludes every secret", () => {
  it("no source includes a forbidden field", () => {
    for (const s of EXPORT_SOURCES) for (const f of FORBIDDEN_EXPORT_FIELDS) expect(s.includedFields).not.toContain(f);
  });
  it("a passwordHash present on the user row is NEVER collected (select-based projection)", async () => {
    const db = selectingDb({ user: [{ id: "u1", name: "N", email: "e@x.com", emailVerified: true, createdAt: new Date(), passwordHash: "HASH", tokenVersion: 3 }] });
    const collected = await collectExportSources(db, { userId: "u1", candidateId: null, organizationId: "org-A" });
    const profile = collected.find((c) => c.name === "user_profile")!;
    expect(profile.records[0]).not.toHaveProperty("passwordHash");
    expect(profile.records[0]).not.toHaveProperty("tokenVersion");
    expect(JSON.stringify(collected)).not.toContain("HASH");
    // every collector query is subject-scoped.
    const cap = (db as unknown as { __captured: Array<{ where: Record<string, unknown> }> }).__captured;
    expect(cap.every((c) => c.where.userId === "u1" || c.where.id === "u1")).toBe(true);
  });
  it("collectors return nothing for a non-user (candidate) subject", async () => {
    const db = selectingDb({});
    const collected = await collectExportSources(db, { userId: null, candidateId: "c1", organizationId: "org-A" });
    expect(collected.every((c) => c.records.length === 0)).toBe(true);
  });
});

describe("deterministic package + hash", () => {
  const sources = [{ name: "user_profile", schemaVersion: "1.0", includedFields: ["id"], excludedFields: [], redactionRules: [], records: [{ id: "u1" }] }];
  const meta = { exportRequestId: "e1", privacyRequestId: "p1", subjectClass: "USER", organizationScope: "org-A", locale: "en", generatedAt: new Date("2026-01-01"), expiry: { status: "CONFIGURATION_REQUIRED", expiresAt: null } };
  it("same synthetic input → same content hash (apart from generatedAt)", () => {
    const a = buildExportPackage(sources, meta);
    const b = buildExportPackage(sources, { ...meta, generatedAt: new Date("2027-05-05") });
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.manifest.schemaVersion).toBe("1.0");
    expect(a.manifest.sources[0].recordCount).toBe(1);
  });
  it("the hash detects mutation of packaged content", () => {
    const pkg = buildExportPackage(sources, meta);
    expect(verifyExportPackage(pkg)).toBe(true);
    pkg.documents.user_profile.push({ id: "INJECTED" });
    expect(verifyExportPackage(pkg)).toBe(false);
  });
  it("hash is stable regardless of key ordering", () => {
    const h1 = computeExportContentHash("USER", "org-A", "en", [{ name: "s", schemaVersion: "1.0", includedFields: [], excludedFields: [], redactionRules: [], records: [{ a: 1, b: 2 }] }]);
    const h2 = computeExportContentHash("USER", "org-A", "en", [{ name: "s", schemaVersion: "1.0", includedFields: [], excludedFields: [], redactionRules: [], records: [{ b: 2, a: 1 }] }]);
    expect(h1).toBe(h2);
  });
});

describe("download token", () => {
  it("plaintext ≠ hash; hash is deterministic; only the hash is storable", () => {
    const { plaintext, hash } = generateExportToken();
    expect(plaintext).not.toBe(hash);
    expect(hashExportToken(plaintext)).toBe(hash);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(looksLikeExportToken(plaintext)).toBe(true);
    expect(looksLikeExportToken("../etc")).toBe(false);
  });
});

describe("executor (EXPORT_SECRET_LEAK=0)", () => {
  it("collects, packages and stores without any secret leaking", async () => {
    const db = selectingDb({
      user: [{ id: "u1", name: "N", email: "e@x.com", emailVerified: true, createdAt: new Date("2026-01-01"), passwordHash: "SECRET-HASH" }],
      consentRecord: [{ userId: "u1", organizationId: "org-A", consentType: "analytics", consentVersion: "1.0", granted: true, locale: "en", createdAt: new Date("2026-01-01"), ipAddress: "10.0.0.9" }],
    });
    const stored: Record<string, string> = {};
    const storage = { provider: "local" as const, put: async ({ key, body }: { key: string; body: unknown }) => { stored[key] = String(body); return { key, sizeBytes: String(body).length }; }, get: async () => null, delete: async () => {}, exists: async () => false };
    const res = await runGovernedExport({ db, storage, exportRequestId: "e1", privacyRequestId: "p1", subject: { userId: "u1", candidateId: null, organizationId: "org-A" }, subjectClass: "USER", locale: "en", expiryConfig: null, now: new Date("2026-01-01") });
    expect(res.packageKey).toBe("exports/e1/package.json");
    expect(res.expiryStatus).toBe("CONFIGURATION_REQUIRED");
    const serialised = stored[res.packageKey];
    expect(serialised).not.toContain("SECRET-HASH");
    expect(serialised).not.toContain("10.0.0.9"); // raw IP excluded
    expect(res.recordCounts.consent_records).toBe(1);
  });
});
