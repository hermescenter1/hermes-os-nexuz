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
import { buildExportPackage, verifyExportPackage, computeExportContentHash, computeExportPackageHash, isSha256Hex, parseAndValidateExportPackage } from "../export-package";
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
  const ok = { requestType: "DATA_EXPORT", status: "APPROVED", identityVerifiedAt: new Date(), userId: "u1", candidateId: null as string | null };
  it("accepts an approved, identity-verified, USER-subject, export-typed parent", () => { expect(assessParentExportEligibility(ok).ok).toBe(true); });
  it("rejects a Candidate / missing-user subject BEFORE anything else (Finding 5)", () => {
    expect(assessParentExportEligibility({ ...ok, userId: null }).code).toBe("EXPORT_SUBJECT_CLASS_UNSUPPORTED");
    expect(assessParentExportEligibility({ ...ok, candidateId: "c1" }).code).toBe("EXPORT_SUBJECT_CLASS_UNSUPPORTED");
  });
  it("PARTIALLY_APPROVED and FULFILMENT_IN_PROGRESS are fail-closed (Finding 4)", () => {
    expect(assessParentExportEligibility({ ...ok, status: "PARTIALLY_APPROVED" }).code).toBe("PARENT_SCOPE_CONFIGURATION_REQUIRED");
    expect(assessParentExportEligibility({ ...ok, status: "FULFILMENT_IN_PROGRESS" }).code).toBe("PARENT_NOT_APPROVED");
  });
  it("rejects an incompatible type / unapproved / unverified parent", () => {
    expect(assessParentExportEligibility({ ...ok, requestType: "OBJECTION" }).code).toBe("PARENT_TYPE_INCOMPATIBLE");
    expect(assessParentExportEligibility({ ...ok, status: "IN_REVIEW" }).code).toBe("PARENT_NOT_APPROVED");
    expect(assessParentExportEligibility({ ...ok, identityVerifiedAt: null }).code).toBe("IDENTITY_NOT_VERIFIED");
  });
});

describe("source scope (Finding 1) — tenant-bearing sources declare + enforce an org predicate", () => {
  it("every tenant-bearing source has an org predicate in its query", async () => {
    const { EXPORT_SOURCES, TENANT_BEARING_SCOPES } = await import("../export-sources");
    for (const s of EXPORT_SOURCES) {
      if (!TENANT_BEARING_SCOPES.includes(s.scope)) continue;
      const captured: Array<Record<string, unknown>> = [];
      const db = { user: cap(captured), organizationMember: cap(captured), privacyRequest: cap(captured), legalAcceptance: cap(captured), consentRecord: cap(captured) };
      await s.collect(db as never, { userId: "u1", candidateId: null, organizationId: "org-A" });
      const where = captured[0] as { organizationId?: unknown; OR?: unknown };
      const hasOrgPredicate = where.organizationId !== undefined || Array.isArray(where.OR);
      expect(hasOrgPredicate).toBe(true);
    }
  });
  it("legal_acceptances restricts to global OR the current org (never a foreign tenant)", async () => {
    const { EXPORT_SOURCES } = await import("../export-sources");
    const captured: Array<Record<string, unknown>> = [];
    const db = { legalAcceptance: cap(captured) };
    await EXPORT_SOURCES.find((s) => s.name === "legal_acceptances")!.collect(db as never, { userId: "u1", candidateId: null, organizationId: "org-A" });
    const where = captured[0] as { userId: string; OR: Array<Record<string, unknown>> };
    expect(where.userId).toBe("u1");
    expect(where.OR).toEqual([{ organizationId: null }, { organizationId: "org-A" }]);
  });
});
function cap(store: Array<Record<string, unknown>>) { return { findMany: async (a: unknown) => { store.push(((a ?? {}) as { where?: Record<string, unknown> }).where ?? {}); return []; } }; }

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

