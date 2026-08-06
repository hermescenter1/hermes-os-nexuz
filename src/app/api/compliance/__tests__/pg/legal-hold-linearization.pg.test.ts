import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import {
  editLegalHoldForOrg, transitionLegalHoldForOrg, type HoldExpectedSnapshot,
} from "@/lib/compliance/incident-db";

/**
 * Phase 97 — REAL-PostgreSQL rehearsal for GENERIC LegalHold mutation linearization
 * (editLegalHoldForOrg + transitionLegalHoldForOrg). Proves, against the ACTUAL DB and
 * the ACTUAL persistence functions, that every material/review edit and every
 * non-incident lifecycle transition:
 *   - re-reads + revalidates the authoritative row under a SELECT ... FOR UPDATE lock
 *     (stale snapshot → HOLD_CHANGED_RETRY; no lost update / stale-snapshot write);
 *   - decides mutability + the transition from the LOCKED status only;
 *   - captures the committed evidence time from clock_timestamp() AFTER the lock;
 *   - reports the EXACT fieldsWritten;
 * using DETERMINISTIC held-lock barriers (both orderings) across pooled connections —
 * no Promise.all luck, sleep only proves an op is blocked behind an already-held lock.
 *
 * The Incident-ordered path (applyIncidentScopedHoldTransition, CLOSED-parent rejection)
 * is exercised by incidents.pg.test.ts and remains unchanged.
 */
const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const TAG = "pglh97lin";
const ORG = `${TAG}-orgA`, ORG_B = `${TAG}-orgB`;
const ACTOR = "u1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Tx = {
  $executeRawUnsafe: (s: string, ...a: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T = unknown>(s: string, ...a: unknown[]) => Promise<T>;
  $transaction: <T>(fn: (tx: Tx) => Promise<T>, o?: { timeout?: number; maxWait?: number }) => Promise<T>;
};
async function db(): Promise<Tx> { const p = await getPrisma(); if (!p) throw new Error("PG rehearsal requires a real Prisma client"); return p as unknown as Tx; }

async function clearHolds() {
  const p = await db();
  await p.$executeRawUnsafe(`DELETE FROM "LegalHold" WHERE "organizationId" LIKE '${TAG}%'`);
}
async function cleanup() {
  await clearHolds();
  const p = await db();
  await p.$executeRawUnsafe(`DELETE FROM "Organization" WHERE id LIKE '${TAG}%'`);
}

