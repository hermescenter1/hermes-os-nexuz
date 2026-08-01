import { describe, it, expect } from "vitest";
import {
  isProtectedAction,
  resolveRetentionDays,
  retentionCutoff,
  sweepAuditRetention,
  PROTECTED_ACTION_PREFIXES,
  DEFAULT_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
} from "../audit-retention";

describe("Phase 92 — audit retention policy (pure)", () => {
  it("protects security/compliance actions from deletion at any age", () => {
    expect(isProtectedAction("login.failure")).toBe(true);
    expect(isProtectedAction("auth.refresh")).toBe(true);
    expect(isProtectedAction("site.access.denied")).toBe(true);
    expect(isProtectedAction("org.ownership.transferred")).toBe(true);
    expect(isProtectedAction("billing.payment.recorded")).toBe(true);
    expect(isProtectedAction("api.key.revoked")).toBe(true);
    expect(isProtectedAction("security.refresh_replay")).toBe(true);
    // ordinary actions are eligible
    expect(isProtectedAction("case.updated")).toBe(false);
    expect(isProtectedAction("knowledge.query")).toBe(false);
  });

  it("clamps the retention window to a safe floor and default", () => {
    expect(resolveRetentionDays(undefined)).toBe(DEFAULT_RETENTION_DAYS);
    expect(resolveRetentionDays(10)).toBe(MIN_RETENTION_DAYS); // below floor → floor
    expect(resolveRetentionDays(730)).toBe(730);
    expect(resolveRetentionDays(NaN)).toBe(DEFAULT_RETENTION_DAYS);
  });

  it("computes the cutoff relative to the given clock", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    const cutoff = retentionCutoff(now, 30);
    expect(cutoff.toISOString()).toBe("2026-07-02T00:00:00.000Z");
  });

  it("dry-run is the default and deletes nothing (session mode / no DB)", async () => {
    const report = await sweepAuditRetention();
    expect(report.dryRun).toBe(true);
    expect(report.deleted).toBe(0);
    expect(report.batches).toBe(0);
    // no DB in the unit environment → nothing to sweep
    expect(report.storageMode).toBe("unavailable");
    expect(report.protectedPrefixes).toEqual([...PROTECTED_ACTION_PREFIXES]);
  });

  it("never throws on hostile options", async () => {
    await expect(
      sweepAuditRetention({ dryRun: false, retentionDays: -5, batchSize: -1, maxBatches: 0 }),
    ).resolves.toBeDefined();
  });
});
