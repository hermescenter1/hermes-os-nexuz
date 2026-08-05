import { describe, it, expect, beforeEach } from "vitest";
import { rotateRefreshToken } from "@/lib/auth/token-session";
import {
  revokeAllOtherSessionsAtomically,
  isSessionActive,
  revokeSession,
  revokeAllSessions,
} from "@/lib/auth/session-store";
import { hashRefreshToken } from "@/lib/auth/jwt-server";
import {
  PG_ENABLED, client, reset, mkUser, mkRefresh,
  userGeneration, rowById, unrevokedUnexpired,
} from "./pg-helpers";

/**
 * PHASE 91 — real PostgreSQL proof of the security-sensitive session
 * transactions. Real Prisma client, real transactions, no mocks. Every
 * assertion is queried back from PostgreSQL after the operation. Correct under
 * PostgreSQL default READ COMMITTED because every security mutation is a
 * conditional (compare-and-set) update whose affected-row count is asserted.
 */
describe.skipIf(!PG_ENABLED)("Phase 91 PG — session lifecycle transactions", () => {
  beforeEach(reset);

  it("real concurrent refresh replay: exactly one successor, old revoked, no duplicate/sid-less successor", async () => {
    const u = await mkUser("replay");
    const { plain } = await mkRefresh({ userId: u, gen: 0 });

    const settled = await Promise.allSettled([
      rotateRefreshToken(plain),
      rotateRefreshToken(plain),
    ]);
    const values = settled.map((s) => (s.status === "fulfilled" ? s.value : { ok: false as const, error: "threw" }));
    const successes = values.filter((v) => v.ok);
    const rejects = values.filter((v) => !v.ok);

    expect(successes).toHaveLength(1);   // SUCCESS_COUNT=1
    expect(rejects).toHaveLength(1);     // REJECTED_COUNT=1

    // OLD_TOKEN_REVOKED
    const db = await client();
    const old = await db.$queryRawUnsafe<{ revokedAt: Date | null }[]>(
      `SELECT "revokedAt" FROM "RefreshToken" WHERE "tokenHash"=$1`, hashRefreshToken(plain),
    );
    expect(old[0].revokedAt).not.toBeNull();

    // ACTIVE_SUCCESSOR_COUNT=1, SUCCESSOR_HAS_SID, generation equals user, no duplicate, no sid-less
    const active = await unrevokedUnexpired(u);
    expect(active).toHaveLength(1);                       // exactly one successor active
    const gen = await userGeneration(u);
    expect(Number(active[0].userTokenVersion)).toBe(gen); // SUCCESSOR_GENERATION_EQUALS_USER
    expect(active[0].id).toBeTruthy();                    // SUCCESSOR_HAS_SID (row id = sid)
    const success = successes[0] as { ok: true; sid: string };
    expect(success.sid).toBe(String(active[0].id));       // DUPLICATE_SUCCESSOR_COUNT=0
  });

  it("real transaction rollback: a forced successor-insert failure leaves the old refresh valid, no successor", async () => {
    const u = await mkUser("rollback");
    const { plain } = await mkRefresh({ userId: u, gen: 0 });
    const db = await client();

    // Force the successor INSERT to fail INSIDE the real transaction via a
    // temporary trigger. Integration-test-only; dropped immediately after.
    await db.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION phase91_block_insert() RETURNS trigger AS $BODY$ BEGIN RAISE EXCEPTION 'phase91-forced-failure'; END; $BODY$ LANGUAGE plpgsql`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER phase91_block BEFORE INSERT ON "RefreshToken" FOR EACH ROW EXECUTE FUNCTION phase91_block_insert()`,
    );

    let result: Awaited<ReturnType<typeof rotateRefreshToken>>;
    try {
      result = await rotateRefreshToken(plain);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS phase91_block ON "RefreshToken"`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS phase91_block_insert()`);
    }

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("persist-failed"); // ROTATION_RESULT=persist-failed

    // OLD_REFRESH_REVOKED=False (whole tx rolled back)
    const old = await db.$queryRawUnsafe<{ revokedAt: Date | null }[]>(
      `SELECT "revokedAt" FROM "RefreshToken" WHERE "tokenHash"=$1`, hashRefreshToken(plain),
    );
    expect(old[0].revokedAt).toBeNull();

    // SUCCESSOR_COUNT=0
    const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::int AS n FROM "RefreshToken" WHERE "userId"=$1`, u,
    );
    expect(Number(rows[0].n)).toBe(1); // only the original

    // OLD_REFRESH_STILL_VALID: it rotates successfully now that the trigger is gone
    const retry = await rotateRefreshToken(plain);
    expect(retry.ok).toBe(true);
  });

  it("revoke-others ordering 1 (non-kept refresh BEFORE revoke): the successor's old generation is dead", async () => {
    const u = await mkUser("ord1");
    const stranger = await mkUser("ord1-stranger");
    const strangerSession = await mkRefresh({ userId: stranger, gen: 0 });
    const keep = await mkRefresh({ userId: u, gen: 0 });
    const other = await mkRefresh({ userId: u, gen: 0 });

    // Non-kept refresh completes first → successor stamped at generation 0.
    const rot = await rotateRefreshToken(other.plain);
    expect(rot.ok).toBe(true);
    const otherSuccessorSid = (rot as { ok: true; sid: string }).sid;

    const rev = await revokeAllOtherSessionsAtomically(u, keep.sid);
    expect(rev.ok).toBe(true);

    expect(await isSessionActive(keep.sid)).toBe(true);            // KEPT_SESSION_REVOKED=False
    expect(await isSessionActive(otherSuccessorSid)).toBe(false);  // old-gen successor dead
    // KEPT_SESSION_GENERATION_EQUALS_USER
    const keptRow = await rowById(keep.sid);
    expect(Number(keptRow?.userTokenVersion)).toBe(await userGeneration(u));
    // OTHER_ACTIVE_SESSION_COUNT=0 and OLD_GENERATION_ACTIVE_SESSION_COUNT=0
    const active = await unrevokedUnexpired(u);
    for (const r of active) {
      if (String(r.id) !== keep.sid) expect(await isSessionActive(String(r.id))).toBe(false);
    }
    // CROSS_USER_ROWS_CHANGED=0
    expect(await isSessionActive(strangerSession.sid)).toBe(true);
    expect(await userGeneration(stranger)).toBe(0);
  });

  it("revoke-others ordering 2 (revoke advances generation BEFORE the non-kept refresh): the refresh is rejected", async () => {
    const u = await mkUser("ord2");
    const keep = await mkRefresh({ userId: u, gen: 0 });
    const other = await mkRefresh({ userId: u, gen: 0 });

    const rev = await revokeAllOtherSessionsAtomically(u, keep.sid);
    expect(rev.ok).toBe(true);

    // The non-kept token is now revoked + at the old generation → rotation fails.
    const rot = await rotateRefreshToken(other.plain);
    expect(rot.ok).toBe(false);

    expect(await isSessionActive(keep.sid)).toBe(true);
    const active = await unrevokedUnexpired(u);
    for (const r of active) {
      if (String(r.id) !== keep.sid) expect(await isSessionActive(String(r.id))).toBe(false);
    }
  });

  it("kept-session concurrently revoked FIRST → revoke-others is kept_invalid and the generation is NOT advanced", async () => {
    const u = await mkUser("kept-det");
    const keep = await mkRefresh({ userId: u, gen: 0 });
    const other = await mkRefresh({ userId: u, gen: 0 });

    // Deterministic: revoke the kept session, THEN attempt revoke-others.
    await revokeSession(u, keep.sid);
    const rev = await revokeAllOtherSessionsAtomically(u, keep.sid);

    expect(rev.ok).toBe(false);
    if (!rev.ok) expect(rev.error).toBe("kept_invalid");
    expect(await userGeneration(u)).toBe(0);                 // generation NOT partially advanced
    // The other session was NOT revoked (whole op rolled back).
    expect(await isSessionActive(other.sid)).toBe(true);
    // The kept session stays revoked — never resurrected.
    const keptRow = await rowById(keep.sid);
    expect(keptRow?.revokedAt).not.toBeNull();
  });

  it("kept-session concurrent revoke (true race) never resurrects the kept session", async () => {
    const u = await mkUser("kept-race");
    const keep = await mkRefresh({ userId: u, gen: 0 });
    await mkRefresh({ userId: u, gen: 0 });

    const [revRes, killRes] = await Promise.allSettled([
      revokeAllOtherSessionsAtomically(u, keep.sid),
      revokeSession(u, keep.sid),
    ]);
    const killed = revRes && killRes.status === "fulfilled" ? killRes.value : false;

    // Invariant: if the kept session was revoked, it is NOT active afterwards
    // (no resurrection). If revoke-others succeeded, it did so on a still-active
    // kept row (its conditional move required revokedAt IS NULL).
    const keptRow = await rowById(keep.sid);
    if (killed === true || keptRow?.revokedAt) {
      expect(await isSessionActive(keep.sid)).toBe(false);
    }
    // No contradiction is possible: a revoked row is never reported active.
    if (keptRow?.revokedAt) expect(await isSessionActive(keep.sid)).toBe(false);
  });

  it("kill-switch dominance: a refresh racing a tokenVersion bump leaves NO active session at the old generation", async () => {
    const u = await mkUser("kill", 0);
    const { plain } = await mkRefresh({ userId: u, gen: 0 });

    await Promise.allSettled([
      rotateRefreshToken(plain),
      revokeAllSessions(u), // password-reset / suspension equivalent (bumps generation + revokes)
    ]);

    const gen = await userGeneration(u);
    expect(gen).toBeGreaterThanOrEqual(1); // kill-switch advanced the generation

    // ACTIVE_SESSION_WITH_OLD_GENERATION=0 — every session isSessionActive() accepts
    // must be at the current generation; anything at an older generation is dead.
    const rows = await unrevokedUnexpired(u);
    for (const r of rows) {
      const active = await isSessionActive(String(r.id));
      if (active) expect(Number(r.userTokenVersion)).toBe(gen);
      if (Number(r.userTokenVersion) < gen) expect(active).toBe(false);
    }
  });
});