describe("deterministic package + hash (DETERMINISTIC_EXPORT_PACKAGE=PASS)", () => {
  const src = (records: Record<string, unknown>[]) => [{ name: "user_profile", schemaVersion: "1.0", scope: "GLOBAL_SUBJECT" as const, includedFields: ["id"], excludedFields: [], redactionRules: [], records }];
  const sources = src([{ id: "u1" }]);
  const meta = { exportRequestId: "e1", privacyRequestId: "p1", subjectClass: "USER", organizationScope: "org-A", locale: "en", generatedAt: new Date("2026-01-01"), expiry: { status: "CONFIGURATION_REQUIRED", expiresAt: null } };
  it("same synthetic input → same content hash (apart from generatedAt)", () => {
    const a = buildExportPackage(sources, meta);
    const b = buildExportPackage(sources, { ...meta, generatedAt: new Date("2027-05-05") });
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.manifest.sources[0].recordCount).toBe(1);
  });
  it("records returned in OPPOSITE order produce identical hash AND identical bytes (Finding 7)", () => {
    const fwd = buildExportPackage(src([{ id: "a" }, { id: "b" }, { id: "c" }]), meta);
    const rev = buildExportPackage(src([{ id: "c" }, { id: "b" }, { id: "a" }]), meta);
    expect(rev.contentHash).toBe(fwd.contentHash);
    expect(JSON.stringify(rev.documents)).toBe(JSON.stringify(fwd.documents));
  });
  it("adding / mutating a record changes the hash", () => {
    const base = buildExportPackage(src([{ id: "a" }]), meta);
    expect(buildExportPackage(src([{ id: "a" }, { id: "b" }]), meta).contentHash).not.toBe(base.contentHash);
    expect(buildExportPackage(src([{ id: "MUT" }]), meta).contentHash).not.toBe(base.contentHash);
  });
  it("the hash detects mutation of packaged content", () => {
    const pkg = buildExportPackage(sources, meta);
    expect(verifyExportPackage(pkg)).toBe(true);
    pkg.documents.user_profile.push({ id: "INJECTED" });
    expect(verifyExportPackage(pkg)).toBe(false);
  });
  it("hash is stable regardless of key ordering", () => {
    const mk = (r: Record<string, unknown>) => computeExportContentHash("USER", "org-A", "en", [{ name: "s", schemaVersion: "1.0", scope: "GLOBAL_SUBJECT", includedFields: [], excludedFields: [], redactionRules: [], records: [r] }]);
    expect(mk({ a: 1, b: 2 })).toBe(mk({ b: 2, a: 1 }));
  });
});

// A registry-consistent package (real user_profile source contract) — the strict
// parser validates every source against the closed registry, so fixtures must use
// the real included/excluded/redaction contract and a matching authoritative expiry.
const UP = EXPORT_SOURCES.find((s) => s.name === "user_profile")!;
const EXPIRES = new Date("2027-01-01T00:00:00.000Z");
function registryPkg(over?: { records?: Record<string, unknown>[]; privacyRequestId?: string | null; organizationScope?: string | null; generatedAt?: Date }) {
  return buildExportPackage(
    [{ name: UP.name, schemaVersion: UP.schemaVersion, scope: UP.scope, includedFields: UP.includedFields, excludedFields: UP.excludedFields, redactionRules: UP.redactionRules, records: over?.records ?? [{ id: "u1", name: "N", email: "e@x.com", emailVerified: true, createdAt: "2026-01-01T00:00:00.000Z" }] }],
    { exportRequestId: "e1", privacyRequestId: over?.privacyRequestId ?? "p1", subjectClass: "USER", organizationScope: over?.organizationScope ?? "org-A", locale: "en", generatedAt: over?.generatedAt ?? new Date("2026-01-01"), expiry: { status: "CONFIGURED", expiresAt: EXPIRES } },
  );
}
function expectedFor(pkg: ReturnType<typeof registryPkg>) {
  return { exportRequestId: "e1", privacyRequestId: "p1", organizationScope: "org-A", subjectUserId: "subj-1", subjectClass: "USER", schemaVersion: "1.0", jobContentHash: pkg.contentHash, jobPackageHash: computeExportPackageHash(pkg), expiresAt: EXPIRES };
}

