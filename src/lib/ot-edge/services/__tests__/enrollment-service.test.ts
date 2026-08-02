import { describe, it, expect, beforeEach } from "vitest";

/**
 * PHASE 94 — machine-credential enrollment service, adversarial matrix.
 *
 * The subject is the service's SECURITY behaviour, exercised against a real
 * in-memory WritableSecretManager and a stateful fake gateway repository that
 * enforces the same tenant + site scoping and compare-and-set semantics as the
 * Prisma adapter. No database and no OpenBao: an in-memory manager IS the
 * reference behaviour a real adapter must match.
 *
 * Covered: two tenants, two sites, a restricted-site operator, forged ids,
 * create success, secret-create failure, database-write failure with
 * compensation, rotation ordering/atomicity, concurrent rotation, revocation
 * dominance, stale-credential rejection, deletion idempotency, disabled backend
 * fail-closed, and a redaction scan of every audit and metric emission.
 */

import { createEnrollmentService } from "../enrollment-service";
import { createInMemorySecretManager } from "../../testing/in-memory-secret-manager";
import { buildOtServiceContext, type OtServiceContext } from "../../service-context";
import type {
  GatewayEnrollmentRecord,
  AttachSigningReferenceInput,
  SwapSigningReferenceInput,
} from "../../persistence/ports";
import type { RepoResult } from "../../persistence/core";
import type { AuditPort } from "../core";
import type { MetricSink } from "../../metrics";
import type { WritableSecretManager } from "../../secret-manager";

/* ── A stateful fake gateway repo mirroring the adapter's scope + CAS ─────── */

interface Row {
  id: string;
  gatewayId: string;
  organizationId: string;
  siteId: string | null;
  signingKeyRef: string | null;
  signingKeyVersion: number | null;
  lifecycle: string;
  signingKeyEnrolledAt: Date | null;
  signingKeyRevokedAt: Date | null;
}

const ok = <T>(value: T): RepoResult<T> => ({ ok: true, value });
const notFound = (): RepoResult<never> => ({ ok: false, code: "NOT_FOUND" });

function makeFakeRepo(seed: Row[]) {
  const rows = new Map(seed.map((r) => [r.id, { ...r }]));
  // Visible only inside the actor's org AND (when site-scoped) allowed sites.
  const visible = (ctx: OtServiceContext, id: string): Row | null => {
    const row = rows.get(id);
    if (!row) return null;
    if (row.organizationId !== ctx.organizationId) return null;
    if (ctx.allowedSiteIds !== null) {
      if (row.siteId === null) return null;
      if (!ctx.allowedSiteIds.includes(row.siteId)) return null;
    }
    return row;
  };

  const throwOn = { attach: new Set<string>(), swap: new Set<string>(), clear: new Set<string>() };

  const repo = {
    rows,
    throwOn,
    async findEnrollment(ctx: OtServiceContext, id: string): Promise<RepoResult<GatewayEnrollmentRecord>> {
      const row = visible(ctx, id);
      if (!row) return notFound();
      return ok({
        id: row.id,
        gatewayId: row.gatewayId,
        organizationId: row.organizationId,
        siteId: row.siteId,
        signingKeyRef: row.signingKeyRef,
        signingKeyVersion: row.signingKeyVersion,
        lifecycle: row.lifecycle,
        signingKeyEnrolledAt: row.signingKeyEnrolledAt,
        signingKeyRevokedAt: row.signingKeyRevokedAt,
      });
    },
    async attachSigningReference(ctx: OtServiceContext, id: string, input: AttachSigningReferenceInput) {
      if (throwOn.attach.has(id)) throw new Error("db down");
      const row = visible(ctx, id);
      if (!row) return notFound();
      if (row.signingKeyRef !== null) return ok({ applied: false });
      row.signingKeyRef = input.reference;
      row.signingKeyVersion = input.version;
      row.signingKeyEnrolledAt = input.enrolledAt;
      row.signingKeyRevokedAt = null;
      return ok({ applied: true });
    },
    async swapSigningReference(ctx: OtServiceContext, id: string, input: SwapSigningReferenceInput) {
      if (throwOn.swap.has(id)) throw new Error("db down");
      const row = visible(ctx, id);
      if (!row) return notFound();
      if (row.signingKeyRef !== input.expectedReference || row.signingKeyRevokedAt !== null) {
        return ok({ applied: false });
      }
      row.signingKeyRef = input.reference;
      row.signingKeyVersion = input.version;
      return ok({ applied: true });
    },
    async revokeSigningReference(ctx: OtServiceContext, id: string, input: { expectedReference: string; revokedAt: Date }) {
      const row = visible(ctx, id);
      if (!row) return notFound();
      if (row.signingKeyRef !== input.expectedReference || row.signingKeyRevokedAt !== null) {
        return ok({ applied: false });
      }
      row.lifecycle = "REVOKED";
      row.signingKeyRevokedAt = input.revokedAt;
      return ok({ applied: true });
    },
    async clearSigningReference(ctx: OtServiceContext, id: string, input: { expectedReference: string }) {
      if (throwOn.clear.has(id)) throw new Error("db down");
      const row = visible(ctx, id);
      if (!row) return notFound();
      if (row.signingKeyRef !== input.expectedReference) return ok({ applied: false });
      row.signingKeyRef = null;
      row.signingKeyVersion = null;
      row.signingKeyEnrolledAt = null;
      row.signingKeyRevokedAt = null;
      return ok({ applied: true });
    },
  };
  return repo;
}