type InsOpts = { org?: string; subjectId?: string | null; reviewDate?: boolean };
async function insHold(id: string, status = "PROPOSED", scopeType = "ORGANIZATION", opts: InsOpts = {}) {
  const p = await db();
  await p.$executeRawUnsafe(
    `INSERT INTO "LegalHold"
       (id,"organizationId",name,"reasonClass","scopeType","subjectId",status,"approvedBy","approvedAt","reviewDate","updatedAt")
     VALUES ($1,$2,$3,'REVIEW_REQUIRED',$4,$5,$6,$7,$8,$9,now())`,
    id, opts.org ?? ORG, `${TAG}-${id}`, scopeType, opts.subjectId ?? null,
    status, status === "ACTIVE" ? "seed" : null, status === "ACTIVE" ? new Date() : null,
    opts.reviewDate ? new Date() : null,
  );
}
async function snap(id: string): Promise<HoldExpectedSnapshot> {
  const p = await db();
  const r = await p.$queryRawUnsafe<HoldExpectedSnapshot[]>(
    `SELECT status,"scopeType","incidentId","updatedAt" FROM "LegalHold" WHERE id=$1`, id);
  return r[0];
}
async function field(id: string, col: string): Promise<unknown> {
  const p = await db();
  const r = await p.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT "${col}" AS v FROM "LegalHold" WHERE id=$1`, id);
  return r[0]?.v ?? null;
}
const statusOf = (id: string) => field(id, "status") as Promise<string>;

/** txA holds the HOLD row lock, performs `first` (committing on tx end) while op B blocks
 *  on the same lock; returns B's result after A commits. */
async function holdBarrier<T>(holdId: string, first: (txA: Tx) => Promise<void>, opB: () => Promise<T>): Promise<T> {
  const p = await db();
  let res: T | null = null; let done = false; let opP: Promise<void> | null = null;
  await p.$transaction(async (txA) => {
    await txA.$queryRawUnsafe(`SELECT "id" FROM "LegalHold" WHERE "id"=$1 AND "organizationId"=$2 FOR UPDATE`, holdId, ORG);
    opP = opB().then((r) => { res = r; done = true; });
    await sleep(500);
    expect(done).toBe(false); // op B is provably blocked on the hold lock
    await first(txA);          // commit the "first" mutation on tx end
  }, { timeout: 20000, maxWait: 20000 });
  await opP;
  return res as T;
}

it("integration database is configured (guards against a silent all-skip pass)", () => { expect(PG_ENABLED).toBe(true); });

describe.skipIf(!PG_ENABLED)("Phase 97 — generic LegalHold linearization (real PG)", () => {
  beforeAll(async () => {
    await cleanup();
    const p = await db();
    for (const org of [ORG, ORG_B]) await p.$executeRawUnsafe(`INSERT INTO "Organization" (id,name,slug,settings,"createdAt","updatedAt") VALUES ($1,'O',$2,'{}'::jsonb,now(),now())`, org, `${org}-slug`);
  });
  afterAll(cleanup);
  beforeEach(clearHolds);

  // ── Post-lock authoritative time ────────────────────────────────────────────
  it("BARRIER — committed LegalHold evidence time is captured AFTER lock acquisition", async () => {
    await insHold(`${TAG}-pt`, "PROPOSED");
    const s = await snap(`${TAG}-pt`);
    const p = await db();
    const routeEntry = Date.now();
    let res: Awaited<ReturnType<typeof transitionLegalHoldForOrg>> | null = null;
    let opP: Promise<void> | null = null;
    await p.$transaction(async (txA) => {
      await txA.$queryRawUnsafe(`SELECT "id" FROM "LegalHold" WHERE "id"=$1 AND "organizationId"=$2 FOR UPDATE`, `${TAG}-pt`, ORG);
      opP = transitionLegalHoldForOrg({ holdId: `${TAG}-pt`, organizationId: ORG, actorId: ACTOR, toStatus: "ACTIVE", expected: s }).then((r) => { res = r; });
      await sleep(700); // holds the lock past route entry; the op is provably blocked
      expect(res).toBeNull();
    }, { timeout: 20000, maxWait: 20000 });
    await opP;
    expect(res!.ok).toBe(true);
    const updatedAt = new Date(await field(`${TAG}-pt`, "updatedAt") as string).getTime();
    const approvedAt = new Date(await field(`${TAG}-pt`, "approvedAt") as string).getTime();
    expect(updatedAt - routeEntry).toBeGreaterThan(400); // captured after the ~700ms lock wait
    expect(updatedAt).toBe(approvedAt);                  // both from the SAME post-lock clock_timestamp()
  });

  // ── Material edit vs activation (both orderings) ────────────────────────────
  it("MATERIAL_ACTIVATION_ORDER_A — activation commits first → stale material edit fails, ACTIVE fields unchanged", async () => {
    await insHold(`${TAG}-ma`, "PROPOSED");
    const s0 = await snap(`${TAG}-ma`);
    const res = await holdBarrier(`${TAG}-ma`,
      (txA) => txA.$executeRawUnsafe(`UPDATE "LegalHold" SET status='ACTIVE',"approvedBy"='a',"approvedAt"=clock_timestamp(),"startDate"=clock_timestamp(),"updatedAt"=clock_timestamp() WHERE id=$1`, `${TAG}-ma`) as unknown as Promise<void>,
      () => editLegalHoldForOrg({ holdId: `${TAG}-ma`, organizationId: ORG, actorId: ACTOR, expected: s0, edit: { name: "STALE-RENAME" } }));
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe("HOLD_CHANGED_RETRY");
    expect(await statusOf(`${TAG}-ma`)).toBe("ACTIVE");
    expect(await field(`${TAG}-ma`, "name")).toBe(`${TAG}-${TAG}-ma`); // material edit never applied
  });

  it("MATERIAL_ACTIVATION_ORDER_B — material edit commits first → stale activation HOLD_CHANGED_RETRY; fresh activation succeeds", async () => {
    await insHold(`${TAG}-mb`, "PROPOSED");
    const s0 = await snap(`${TAG}-mb`);
    const res = await holdBarrier(`${TAG}-mb`,
      (txA) => txA.$executeRawUnsafe(`UPDATE "LegalHold" SET name='EDITED',"updatedAt"=clock_timestamp() WHERE id=$1`, `${TAG}-mb`) as unknown as Promise<void>,
      () => transitionLegalHoldForOrg({ holdId: `${TAG}-mb`, organizationId: ORG, actorId: ACTOR, toStatus: "ACTIVE", expected: s0 }));
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe("HOLD_CHANGED_RETRY");
    expect(await statusOf(`${TAG}-mb`)).toBe("PROPOSED"); // stale activation did not commit
    const fresh = await transitionLegalHoldForOrg({ holdId: `${TAG}-mb`, organizationId: ORG, actorId: ACTOR, toStatus: "ACTIVE", expected: await snap(`${TAG}-mb`) });
    expect(fresh.ok).toBe(true);
    expect(await statusOf(`${TAG}-mb`)).toBe("ACTIVE");
  });

  // ── ACTIVE reviewDate edit vs release (both orderings) ──────────────────────
  it("REVIEW_RELEASE_ORDER_A — release commits first → stale review edit fails, RELEASED immutable", async () => {
    await insHold(`${TAG}-ra`, "ACTIVE");
    const s0 = await snap(`${TAG}-ra`);
    const res = await holdBarrier(`${TAG}-ra`,
      (txA) => txA.$executeRawUnsafe(`UPDATE "LegalHold" SET status='RELEASED',"releaseApprovedBy"='a',"releasedAt"=clock_timestamp(),"updatedAt"=clock_timestamp() WHERE id=$1`, `${TAG}-ra`) as unknown as Promise<void>,
      () => editLegalHoldForOrg({ holdId: `${TAG}-ra`, organizationId: ORG, actorId: ACTOR, expected: s0, edit: { reviewDate: new Date() } }));
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe("HOLD_CHANGED_RETRY");
    expect(await statusOf(`${TAG}-ra`)).toBe("RELEASED");
    expect(await field(`${TAG}-ra`, "reviewDate")).toBeNull(); // stale review edit never applied
  });

  it("REVIEW_RELEASE_ORDER_B — review edit commits first → stale release HOLD_CHANGED_RETRY; fresh release succeeds", async () => {
    await insHold(`${TAG}-rb`, "ACTIVE");
    const s0 = await snap(`${TAG}-rb`);
    const res = await holdBarrier(`${TAG}-rb`,
      (txA) => txA.$executeRawUnsafe(`UPDATE "LegalHold" SET "reviewDate"=clock_timestamp(),"updatedAt"=clock_timestamp() WHERE id=$1`, `${TAG}-rb`) as unknown as Promise<void>,
      () => transitionLegalHoldForOrg({ holdId: `${TAG}-rb`, organizationId: ORG, actorId: ACTOR, toStatus: "RELEASED", expected: s0 }));
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe("HOLD_CHANGED_RETRY");
    expect(await statusOf(`${TAG}-rb`)).toBe("ACTIVE");
    const fresh = await transitionLegalHoldForOrg({ holdId: `${TAG}-rb`, organizationId: ORG, actorId: ACTOR, toStatus: "RELEASED", expected: await snap(`${TAG}-rb`) });
    expect(fresh.ok).toBe(true);
    expect(await statusOf(`${TAG}-rb`)).toBe("RELEASED");
  });

  // ── Non-incident activation vs cancellation (both orderings) ────────────────
  it("ACTIVATION_CANCELLATION_ORDER_A — activation commits first → cancellation fails (one edge from a shared PROPOSED snapshot)", async () => {
    await insHold(`${TAG}-aca`, "PROPOSED");
    const s0 = await snap(`${TAG}-aca`);
    const res = await holdBarrier(`${TAG}-aca`,
      (txA) => txA.$executeRawUnsafe(`UPDATE "LegalHold" SET status='ACTIVE',"approvedBy"='a',"approvedAt"=clock_timestamp(),"startDate"=clock_timestamp(),"updatedAt"=clock_timestamp() WHERE id=$1`, `${TAG}-aca`) as unknown as Promise<void>,
      () => transitionLegalHoldForOrg({ holdId: `${TAG}-aca`, organizationId: ORG, actorId: ACTOR, toStatus: "CANCELLED", expected: s0 }));
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe("HOLD_CHANGED_RETRY");
    expect(await statusOf(`${TAG}-aca`)).toBe("ACTIVE"); // exactly one transition committed
  });

  it("ACTIVATION_CANCELLATION_ORDER_B — cancellation commits first → activation fails", async () => {
    await insHold(`${TAG}-acb`, "PROPOSED");
    const s0 = await snap(`${TAG}-acb`);
    const res = await holdBarrier(`${TAG}-acb`,
      (txA) => txA.$executeRawUnsafe(`UPDATE "LegalHold" SET status='CANCELLED',"cancelledBy"='a',"cancelledAt"=clock_timestamp(),"updatedAt"=clock_timestamp() WHERE id=$1`, `${TAG}-acb`) as unknown as Promise<void>,
      () => transitionLegalHoldForOrg({ holdId: `${TAG}-acb`, organizationId: ORG, actorId: ACTOR, toStatus: "ACTIVE", expected: s0 }));
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe("HOLD_CHANGED_RETRY");
    expect(await statusOf(`${TAG}-acb`)).toBe("CANCELLED"); // exactly one transition committed
  });

  // ── Duplicate activation linearization ──────────────────────────────────────
  it("DUPLICATE_ACTIVATION_LINEARIZATION — a second activation over a committed one cannot double-commit", async () => {
    await insHold(`${TAG}-dup`, "PROPOSED");
    const s0 = await snap(`${TAG}-dup`);
    // First activation commits inside the barrier; the governed second activation (same
    // PROPOSED snapshot) blocks, then observes ACTIVE and refuses (exactly one commits).
    const res = await holdBarrier(`${TAG}-dup`,
      (txA) => txA.$executeRawUnsafe(`UPDATE "LegalHold" SET status='ACTIVE',"approvedBy"='first',"approvedAt"=clock_timestamp(),"startDate"=clock_timestamp(),"updatedAt"=clock_timestamp() WHERE id=$1`, `${TAG}-dup`) as unknown as Promise<void>,
      () => transitionLegalHoldForOrg({ holdId: `${TAG}-dup`, organizationId: ORG, actorId: ACTOR, toStatus: "ACTIVE", expected: s0 }));
    expect(res.ok).toBe(false); if (!res.ok) expect(res.reason).toBe("HOLD_CHANGED_RETRY");
    expect(await statusOf(`${TAG}-dup`)).toBe("ACTIVE");
    expect(await field(`${TAG}-dup`, "approvedBy")).toBe("first"); // the second never overwrote attribution
  });

  // ── Exact fieldsWritten + focused rejections (no barrier) ────────────────────
  it("exact fieldsWritten for each governed mutation", async () => {
    await insHold(`${TAG}-fw`, "PROPOSED");
    const act = await transitionLegalHoldForOrg({ holdId: `${TAG}-fw`, organizationId: ORG, actorId: ACTOR, toStatus: "ACTIVE", expected: await snap(`${TAG}-fw`) });
    expect(act.ok).toBe(true);
    if (act.ok) expect(act.fieldsWritten).toEqual(["approvedAt", "approvedBy", "startDate", "status", "updatedAt", "updatedBy"]);
    const edit = await editLegalHoldForOrg({ holdId: `${TAG}-fw`, organizationId: ORG, actorId: ACTOR, expected: await snap(`${TAG}-fw`), edit: { reviewDate: new Date() } });
    expect(edit.ok).toBe(true);
    if (edit.ok) expect(edit.fieldsWritten).toEqual(["reviewDate", "updatedAt", "updatedBy"]);
    const rel = await transitionLegalHoldForOrg({ holdId: `${TAG}-fw`, organizationId: ORG, actorId: ACTOR, toStatus: "RELEASED", expected: await snap(`${TAG}-fw`) });
    expect(rel.ok).toBe(true);
    if (rel.ok) expect(rel.fieldsWritten).toEqual(["releaseApprovedBy", "releasedAt", "status", "updatedAt", "updatedBy"]);
  });

  it("terminal row mutation is refused under lock (TERMINAL_HOLD_MUTATION=0)", async () => {
    await insHold(`${TAG}-tr`, "RELEASED");
    const s = await snap(`${TAG}-tr`);
    const e = await editLegalHoldForOrg({ holdId: `${TAG}-tr`, organizationId: ORG, actorId: ACTOR, expected: s, edit: { reviewDate: new Date() } });
    expect(e.ok).toBe(false); if (!e.ok) expect(e.reason).toBe("HOLD_IMMUTABLE");
    const t = await transitionLegalHoldForOrg({ holdId: `${TAG}-tr`, organizationId: ORG, actorId: ACTOR, toStatus: "ACTIVE", expected: s });
    expect(t.ok).toBe(false); if (!t.ok) expect(t.reason).toBe("INVALID_HOLD_TRANSITION");
    expect(await statusOf(`${TAG}-tr`)).toBe("RELEASED");
  });

  it("an out-of-order transition is refused on the LOCKED status (INVALID_HOLD_TRANSITION)", async () => {
    await insHold(`${TAG}-oo`, "PROPOSED");
    const r = await transitionLegalHoldForOrg({ holdId: `${TAG}-oo`, organizationId: ORG, actorId: ACTOR, toStatus: "RELEASED", expected: await snap(`${TAG}-oo`) });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe("INVALID_HOLD_TRANSITION");
    expect(await statusOf(`${TAG}-oo`)).toBe("PROPOSED");
  });

  it("activation of an incomplete locked scope is refused (INVALID_LEGAL_HOLD_ACTIVATION)", async () => {
    await insHold(`${TAG}-sc`, "PROPOSED", "SUBJECT", { subjectId: null }); // SUBJECT without subjectId
    const r = await transitionLegalHoldForOrg({ holdId: `${TAG}-sc`, organizationId: ORG, actorId: ACTOR, toStatus: "ACTIVE", expected: await snap(`${TAG}-sc`) });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe("INVALID_LEGAL_HOLD_ACTIVATION");
    expect(await statusOf(`${TAG}-sc`)).toBe("PROPOSED");
  });

  it("a locked candidate scope edit is revalidated fail-closed (INVALID_SCOPE), else normalized", async () => {
    // A leftover old target contradicts a new scope type → fail-closed under lock.
    await insHold(`${TAG}-cf`, "PROPOSED", "SUBJECT", { subjectId: "s1" });
    const contradictory = await editLegalHoldForOrg({ holdId: `${TAG}-cf`, organizationId: ORG, actorId: ACTOR, expected: await snap(`${TAG}-cf`), edit: { scopeType: "RESOURCE_TYPE", resourceType: "case" } });
    expect(contradictory.ok).toBe(false); if (!contradictory.ok) expect(contradictory.reason).toBe("INVALID_SCOPE");
    expect(await field(`${TAG}-cf`, "scopeType")).toBe("SUBJECT");

    // From a clean base (ORGANIZATION) an incomplete change fails, a complete one normalizes.
    await insHold(`${TAG}-ce`, "PROPOSED", "ORGANIZATION");
    const bad = await editLegalHoldForOrg({ holdId: `${TAG}-ce`, organizationId: ORG, actorId: ACTOR, expected: await snap(`${TAG}-ce`), edit: { scopeType: "SUBJECT" } });
    expect(bad.ok).toBe(false); if (!bad.ok) expect(bad.reason).toBe("INVALID_SCOPE"); // missing subjectId
    expect(await field(`${TAG}-ce`, "scopeType")).toBe("ORGANIZATION");
    const ok = await editLegalHoldForOrg({ holdId: `${TAG}-ce`, organizationId: ORG, actorId: ACTOR, expected: await snap(`${TAG}-ce`), edit: { scopeType: "SUBJECT", subjectId: "s1" } });
    expect(ok.ok).toBe(true);
    expect(await field(`${TAG}-ce`, "scopeType")).toBe("SUBJECT");
    expect(await field(`${TAG}-ce`, "subjectId")).toBe("s1");
  });

  it("the generic path refuses to activate/release an INCIDENT-scoped hold", async () => {
    // An INCIDENT-scoped hold must go through the incident-ordered path only. incidentId
    // stays NULL here (the composite FK is only enforced when non-null), which is enough:
    // the generic refusal keys on scopeType, ahead of scope validation.
    await insHold(`${TAG}-inc`, "PROPOSED", "INCIDENT");
    const r = await transitionLegalHoldForOrg({ holdId: `${TAG}-inc`, organizationId: ORG, actorId: ACTOR, toStatus: "ACTIVE", expected: await snap(`${TAG}-inc`) });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe("INVALID_HOLD_TRANSITION");
    expect(await statusOf(`${TAG}-inc`)).toBe("PROPOSED");
  });

  it("tenant-scoped not-found — a foreign org never matches the hold", async () => {
    await insHold(`${TAG}-tn`, "PROPOSED");
    const s = await snap(`${TAG}-tn`);
    const e = await editLegalHoldForOrg({ holdId: `${TAG}-tn`, organizationId: ORG_B, actorId: ACTOR, expected: s, edit: { name: "X" } });
    expect(e.ok).toBe(false); if (!e.ok) expect(e.reason).toBe("NOT_FOUND");
    const t = await transitionLegalHoldForOrg({ holdId: `${TAG}-tn`, organizationId: ORG_B, actorId: ACTOR, toStatus: "ACTIVE", expected: s });
    expect(t.ok).toBe(false); if (!t.ok) expect(t.reason).toBe("NOT_FOUND");
    expect(await statusOf(`${TAG}-tn`)).toBe("PROPOSED");
  });
});
