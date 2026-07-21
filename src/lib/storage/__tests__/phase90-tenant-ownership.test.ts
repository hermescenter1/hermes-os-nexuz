import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ownerWhere,
  ownerCanRead,
  ownerAttribution,
  isLegacyQuarantined,
  legacyQuarantineWhere,
  MAX_OWNED_ROWS,
} from "../owner-scope";
import { verifySession, signSession, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/crypto";
import type { BrainOwner } from "../types";

/**
 * PHASE 90 — Industrial Brain tenant ownership + session lifetime.
 *
 * The session-storage repositories are exercised directly (they share the same
 * owner predicate as the SQL path), plus the predicate itself, which is what
 * the Prisma `where` clause is built from.
 */

const ALICE: BrainOwner = { userId: "u-alice", orgId: "org-a" };
const BOB: BrainOwner = { userId: "u-bob", orgId: "org-b" };
/** Same org as Alice, different user — an org colleague. */
const ANNA: BrainOwner = { userId: "u-anna", orgId: "org-a" };
/** No organization at all. */
const SOLO: BrainOwner = { userId: "u-solo", orgId: null };

describe("90A — owner predicate", () => {
  it("builds a query clause, never a post-fetch filter", () => {
    const w = ownerWhere(ALICE);
    expect(w.OR).toEqual([{ userId: "u-alice" }, { organizationId: "org-a" }]);
    // 90-93A: the quarantined legacy pool is NOT part of an ordinary read.
    expect(JSON.stringify(w)).not.toContain("null");
  });

  it("a user with no org contributes no organization clause", () => {
    expect(ownerWhere(SOLO).OR).toEqual([{ userId: "u-solo" }]);
  });

  it("a null owner matches NOTHING — never the legacy pool, never everything", () => {
    const w = ownerWhere(null);
    // An impossible sentinel, not `{}` (which would match every row) and not
    // the legacy predicate (which would expose unattributable data).
    expect(w.OR).toHaveLength(1);
    expect(w.OR[0].userId).toMatch(/no_owner/);
    expect(ownerCanRead({ userId: "u-alice", organizationId: "org-a" }, null)).toBe(false);
    expect(ownerCanRead({ userId: null, organizationId: null }, null)).toBe(false);
  });

  it("same-tenant reads succeed; cross-tenant reads fail", () => {
    const aliceRow = { userId: "u-alice", organizationId: "org-a" };
    expect(ownerCanRead(aliceRow, ALICE)).toBe(true);
    expect(ownerCanRead(aliceRow, ANNA), "org colleague may read").toBe(true);
    expect(ownerCanRead(aliceRow, BOB), "other tenant must not read").toBe(false);
    expect(ownerCanRead(aliceRow, SOLO), "no-org user must not read").toBe(false);
  });

  it("legacy NULL-owner rows are QUARANTINED from every ordinary caller", () => {
    // Pre-Phase-90 rows cannot be attributed to a tenant, so serving them to
    // "every authoring user" would be the cross-tenant exposure this module
    // exists to prevent. Deny by default; recovery is an audited admin action.
    const legacy = { userId: null, organizationId: null };
    for (const who of [ALICE, BOB, ANNA, SOLO, null]) {
      expect(ownerCanRead(legacy, who), "legacy row must be invisible").toBe(false);
    }
    expect(isLegacyQuarantined(legacy)).toBe(true);
    expect(isLegacyQuarantined({ userId: "u-alice", organizationId: null })).toBe(false);
    expect(isLegacyQuarantined({ userId: null, organizationId: "org-a" })).toBe(false);
  });

  it("the quarantine predicate exists for administrative recovery only", () => {
    // It must select exactly the unattributable rows — and it must not be
    // reachable from `ownerWhere`, which is what ordinary reads use.
    expect(legacyQuarantineWhere()).toEqual({ userId: null, organizationId: null });
    expect(JSON.stringify(ownerWhere(ALICE))).not.toContain("null");
  });

  it("attribution derives from the owner and is never blank for a real session", () => {
    expect(ownerAttribution(ALICE)).toEqual({ userId: "u-alice", organizationId: "org-a" });
    expect(ownerAttribution(SOLO)).toEqual({ userId: "u-solo", organizationId: null });
    expect(ownerAttribution(null)).toEqual({ userId: null, organizationId: null });
  });
});

describe("90A — analysis repository is tenant-scoped end to end", () => {
  beforeEach(() => {
    (globalThis as unknown as { __hermesAnalysisRows?: unknown[] }).__hermesAnalysisRows = [];
    vi.resetModules();
  });

  async function repoFor(owner: BrainOwner | null) {
    const { analysisRepository } = await import("../analysis-repository");
    return analysisRepository(owner);
  }

  const draft = {
    query: "PLC fault", locale: "en", mode: "full", domains: [], vendors: [],
    cases: [], knowledge: [], confidence: 0.8, riskLevel: "low", isUnknown: false,
  };

  it("saved analysis inherits the authenticated owner's attribution", async () => {
    const rec = await (await repoFor(ALICE)).create(draft);
    expect(rec.userId).toBe("u-alice");
    expect(rec.organizationId).toBe("org-a");
  });

  it("a caller cannot forge attribution through the input payload", async () => {
    const forged = { ...draft, userId: "u-bob", organizationId: "org-b" } as typeof draft;
    const rec = await (await repoFor(ALICE)).create(forged);
    expect(rec.userId, "server context wins over client input").toBe("u-alice");
    expect(rec.organizationId).toBe("org-a");
  });

  it("cross-tenant read, update and delete all fail; same-tenant succeeds", async () => {
    const mine = await (await repoFor(ALICE)).create(draft);

    const bob = await repoFor(BOB);
    expect(await bob.get(mine.id), "cross-tenant read").toBeNull();
    expect(await bob.update(mine.id, { query: "hijacked" }), "cross-tenant update").toBeNull();
    expect(await bob.delete(mine.id), "cross-tenant delete").toBe(false);
    expect((await bob.list()).some((r) => r.id === mine.id), "cross-tenant list").toBe(false);

    const anna = await repoFor(ANNA);
    expect(await anna.get(mine.id), "org colleague read").not.toBeNull();

    const alice = await repoFor(ALICE);
    expect(await alice.get(mine.id)).not.toBeNull();
    expect(await alice.delete(mine.id)).toBe(true);
  });

  it("an inaccessible id is indistinguishable from a missing one (no existence leak)", async () => {
    const mine = await (await repoFor(ALICE)).create(draft);
    const bob = await repoFor(BOB);
    expect(await bob.get(mine.id)).toEqual(await bob.get("does-not-exist"));
  });

  it("owner attribution is not patchable", async () => {
    const repo = await repoFor(ALICE);
    const mine = await repo.create(draft);
    const patched = await repo.update(mine.id, {
      organizationId: "org-b", userId: "u-bob",
    } as Partial<typeof draft>);
    expect(patched?.userId).toBe("u-alice");
    expect(patched?.organizationId).toBe("org-a");
  });

  it("a QUARANTINED legacy analysis is invisible to every operation", async () => {
    // Simulate a pre-Phase-90 row: written before ownership columns existed.
    const buf = (globalThis as unknown as { __hermesAnalysisRows: Record<string, unknown>[] })
      .__hermesAnalysisRows;
    buf.unshift({ ...draft, id: "legacy-1", createdAt: new Date().toISOString(), userId: null, organizationId: null });

    for (const [label, owner] of [["owner A", ALICE], ["owner B", BOB], ["no-org user", SOLO]] as const) {
      const repo = await repoFor(owner);
      expect((await repo.list()).some((r) => r.id === "legacy-1"), `${label}: list`).toBe(false);
      expect(await repo.get("legacy-1"), `${label}: read`).toBeNull();
      expect(await repo.update("legacy-1", { query: "x" }), `${label}: update`).toBeNull();
      expect(await repo.delete("legacy-1"), `${label}: delete`).toBe(false);
    }
    // …and the row still exists — quarantined, not destroyed.
    expect(buf.some((r) => r.id === "legacy-1")).toBe(true);
  });

  it("a quarantined row is indistinguishable from a missing one (no existence leak)", async () => {
    const buf = (globalThis as unknown as { __hermesAnalysisRows: Record<string, unknown>[] })
      .__hermesAnalysisRows;
    buf.unshift({ ...draft, id: "legacy-2", createdAt: new Date().toISOString(), userId: null, organizationId: null });
    const repo = await repoFor(ALICE);
    expect(await repo.get("legacy-2")).toEqual(await repo.get("never-existed"));
  });

  it("list is bounded", async () => {
    const repo = await repoFor(ALICE);
    for (let i = 0; i < MAX_OWNED_ROWS + 25; i += 1) await repo.create(draft);
    expect((await repo.list()).length).toBeLessThanOrEqual(MAX_OWNED_ROWS);
  });
});

describe("90A — case repository ownership and published corpus", () => {
  beforeEach(() => {
    (globalThis as unknown as { __hermesCaseDrafts?: unknown[] }).__hermesCaseDrafts = [];
    vi.resetModules();
  });

  const caseDraft = {
    title: "Drive overheating", vendor: "Siemens", domain: "drives", problem: "p",
    rootCause: "r", secondaryCauses: [], verificationSteps: [], correctiveActions: [],
    safetyNotes: "", tags: [], confidence: 80, status: "draft" as const,
  };

  async function repoFor(owner: BrainOwner | null) {
    const { caseRepository } = await import("../case-repository");
    return caseRepository(owner);
  }

  it("saved case inherits tenant/user attribution", async () => {
    const c = await (await repoFor(ALICE)).create(caseDraft);
    expect(c.userId).toBe("u-alice");
    expect(c.organizationId).toBe("org-a");
  });

  it("cross-tenant update and delete fail", async () => {
    const mine = await (await repoFor(ALICE)).create(caseDraft);
    const bob = await repoFor(BOB);
    expect(await bob.update(mine.id, { title: "stolen" })).toBeNull();
    expect(await bob.delete(mine.id)).toBe(false);
    // and the original is untouched
    expect((await (await repoFor(ALICE)).get(mine.id))?.title).toBe(caseDraft.title);
  });

  it("title dedupe never resolves onto a PUBLISHED case", async () => {
    const repo = await repoFor(ALICE);
    const published = await repo.create({ ...caseDraft, status: "published" });
    expect(published.status).toBe("published");
    // The save-case flow updates whatever findByTitle returns — it must not
    // return the published row, or curated public content gets overwritten.
    expect(await repo.findByTitle!(caseDraft.title)).toBeNull();
  });

  it("a QUARANTINED legacy case is invisible to authoring users", async () => {
    const buf = (globalThis as unknown as { __hermesCaseDrafts: Record<string, unknown>[] })
      .__hermesCaseDrafts;
    const now = new Date().toISOString();
    buf.unshift({ ...caseDraft, id: "legacy-case", createdAt: now, updatedAt: now, userId: null, organizationId: null });

    for (const owner of [ALICE, BOB, SOLO]) {
      const repo = await repoFor(owner);
      expect((await repo.list()).some((c) => c.id === "legacy-case")).toBe(false);
      expect(await repo.get("legacy-case")).toBeNull();
      expect(await repo.update("legacy-case", { title: "x" })).toBeNull();
      expect(await repo.delete("legacy-case")).toBe(false);
      expect(await repo.findByTitle!(caseDraft.title)).toBeNull();
    }
  });

  it("a legacy PUBLISHED case stays publicly readable (published-only policy)", async () => {
    const buf = (globalThis as unknown as { __hermesCaseDrafts: Record<string, unknown>[] })
      .__hermesCaseDrafts;
    const now = new Date().toISOString();
    // Public knowledge does not depend on tenant attribution — quarantine must
    // not silently remove already-published content from the public corpus.
    buf.unshift({ ...caseDraft, id: "legacy-pub", status: "published", createdAt: now, updatedAt: now, userId: null, organizationId: null });

    const { listPublishedCases } = await import("../case-repository");
    expect((await listPublishedCases()).some((c) => c.id === "legacy-pub")).toBe(true);
  });

  it("published corpus stays public across tenants (intended public knowledge)", async () => {
    await (await repoFor(ALICE)).create({ ...caseDraft, status: "published" });
    await (await repoFor(BOB)).create({ ...caseDraft, title: "Other", status: "published" });
    await (await repoFor(ALICE)).create({ ...caseDraft, title: "Private draft" });

    const { listPublishedCases } = await import("../case-repository");
    const published = await listPublishedCases();
    expect(published.length, "both tenants' published cases are public").toBe(2);
    expect(published.every((c) => c.status === "published"), "drafts stay private").toBe(true);
    expect(published.some((c) => c.title === "Private draft")).toBe(false);
  });
});

describe("90B — legacy session cookie has a server-side lifetime", () => {
  const original = process.env.AUTH_SECRET;
  beforeEach(() => { (process.env as Record<string, string | undefined>).AUTH_SECRET = "test-secret-phase90"; });
  afterEach(() => { (process.env as Record<string, string | undefined>).AUTH_SECRET = original; });

  const payload = { userId: "u1", email: "a@b.c", role: "admin", name: "A" };

  it("accepts a fresh token", () => {
    const t = signSession({ ...payload, iat: Date.now() });
    expect(verifySession(t)?.userId).toBe("u1");
  });

  it("rejects a token older than the absolute ceiling (replay of a captured cookie)", () => {
    const ancient = Date.now() - (SESSION_MAX_AGE_SECONDS + 60) * 1000;
    expect(verifySession(signSession({ ...payload, iat: ancient }))).toBeNull();
  });

  it("still accepts a remember-me-aged token just inside the ceiling", () => {
    const nearly = Date.now() - (SESSION_MAX_AGE_SECONDS - 3600) * 1000;
    expect(verifySession(signSession({ ...payload, iat: nearly }))?.role).toBe("admin");
  });

  it("rejects missing, malformed and future-dated iat (fails closed)", () => {
    for (const iat of [0, -1, Number.NaN, Date.now() + 10 * 60 * 1000]) {
      expect(verifySession(signSession({ ...payload, iat }))).toBeNull();
    }
    expect(verifySession(signSession({ ...payload } as never))).toBeNull();
  });

  it("still rejects a tampered signature", () => {
    const t = signSession({ ...payload, iat: Date.now() });
    expect(verifySession(t.slice(0, -3) + "aaa")).toBeNull();
  });
});

describe("90 — source guarantees", () => {
  const read = (p: string) =>
    readFileSync(resolve(process.cwd(), p), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

  it("brain/case repositories never fetch globally then filter", () => {
    for (const p of ["src/lib/storage/analysis-repository.ts", "src/lib/storage/case-repository.ts"]) {
      const code = read(p);
      // every DB read carries the owner predicate (or is the explicit public read)
      expect(code).toMatch(/ownerWhere\(owner\)/);
      expect(code, "no unbounded findMany").not.toMatch(/findMany\(\{\s*orderBy[^}]*\}\s*\)/);
      expect(code, "no findUnique bypassing the owner predicate").not.toMatch(/findUnique/);
    }
  });

  it("the public published read is explicitly named, bounded and status-filtered", () => {
    const code = read("src/lib/storage/case-repository.ts");
    expect(code).toMatch(/export async function listPublishedCases/);
    expect(code).toMatch(/status: "published"/);
    expect(code).toMatch(/MAX_PUBLISHED_ROWS/);
  });

  it("the owner is never taken from client input", () => {
    const code = read("src/lib/storage/brain-owner.ts");
    expect(code).toMatch(/getCurrentUser/);
    expect(code, "no request body/query parsing in owner resolution")
      .not.toMatch(/req\.|request\.|searchParams|\.json\(\)|body/);
    expect(code, "org scope requires an ACTIVE membership").toMatch(/status: "ACTIVE"/);
  });
});
