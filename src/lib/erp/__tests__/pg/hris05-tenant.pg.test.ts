import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import { addTeamMember, createTeam, listMemberCandidates, listTeamMembers, listTeams, removeTeamMember, updateTeam, type ErpCtx } from "@/lib/erp/db";
import { ErpError, type ErpScope } from "@/lib/erp/tenant";

/**
 * HRIS-0.5 — REAL PostgreSQL rehearsal of the ERP tenant boundary.
 *
 * Runs only against a disposable database that has every repository migration
 * applied (see vitest.hris05-postgres.config.ts). It proves what no in-memory
 * double can: the catalog constraints the migration declares, and the behaviour
 * of the production write functions when PostgreSQL enforces them.
 *
 * Every fixture is tagged with TAG so cleanup never touches other data.
 */

const TAG = "hris05pg";
const ORG_A = `${TAG}-org-a`;
const ORG_B = `${TAG}-org-b`;
const ORG_MISSING = `${TAG}-org-missing`;
const USER_OWNER_A = `${TAG}-user-owner-a`;
const USER_SUSPENDED_A = `${TAG}-user-suspended-a`;
const USER_ONLY_B = `${TAG}-user-only-b`;

type RawDb = {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T[]>;
};

async function raw(): Promise<RawDb> {
  const prisma = await getPrisma();
  if (!prisma) throw new Error("HRIS-0.5 PostgreSQL rehearsal requires HERMES_STORAGE_MODE=database and DATABASE_URL");
  return prisma as unknown as RawDb;
}

const scopeOf = (organizationId: string, userId: string, role: ErpScope["role"] = "OWNER"): ErpScope => ({
  userId,
  organizationId,
  memberId: `${TAG}-member-${organizationId}`,
  role,
  canViewCompensation: role === "OWNER",
});

let keySeq = 0;
/** A fresh, format-valid Idempotency-Key (>= 22 base64url characters) for every write. */
const freshKey = (): string => `${TAG}-key-${Date.now().toString(36)}-${(keySeq += 1).toString(36)}-abcdefgh`;

const ctxFor = (scope: ErpScope, idempotencyKey: string | null = null): ErpCtx => ({
  scope,
  correlationId: `${TAG}-corr`,
  idempotencyKey,
});

async function cleanup(): Promise<void> {
  const db = await raw();
  const like = `${TAG}%`;
  await db.$executeRawUnsafe(`DELETE FROM "ErpTeamMember" WHERE "organizationId" LIKE $1`, like);
  await db.$executeRawUnsafe(`DELETE FROM "ErpTeam" WHERE "organizationId" LIKE $1`, like);
  await db.$executeRawUnsafe(`DELETE FROM "IdempotencyKey" WHERE "organizationId" LIKE $1`, like);
  await db.$executeRawUnsafe(`DELETE FROM "ActiveOrganizationSelection" WHERE "organizationId" LIKE $1`, like);
  await db.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE "organizationId" LIKE $1`, like);
  await db.$executeRawUnsafe(`DELETE FROM "OrganizationMember" WHERE "organizationId" LIKE $1`, like);
  await db.$executeRawUnsafe(`DELETE FROM "Organization" WHERE id LIKE $1`, like);
  await db.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE $1`, like);
}

async function seed(): Promise<void> {
  const db = await raw();
  const now = new Date("2026-10-05T00:00:00Z");
  for (const org of [ORG_A, ORG_B]) {
    await db.$executeRawUnsafe(
      `INSERT INTO "Organization" (id, name, slug, "updatedAt") VALUES ($1, $2, $1, $3)`,
      org,
      `Rehearsal ${org}`,
      now,
    );
  }
  for (const user of [USER_OWNER_A, USER_SUSPENDED_A, USER_ONLY_B]) {
    await db.$executeRawUnsafe(
      `INSERT INTO "User" (id, name, email, "passwordHash", "updatedAt") VALUES ($1, $1, $2, 'not-a-login', $3)`,
      user,
      `${user}@rehearsal.invalid`,
      now,
    );
  }
  const member = async (id: string, organizationId: string, userId: string, role: string, status: string) =>
    db.$executeRawUnsafe(
      `INSERT INTO "OrganizationMember" (id, "organizationId", "userId", role, status, "updatedAt") VALUES ($1, $2, $3, $4::"OrgRole", $5::"MemberStatus", $6)`,
      id,
      organizationId,
      userId,
      role,
      status,
      now,
    );
  await member(`${TAG}-m-owner-a`, ORG_A, USER_OWNER_A, "OWNER", "ACTIVE");
  await member(`${TAG}-m-suspended-a`, ORG_A, USER_SUSPENDED_A, "ENGINEER", "SUSPENDED");
  await member(`${TAG}-m-only-b`, ORG_B, USER_ONLY_B, "OWNER", "ACTIVE");
}