describe("full-envelope package hash (Finding 3)", () => {
  it("packageHash is a SHA-256 hex and is stable for identical envelopes", () => {
    const a = registryPkg(); const b = registryPkg();
    expect(isSha256Hex(computeExportPackageHash(a))).toBe(true);
    expect(computeExportPackageHash(a)).toBe(computeExportPackageHash(b));
  });
  it("packageHash changes when an evidence-bearing manifest field changes (but contentHash may not)", () => {
    const base = registryPkg();
    const baseHash = computeExportPackageHash(base);
    // generatedAt is in the envelope (time-bound) but NOT in contentHash.
    const laterGen = registryPkg({ generatedAt: new Date("2027-05-05") });
    expect(laterGen.contentHash).toBe(base.contentHash);           // content unchanged
    expect(computeExportPackageHash(laterGen)).not.toBe(baseHash); // envelope changed
    // Mutating an evidence-bearing manifest field (scope) changes packageHash.
    const scopeTampered = JSON.parse(JSON.stringify(base)); scopeTampered.manifest.sources[0].scope = "CURRENT_ORGANIZATION";
    expect(computeExportPackageHash(scopeTampered)).not.toBe(baseHash);
    // Mutating recordCount changes packageHash.
    const countTampered = JSON.parse(JSON.stringify(base)); countTampered.manifest.sources[0].recordCount = 99;
    expect(computeExportPackageHash(countTampered)).not.toBe(baseHash);
  });
});