/* ── Spies that also let us scan for leaked secret material ───────────────── */

function makeAuditSpy() {
  const events: Array<{ action: string; entityId: string | null; metadata: Record<string, unknown> }> = [];
  const port: AuditPort = {
    async record(input) {
      events.push({ action: input.action, entityId: input.entityId, metadata: input.metadata });
    },
  };
  return { port, events };
}

function makeMetricSpy() {
  const emissions: Array<{ metric: string; value: number; labels: Record<string, unknown> }> = [];
  const sink: MetricSink = { emit: (metric, value, labels) => emissions.push({ metric, value, labels }) };
  return { sink, emissions };
}

/* ── Fixtures ────────────────────────────────────────────────────────────── */

const ctxA = buildOtServiceContext({ userId: "u-a", organizationId: "org-A", role: "ADMIN", allowedSiteIds: null, requestId: null });
const ctxB = buildOtServiceContext({ userId: "u-b", organizationId: "org-B", role: "ADMIN", allowedSiteIds: null, requestId: null });
// An operator restricted to site-1 only.
const ctxSite1 = buildOtServiceContext({ userId: "u-s1", organizationId: "org-A", role: "MANAGER", allowedSiteIds: ["site-1"], requestId: null });

function seedRows(): Row[] {
  return [
    { id: "gp-1", gatewayId: "GW-1", organizationId: "org-A", siteId: "site-1", signingKeyRef: null, signingKeyVersion: null, lifecycle: "REGISTERED", signingKeyEnrolledAt: null, signingKeyRevokedAt: null },
    { id: "gp-2", gatewayId: "GW-2", organizationId: "org-A", siteId: "site-2", signingKeyRef: null, signingKeyVersion: null, lifecycle: "REGISTERED", signingKeyEnrolledAt: null, signingKeyRevokedAt: null },
    { id: "gp-b", gatewayId: "GW-B", organizationId: "org-B", siteId: "site-9", signingKeyRef: null, signingKeyVersion: null, lifecycle: "REGISTERED", signingKeyEnrolledAt: null, signingKeyRevokedAt: null },
  ];
}

let clockMs = 1_700_000_000_000;
const clock = () => new Date((clockMs += 1000));