const scopeA = scopeOf(ORG_A, USER_OWNER_A);
const scopeB = scopeOf(ORG_B, USER_ONLY_B);

beforeAll(async () => {
  if (process.env.HERMES_STORAGE_MODE !== "database" || !process.env.DATABASE_URL) {
    throw new Error("Refusing to run: set HERMES_STORAGE_MODE=database and DATABASE_URL to a disposable PostgreSQL 16 database.");
  }
  await cleanup();
  await seed();
});

afterAll(async () => {
  await cleanup();
});

describe("HRIS-0.5 PostgreSQL: the migration's declared constraints exist", () => {
  it("the team-membership composite foreign keys exist and the single-column teamId foreign key is gone", async () => {
    const db = await raw();
    const rows = await db.$queryRawUnsafe<{ conname: string; confdeltype: string }>(
      `SELECT conname, confdeltype::text AS confdeltype FROM pg_constraint WHERE conrelid = '"ErpTeamMember"'::regclass AND contype = 'f'`,
    );
    const byName = new Map(rows.map(r => [r.conname, r.confdeltype]));
    expect(byName.get("ErpTeamMember_organizationId_teamId_fkey")).toBe("c");
    expect(byName.get("ErpTeamMember_organizationId_userId_fkey")).toBe("r");
    expect(byName.has("ErpTeamMember_teamId_fkey")).toBe(false);
  });

  it("every ERP table carries an organization foreign key with ON DELETE RESTRICT", async () => {
    const db = await raw();
    const rows = await db.$queryRawUnsafe<{ tbl: string; confdeltype: string }>(
      `SELECT conrelid::regclass::text AS tbl, confdeltype::text AS confdeltype FROM pg_constraint
       WHERE contype = 'f' AND conname ~ '^Erp.*_organizationId_fkey$'`,
    );
    expect(rows).toHaveLength(16);
    expect(rows.filter(r => r.confdeltype !== "r")).toEqual([]);
  });

  it("the idempotency scope is one unique index over (organizationId, operation, keyHash)", async () => {
    const db = await raw();
    const rows = await db.$queryRawUnsafe<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'IdempotencyKey_organizationId_operation_keyHash_key'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain("UNIQUE INDEX");
    expect(rows[0].indexdef).toContain(`("organizationId", operation, "keyHash")`);
  });

  it("editable aggregates have a NOT NULL integer version defaulting to 1, and organizationId stays nullable (no backfill)", async () => {
    const db = await raw();
    const versioned = ["ErpProject", "ErpTask", "ErpTeam", "ErpResource", "ErpInventoryItem", "ErpWorkOrder", "ErpApprovalRequest"];
    const cols = await db.$queryRawUnsafe<{ table_name: string; column_name: string; is_nullable: string; column_default: string | null }>(
      `SELECT table_name, column_name, is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name IN ('version', 'organizationId') AND table_name LIKE 'Erp%'`,
    );
    for (const table of versioned) {
      const v = cols.find(c => c.table_name === table && c.column_name === "version");
      expect(v, `${table}.version`).toBeDefined();
      expect(v?.is_nullable).toBe("NO");
      expect(v?.column_default).toMatch(/^1\b/);
    }
    const orgCols = cols.filter(c => c.column_name === "organizationId");
    expect(orgCols.length).toBeGreaterThanOrEqual(16);
    expect(orgCols.filter(c => c.is_nullable !== "YES")).toEqual([]);
  });
});