describe("strict package validation + full-envelope integrity (Finding 3)", () => {
  const pkg = registryPkg();
  const bytes = Buffer.from(JSON.stringify(pkg));
  const expected = expectedFor(pkg);
  const tamper = (fn: (p: Record<string, unknown>) => void) => { const p = JSON.parse(bytes.toString()); fn(p); return Buffer.from(JSON.stringify(p)); };

  it("accepts a well-formed, correctly-bound, hash-matching package", () => {
    expect(parseAndValidateExportPackage(bytes, expected).ok).toBe(true);
  });
  it("rejects a missing / malformed package", () => {
    expect(parseAndValidateExportPackage(null, expected)).toMatchObject({ ok: false, code: "PACKAGE_NOT_FOUND" });
    expect(parseAndValidateExportPackage(Buffer.from("not json"), expected)).toMatchObject({ ok: false, code: "PACKAGE_INVALID" });
  });
  it("rejects a structurally incomplete authoritative job (missing packageHash / hashes / bindings)", () => {
    expect(parseAndValidateExportPackage(bytes, { ...expected, jobPackageHash: null })).toMatchObject({ ok: false, code: "PACKAGE_INVALID" });
    expect(parseAndValidateExportPackage(bytes, { ...expected, jobContentHash: null })).toMatchObject({ ok: false, code: "PACKAGE_INVALID" });
    expect(parseAndValidateExportPackage(bytes, { ...expected, privacyRequestId: null })).toMatchObject({ ok: false, code: "PACKAGE_INVALID" });
    expect(parseAndValidateExportPackage(bytes, { ...expected, subjectUserId: null })).toMatchObject({ ok: false, code: "PACKAGE_INVALID" });
    expect(parseAndValidateExportPackage(bytes, { ...expected, expiresAt: null })).toMatchObject({ ok: false, code: "PACKAGE_INVALID" });
  });
  it("rejects a binding mismatch (foreign org / request)", () => {
    expect(parseAndValidateExportPackage(bytes, { ...expected, organizationScope: "org-B" })).toMatchObject({ ok: false, code: "PACKAGE_BINDING_MISMATCH" });
    expect(parseAndValidateExportPackage(bytes, { ...expected, exportRequestId: "eX" })).toMatchObject({ ok: false, code: "PACKAGE_BINDING_MISMATCH" });
  });
  it("rejects an expiry mismatch between manifest and authoritative job", () => {
    expect(parseAndValidateExportPackage(bytes, { ...expected, expiresAt: new Date("2099-01-01T00:00:00.000Z") })).toMatchObject({ ok: false, code: "PACKAGE_BINDING_MISMATCH" });
    expect(parseAndValidateExportPackage(tamper((p) => { (p.manifest as { expiry: { expiresAt: string } }).expiry.expiresAt = "2050-01-01T00:00:00.000Z"; }), expected)).toMatchObject({ ok: false, code: "PACKAGE_BINDING_MISMATCH" });
  });
  it("rejects a hash mismatch vs the authoritative content/package hash, and tampered content", () => {
    expect(parseAndValidateExportPackage(bytes, { ...expected, jobContentHash: "0".repeat(64) })).toMatchObject({ ok: false, code: "PACKAGE_HASH_MISMATCH" });
    expect(parseAndValidateExportPackage(bytes, { ...expected, jobPackageHash: "0".repeat(64) })).toMatchObject({ ok: false, code: "PACKAGE_HASH_MISMATCH" });
    expect(parseAndValidateExportPackage(tamper((p) => { ((p.documents as Record<string, unknown[]>).user_profile).push({ id: "INJECTED" }); }), expected)).toMatchObject({ ok: false, code: "PACKAGE_INVALID" }); // record-count mismatch caught first
  });
  it("rejects source-contract tampering (scope / redaction / included fields)", () => {
    expect(parseAndValidateExportPackage(tamper((p) => { (p.manifest as { sources: { scope: string }[] }).sources[0].scope = "CURRENT_ORGANIZATION"; }), expected)).toMatchObject({ ok: false, code: "PACKAGE_INVALID" });
    expect(parseAndValidateExportPackage(tamper((p) => { (p.manifest as { sources: { redactionRules: string[] }[] }).sources[0].redactionRules = ["none"]; }), expected)).toMatchObject({ ok: false, code: "PACKAGE_INVALID" });
    expect(parseAndValidateExportPackage(tamper((p) => { (p.manifest as { sources: { includedFields: string[] }[] }).sources[0].includedFields = ["id"]; }), expected)).toMatchObject({ ok: false, code: "PACKAGE_INVALID" });
  });
  it("rejects an incorrect recordCount", () => {
    expect(parseAndValidateExportPackage(tamper((p) => { (p.manifest as { sources: { recordCount: number }[] }).sources[0].recordCount = 5; }), expected)).toMatchObject({ ok: false, code: "PACKAGE_INVALID" });
  });
  it("rejects an unknown or duplicate source", () => {
    expect(parseAndValidateExportPackage(tamper((p) => { (p.manifest as { sources: unknown[] }).sources.push({ name: "ghost_source", schemaVersion: "1.0", scope: "GLOBAL_SUBJECT", recordCount: 0, includedFields: [], excludedFields: [], redactionRules: [] }); }), expected)).toMatchObject({ ok: false, code: "PACKAGE_INVALID" });
    expect(parseAndValidateExportPackage(tamper((p) => { const s = (p.manifest as { sources: unknown[] }).sources; s.push(JSON.parse(JSON.stringify(s[0]))); }), expected)).toMatchObject({ ok: false, code: "PACKAGE_INVALID" });
    expect(parseAndValidateExportPackage(tamper((p) => { (p.documents as Record<string, unknown>).ghost_source = [{ x: 1 }]; }), expected)).toMatchObject({ ok: false, code: "PACKAGE_INVALID" });
  });
  it("malformed nested source data returns PACKAGE_INVALID and never throws", () => {
    for (const mut of [
      (p: Record<string, unknown>) => { (p.manifest as { sources: unknown }).sources = "not-an-array"; },
      (p: Record<string, unknown>) => { (p.manifest as { sources: unknown[] }).sources[0] = "not-an-object"; },
      (p: Record<string, unknown>) => { (p.documents as Record<string, unknown>).user_profile = "not-an-array"; },
      (p: Record<string, unknown>) => { (p.documents as Record<string, unknown[]>).user_profile = [42 as unknown as Record<string, unknown>]; },
      (p: Record<string, unknown>) => { (p.manifest as { generatedAt: unknown }).generatedAt = "not-a-date"; },
      (p: Record<string, unknown>) => { (p.manifest as { expiry: unknown }).expiry = null; },
      (p: Record<string, unknown>) => { delete (p as { manifest?: unknown }).manifest; },
    ]) {
      const r = parseAndValidateExportPackage(tamper(mut), expected);
      expect(r).toMatchObject({ ok: false, code: "PACKAGE_INVALID" });
    }
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
    expect(isSha256Hex(res.packageHash)).toBe(true);              // full-envelope integrity (Finding 3)
    expect(res.packageHash).toBe(computeExportPackageHash(res.pkg));
    const serialised = stored[res.packageKey];
    expect(serialised).not.toContain("SECRET-HASH");
    expect(serialised).not.toContain("10.0.0.9"); // raw IP excluded
    expect(res.recordCounts.consent_records).toBe(1);
  });
});