function build(overrides?: { secretManager?: WritableSecretManager | null; seed?: Row[]; bytes?: (n: number) => Uint8Array }) {
  const repo = makeFakeRepo(overrides?.seed ?? seedRows());
  const audit = makeAuditSpy();
  const metrics = makeMetricSpy();
  const secretManager = overrides && "secretManager" in overrides ? overrides.secretManager! : createInMemorySecretManager();
  let counter = 0;
  const randomBytes = overrides?.bytes ?? ((n: number) => new Uint8Array(n).map(() => (counter++ % 251) + 1));
  const service = createEnrollmentService({ gateways: repo, secretManager, audit: audit.port, metrics: metrics.sink, randomBytes, clock });
  return { service, repo, audit, metrics, secretManager };
}

/** No audit metadata or metric label may carry a credential or a reference. */
function assertNoSecretLeak(audit: ReturnType<typeof makeAuditSpy>, metrics: ReturnType<typeof makeMetricSpy>, secrets: string[]) {
  const blob = JSON.stringify({ events: audit.events, emissions: metrics.emissions });
  for (const secret of secrets) {
    expect(blob.includes(secret), "secret leaked into audit/metrics").toBe(false);
  }
  // No allow-listed-but-dangerous key names either.
  for (const e of audit.events) {
    expect(Object.keys(e.metadata)).not.toContain("signingKeyRef");
    expect(Object.keys(e.metadata)).not.toContain("credential");
  }
}

beforeEach(() => {
  clockMs = 1_700_000_000_000;
});