describe("HRIS-0.5 PostgreSQL: tenant boundary and write discipline", () => {
  let teamA: string;
  let teamB: string;

  beforeAll(async () => {
    const a = await createTeam(ctxFor(scopeA, freshKey()), { name: "Team A" });
    const b = await createTeam(ctxFor(scopeB, freshKey()), { name: "Team B" });
    if (a.kind !== "created" || b.kind !== "created") throw new Error("fixture team was not created");
    teamA = a.value.id;
    teamB = b.value.id;
  });

  it("lists only the caller's organization", async () => {
    const page = await listTeams(ctxFor(scopeA), { limit: 50 });
    expect(page.items.map(t => t.id)).toContain(teamA);
    expect(page.items.map(t => t.id)).not.toContain(teamB);
  });

  it("a team of another organization is NOT_FOUND for an update and for a member add, and nothing changes", async () => {
    await expect(updateTeam(ctxFor(scopeA), teamB, { version: 1, name: "Hijacked" })).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(
      addTeamMember(ctxFor(scopeA, freshKey()), teamB, { userId: USER_OWNER_A, role: "member", availability: 100 }),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    const db = await raw();
    const name = await db.$queryRawUnsafe<{ name: string }>(`SELECT name FROM "ErpTeam" WHERE id = $1`, teamB);
    expect(name[0].name).toBe("Team B");
    const rows = await db.$queryRawUnsafe<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "ErpTeamMember" WHERE "teamId" = $1`, teamB);
    expect(rows[0].n).toBe(0);
  });

  it("a SUSPENDED member of this organization is refused (422) and the refusal leaves no key row behind", async () => {
    const key = freshKey();
    const dbBefore = await raw();
    const keysBeforeRows = await dbBefore.$queryRawUnsafe<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "IdempotencyKey" WHERE "organizationId" = $1`, ORG_A);
    const keysBefore = keysBeforeRows[0].n;
    await expect(
      addTeamMember(ctxFor(scopeA, key), teamA, { userId: USER_SUSPENDED_A, role: "member", availability: 100 }),
    ).rejects.toMatchObject({ status: 422, code: "MEMBER_NOT_IN_ORGANIZATION" });
    const db = await raw();
    const members = await db.$queryRawUnsafe<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "ErpTeamMember" WHERE "teamId" = $1`, teamA);
    expect(members[0].n).toBe(0);
    // The team fixture owns its own key row, so compare the count before and after the refused write.
    const keysAfter = await db.$queryRawUnsafe<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "IdempotencyKey" WHERE "organizationId" = $1`, ORG_A);
    expect(keysAfter[0].n).toBe(keysBefore);
  });

  it("a user who belongs only to another organization is refused (422) as a team member", async () => {
    await expect(
      addTeamMember(ctxFor(scopeA, freshKey()), teamA, { userId: USER_ONLY_B, role: "member", availability: 100 }),
    ).rejects.toMatchObject({ status: 422, code: "MEMBER_NOT_IN_ORGANIZATION" });
  });

  it("the same key with the same payload replays one team; the same key with another payload is refused (409)", async () => {
    const key = freshKey();
    const first = await createTeam(ctxFor(scopeA, key), { name: "Line 9" });
    const second = await createTeam(ctxFor(scopeA, key), { name: "Line 9" });
    expect(first.kind).toBe("created");
    expect(second.kind).toBe("replayed");
    expect(second.value?.id).toBe(first.kind === "created" ? first.value.id : null);

    await expect(createTeam(ctxFor(scopeA, key), { name: "Line 10" })).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_KEY_REUSED" });

    const db = await raw();
    const rows = await db.$queryRawUnsafe<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "ErpTeam" WHERE "organizationId" = $1 AND name = 'Line 9'`, ORG_A);
    expect(rows[0].n).toBe(1);
  });

  it("concurrent duplicates with one key create exactly one team", async () => {
    const key = freshKey();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => createTeam(ctxFor(scopeA, key), { name: "Race Team" })),
    );
    const outcomes = results.flatMap(r => (r.status === "fulfilled" ? [r.value] : []));
    // Every loser must resolve as a replay: a rejected duplicate is a bug, not a conflict.
    const failures = results.flatMap(r => (r.status === "rejected" ? [String((r.reason as { code?: unknown })?.code ?? "unknown")] : []));
    expect(failures).toEqual([]);
    expect(outcomes).toHaveLength(5);
    expect(outcomes.filter(o => o.kind === "created")).toHaveLength(1);
    const db = await raw();
    const rows = await db.$queryRawUnsafe<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "ErpTeam" WHERE "organizationId" = $1 AND name = 'Race Team'`, ORG_A);
    expect(rows[0].n).toBe(1);
  });

  it("a stale version is refused with 409 and the row keeps the winning write", async () => {
    const created = await createTeam(ctxFor(scopeA, freshKey()), { name: "Versioned" });
    if (created.kind !== "created") throw new Error("fixture team was not created");
    const id = created.value.id;
    const won = await updateTeam(ctxFor(scopeA), id, { version: 1, name: "Winner" });
    expect(won.version).toBe(2);
    await expect(updateTeam(ctxFor(scopeA), id, { version: 1, name: "Loser" })).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
    const db = await raw();
    const rows = await db.$queryRawUnsafe<{ name: string; version: number }>(`SELECT name, version FROM "ErpTeam" WHERE id = $1`, id);
    expect(rows[0]).toEqual({ name: "Winner", version: 2 });
  });

  it("a failing write rolls back the team AND its idempotency key in one transaction", async () => {
    const scopeMissing = scopeOf(ORG_MISSING, USER_OWNER_A);
    const key = freshKey();
    // The organization row does not exist, so the team insert violates its foreign key inside the transaction.
    await expect(createTeam(ctxFor(scopeMissing, key), { name: "Orphan" })).rejects.toBeDefined();
    const db = await raw();
    const teams = await db.$queryRawUnsafe<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "ErpTeam" WHERE "organizationId" = $1`, ORG_MISSING);
    const keys = await db.$queryRawUnsafe<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "IdempotencyKey" WHERE "organizationId" = $1`, ORG_MISSING);
    expect(teams[0].n).toBe(0);
    expect(keys[0].n).toBe(0);
  });

  it("refusals are ErpError values the routes can map to a stable code", async () => {
    try {
      await updateTeam(ctxFor(scopeB), teamA, { version: 1, name: "x" });
      throw new Error("expected a refusal");
    } catch (err) {
      expect(err).toBeInstanceOf(ErpError);
      expect((err as ErpError).status).toBe(404);
    }
  });

  it("member pages continue from the cursor on the real database, with no gap and no repeat", async () => {
    const db = await raw();
    const now = new Date("2026-10-06T00:00:00Z");
    const extra = `${TAG}-user-extra-a`;
    await db.$executeRawUnsafe(`INSERT INTO "User" (id, name, email, "passwordHash", "updatedAt") VALUES ($1, $1, $2, 'not-a-login', $3)`, extra, `${extra}@rehearsal.invalid`, now);
    await db.$executeRawUnsafe(
      `INSERT INTO "OrganizationMember" (id, "organizationId", "userId", role, status, "updatedAt") VALUES ($1, $2, $3, 'ENGINEER'::"OrgRole", 'ACTIVE'::"MemberStatus", $4)`,
      `${TAG}-m-extra-a`, ORG_A, extra, now,
    );
    const team = await createTeam(ctxFor(scopeA, freshKey()), { name: "Paging Team" });
    if (team.kind !== "created") throw new Error("fixture team was not created");
    await addTeamMember(ctxFor(scopeA, freshKey()), team.value.id, { userId: USER_OWNER_A, role: "lead", availability: 100 });
    await addTeamMember(ctxFor(scopeA, freshKey()), team.value.id, { userId: extra, role: "member", availability: 100 });

    const first = await listTeamMembers(ctxFor(scopeA), team.value.id, { limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.hasMore).toBe(true);
    const second = await listTeamMembers(ctxFor(scopeA), team.value.id, { limit: 1, cursor: first.nextCursor ?? undefined });
    expect(second.items).toHaveLength(1);
    expect(second.items[0].id).not.toBe(first.items[0].id);
    expect(second.hasMore).toBe(false);
  });

  it("removing a member is idempotent on the real database: the first call removes, the retry finds nothing and writes no second audit row", async () => {
    const db = await raw();
    const team = await createTeam(ctxFor(scopeA, freshKey()), { name: "Removal Team" });
    if (team.kind !== "created") throw new Error("fixture team was not created");
    await addTeamMember(ctxFor(scopeA, freshKey()), team.value.id, { userId: USER_OWNER_A, role: "member", availability: 100 });
    const auditBefore = (await db.$queryRawUnsafe<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "AuditLog" WHERE "organizationId" = $1 AND action = 'erp.team.member.remove'`, ORG_A))[0].n;
    await expect(removeTeamMember(ctxFor(scopeA), team.value.id, USER_OWNER_A)).resolves.toEqual({ removed: true });
    await expect(removeTeamMember(ctxFor(scopeA), team.value.id, USER_OWNER_A)).resolves.toEqual({ removed: false });
    const auditAfter = (await db.$queryRawUnsafe<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "AuditLog" WHERE "organizationId" = $1 AND action = 'erp.team.member.remove'`, ORG_A))[0].n;
    expect(auditAfter - auditBefore).toBe(1);
  });

  it("a team of another organization answers 404 to a removal, even for a member id that exists there", async () => {
    await expect(removeTeamMember(ctxFor(scopeB), teamA, USER_OWNER_A)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});

describe("HRIS-0.5 PostgreSQL: the add-member picker offers only real candidates", () => {
  it("offers ACTIVE members of this organization who are not in the team, and never a suspended, foreign or current member", async () => {
    const db = await raw();
    const now = new Date("2026-10-07T00:00:00Z");
    const picker = `${TAG}-user-picker-a`;
    await db.$executeRawUnsafe(
      `INSERT INTO "User" (id, name, email, "passwordHash", "updatedAt") VALUES ($1, $2, $3, 'not-a-login', $4)`,
      picker, "Picker Candidate", `${picker}@rehearsal.invalid`, now,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO "OrganizationMember" (id, "organizationId", "userId", role, status, "updatedAt") VALUES ($1, $2, $3, 'ENGINEER'::"OrgRole", 'ACTIVE'::"MemberStatus", $4)`,
      `${TAG}-m-picker-a`, ORG_A, picker, now,
    );
    const team = await createTeam(ctxFor(scopeA, freshKey()), { name: "Picker Team" });
    if (team.kind !== "created") throw new Error("fixture team was not created");
    await addTeamMember(ctxFor(scopeA, freshKey()), team.value.id, { userId: USER_OWNER_A, role: "lead", availability: 100 });

    const page = await listMemberCandidates(ctxFor(scopeA), team.value.id, { limit: 50 });
    const ids = page.items.map(c => c.userId);
    expect(ids).toContain(picker);
    expect(ids).not.toContain(USER_OWNER_A);
    expect(ids).not.toContain(USER_SUSPENDED_A);
    expect(ids).not.toContain(USER_ONLY_B);
    expect(page.items.find(c => c.userId === picker)).toMatchObject({ name: "Picker Candidate", email: `${picker}@rehearsal.invalid` });
  });

  it("search matches name or email case-insensitively, and an unmatched search is empty rather than everyone", async () => {
    const team = await createTeam(ctxFor(scopeA, freshKey()), { name: "Search Team" });
    if (team.kind !== "created") throw new Error("fixture team was not created");
    const byName = await listMemberCandidates(ctxFor(scopeA), team.value.id, { limit: 50, q: "PICKER candidate" });
    expect(byName.items.map(c => c.name)).toEqual(["Picker Candidate"]);
    const byEmail = await listMemberCandidates(ctxFor(scopeA), team.value.id, { limit: 50, q: `${TAG}-user-picker-a@REHEARSAL` });
    expect(byEmail.items.map(c => c.name)).toEqual(["Picker Candidate"]);
    const none = await listMemberCandidates(ctxFor(scopeA), team.value.id, { limit: 50, q: "no-such-person-anywhere" });
    expect(none).toEqual({ items: [], hasMore: false, nextCursor: null });
  });

  it("pages the candidates with hasMore and nextCursor, walking every candidate once", async () => {
    const team = await createTeam(ctxFor(scopeA, freshKey()), { name: "Walk Team" });
    if (team.kind !== "created") throw new Error("fixture team was not created");
    const all = await listMemberCandidates(ctxFor(scopeA), team.value.id, { limit: 100 });
    expect(all.items.length).toBeGreaterThanOrEqual(2);
    const walked: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 20; i += 1) {
      const page = await listMemberCandidates(ctxFor(scopeA), team.value.id, { limit: 1, cursor });
      walked.push(...page.items.map(c => c.userId));
      if (!page.hasMore) break;
      cursor = page.nextCursor ?? undefined;
    }
    expect(walked).toEqual(all.items.map(c => c.userId));
    expect(new Set(walked).size).toBe(walked.length);
  });

  it("another organization's team answers 404, and a cursor from another organization's list is refused (400)", async () => {
    const team = await createTeam(ctxFor(scopeA, freshKey()), { name: "Scope Team" });
    if (team.kind !== "created") throw new Error("fixture team was not created");
    await expect(listMemberCandidates(ctxFor(scopeB), team.value.id, { limit: 10 })).rejects.toMatchObject({ status: 404 });
    await expect(listMemberCandidates(ctxFor(scopeA), team.value.id, { limit: 10, cursor: `${TAG}-m-only-b` })).rejects.toMatchObject({ status: 400 });
  });
});