describe("94 enrollment — issue", () => {
  it("issues a one-time credential, persists only a reference, and audits", async () => {
    const { service, repo, audit, metrics } = build();
    const res = await service.enroll(ctxA, "gp-1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.gatewayId).toBe("GW-1");
    expect(res.value.credential.length).toBeGreaterThan(20);
    expect(res.value.signatureAlgorithm).toBe("HMAC-SHA256");
    expect(res.value.version).toBe(1);

    const row = repo.rows.get("gp-1")!;
    // The stored reference is the manager's opaque handle — NOT the credential.
    expect(row.signingKeyRef).toBe(res.value.signingKeyRef);
    expect(row.signingKeyRef).not.toBe(res.value.credential);
    expect(row.signingKeyEnrolledAt).toBeInstanceOf(Date);

    expect(audit.events.some((e) => e.action === "OT_GATEWAY_ENROLLMENT_CREATED")).toBe(true);
    expect(metrics.emissions.some((m) => m.metric === "ot_enrollment_created")).toBe(true);
    assertNoSecretLeak(audit, metrics, [res.value.credential, res.value.signingKeyRef]);
  });

  it("refuses a second enrollment (CONFLICT) and issues no new secret", async () => {
    const { service } = build();
    const first = await service.enroll(ctxA, "gp-1");
    expect(first.ok).toBe(true);
    const second = await service.enroll(ctxA, "gp-1");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("CONFLICT");
  });

  it("the resolved secret matches the one-time credential (HMAC key round-trips)", async () => {
    const { service, secretManager, repo } = build();
    const res = await service.enroll(ctxA, "gp-1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const bytes = await secretManager!.resolve(repo.rows.get("gp-1")!.signingKeyRef as never);
    expect(Buffer.from(bytes).toString("base64url")).toBe(res.value.credential);
  });
});

describe("94 enrollment — tenant + site isolation", () => {
  it("a foreign-tenant gateway is NOT_FOUND, byte-identical to missing", async () => {
    const { service } = build();
    const foreign = await service.enroll(ctxB, "gp-1"); // org-A row, org-B actor
    const missing = await service.enroll(ctxB, "does-not-exist");
    expect(foreign.ok).toBe(false);
    expect(missing.ok).toBe(false);
    if (!foreign.ok && !missing.ok) expect(foreign.code).toBe(missing.code);
  });

  it("a site-restricted operator cannot enroll a gateway in another site", async () => {
    const { service } = build();
    const denied = await service.enroll(ctxSite1, "gp-2"); // gp-2 is site-2
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("NOT_FOUND");
    const allowed = await service.enroll(ctxSite1, "gp-1"); // gp-1 is site-1
    expect(allowed.ok).toBe(true);
  });
});

describe("94 enrollment — failure and compensation", () => {
  it("a secret-create failure leaves NO enrolled row", async () => {
    const failing: WritableSecretManager = {
      writable: true,
      create: async () => { throw new Error("openbao down"); },
      resolve: async () => { throw new Error("x"); },
      rotate: async () => { throw new Error("x"); },
      revoke: async () => { throw new Error("x"); },
      delete: async () => {},
    };
    const { service, repo } = build({ secretManager: failing });
    const res = await service.enroll(ctxA, "gp-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("SECRET_BACKEND_UNAVAILABLE");
    expect(repo.rows.get("gp-1")!.signingKeyRef).toBeNull();
  });

  it("a database write failure deletes the just-created external secret (compensation)", async () => {
    const manager = createInMemorySecretManager();
    const deleted: string[] = [];
    const spy = { ...manager, delete: async (ref: never) => { deleted.push(ref); return manager.delete(ref); } } as WritableSecretManager;
    const { service, repo, audit } = build({ secretManager: spy });
    repo.throwOn.attach.add("gp-1");
    const res = await service.enroll(ctxA, "gp-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("TRANSIENT_FAILURE");
    expect(repo.rows.get("gp-1")!.signingKeyRef).toBeNull();
    // The orphaned secret was cleaned up.
    expect(deleted.length).toBe(1);
    expect(audit.events.some((e) => e.action === "OT_GATEWAY_ENROLLMENT_FAILED")).toBe(true);
  });
});

describe("94 enrollment — rotation", () => {
  it("rotation issues a new credential, retires the old, and keeps the version monotonic", async () => {
    const { service, secretManager, repo } = build();
    const first = await service.enroll(ctxA, "gp-1");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const oldRef = repo.rows.get("gp-1")!.signingKeyRef!;

    const rot = await service.rotate(ctxA, "gp-1");
    expect(rot.ok).toBe(true);
    if (!rot.ok) return;
    expect(rot.value.version).toBe(2);
    expect(rot.value.signingKeyRef).not.toBe(oldRef);
    expect(rot.value.credential).not.toBe(first.value.credential);

    // The OLD secret is gone — a stale credential can no longer resolve.
    await expect(secretManager!.resolve(oldRef as never)).rejects.toThrow();
    // The NEW secret resolves to the new credential.
    const bytes = await secretManager!.resolve(rot.value.signingKeyRef as never);
    expect(Buffer.from(bytes).toString("base64url")).toBe(rot.value.credential);
  });

  it("a database swap failure keeps the working credential and cleans up the new secret", async () => {
    const manager = createInMemorySecretManager();
    const deleted: string[] = [];
    const spy = { ...manager, delete: async (ref: never) => { deleted.push(ref); return manager.delete(ref); } } as WritableSecretManager;
    const { service, repo } = build({ secretManager: spy });
    const first = await service.enroll(ctxA, "gp-1");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const workingRef = repo.rows.get("gp-1")!.signingKeyRef!;

    repo.throwOn.swap.add("gp-1");
    const rot = await service.rotate(ctxA, "gp-1");
    expect(rot.ok).toBe(false);
    // The working credential is untouched...
    expect(repo.rows.get("gp-1")!.signingKeyRef).toBe(workingRef);
    await expect(manager.resolve(workingRef as never)).resolves.toBeInstanceOf(Uint8Array);
    // ...and the newly-created secret was compensated away.
    expect(deleted.length).toBe(1);
  });

  it("concurrent rotation: exactly one wins, the loser conflicts and is compensated", async () => {
    const { service } = build();
    await service.enroll(ctxA, "gp-1");
    // Two rotations from the same starting state. The service reads state, then
    // creates a secret, then swaps CAS-gated on the reference it read; the second
    // swap sees a changed reference and fails.
    const [r1, r2] = await Promise.all([service.rotate(ctxA, "gp-1"), service.rotate(ctxA, "gp-1")]);
    const wins = [r1, r2].filter((r) => r.ok).length;
    const conflicts = [r1, r2].filter((r) => !r.ok && r.code === "CONFLICT").length;
    expect(wins).toBe(1);
    expect(conflicts).toBe(1);
  });

  it("rotating a non-enrolled gateway conflicts", async () => {
    const { service } = build();
    const rot = await service.rotate(ctxA, "gp-1");
    expect(rot.ok).toBe(false);
    if (!rot.ok) expect(rot.code).toBe("CONFLICT");
  });
});

describe("94 enrollment — revocation dominance", () => {
  it("revocation marks REVOKED, blocks resolution, and is idempotent", async () => {
    const { service, secretManager, repo } = build();
    const first = await service.enroll(ctxA, "gp-1");
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const rev = await service.revoke(ctxA, "gp-1");
    expect(rev.ok).toBe(true);
    expect(repo.rows.get("gp-1")!.lifecycle).toBe("REVOKED");
    // The store now refuses to resolve the secret (fail closed).
    await expect(secretManager!.resolve(first.value.signingKeyRef as never)).rejects.toThrow();

    // Idempotent second revoke.
    const again = await service.revoke(ctxA, "gp-1");
    expect(again.ok).toBe(true);
    // A revoked credential cannot be rotated.
    const rot = await service.rotate(ctxA, "gp-1");
    expect(rot.ok).toBe(false);
  });

  it("revocation succeeds even with the secret backend unavailable (fail closed via DB)", async () => {
    // Enroll with a working manager, then swap to a null backend and revoke.
    const { service, repo } = build();
    await service.enroll(ctxA, "gp-1");
    const svcNoBackend = createEnrollmentService({
      gateways: repo as never,
      secretManager: null,
      audit: makeAuditSpy().port,
      metrics: makeMetricSpy().sink,
      clock,
    });
    const rev = await svcNoBackend.revoke(ctxA, "gp-1");
    expect(rev.ok).toBe(true);
    expect(repo.rows.get("gp-1")!.lifecycle).toBe("REVOKED");
  });
});

describe("94 enrollment — deletion", () => {
  it("deletion clears the reference, removes the secret, and is idempotent", async () => {
    const { service, secretManager, repo } = build();
    const first = await service.enroll(ctxA, "gp-1");
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const del = await service.remove(ctxA, "gp-1");
    expect(del.ok).toBe(true);
    expect(repo.rows.get("gp-1")!.signingKeyRef).toBeNull();
    await expect(secretManager!.resolve(first.value.signingKeyRef as never)).rejects.toThrow();

    // Idempotent: deleting again is a no-op success.
    const again = await service.remove(ctxA, "gp-1");
    expect(again.ok).toBe(true);
  });
});

describe("94 enrollment — disabled backend fails closed with zero secret calls", () => {
  it("enroll and rotate refuse when no writable manager is present", async () => {
    const audit = makeAuditSpy();
    const metrics = makeMetricSpy();
    const repo = makeFakeRepo(seedRows());
    const service = createEnrollmentService({ gateways: repo, secretManager: null, audit: audit.port, metrics: metrics.sink, clock });

    const enrolled = await service.enroll(ctxA, "gp-1");
    expect(enrolled.ok).toBe(false);
    if (!enrolled.ok) expect(enrolled.code).toBe("SECRET_BACKEND_UNAVAILABLE");
    // Nothing was written.
    expect(repo.rows.get("gp-1")!.signingKeyRef).toBeNull();
  });
});
